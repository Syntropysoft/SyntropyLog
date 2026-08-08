# Bug hunt SyntropyLog — 2026-08-08

Tres bugs **confirmados** (reproducidos, no supuestos). Todos son **de librería**, no de
implementación del usuario. Metodología: nada se declara bug sin repro por la API pública.

| # | Severidad | Título | Estado | Componente |
|---|-----------|--------|--------|------------|
| 1 | 🔴 Crítica | Panic/abort del proceso al loguear texto no-ASCII largo | ✅ **FIX APLICADO + verificado** | `syntropylog-native` `truncate` |
| 2 | 🟠 Alta | Config nativo global rompe aislamiento multi-tenant → fuga PII | ✅ **fix INTERINO aplicado + verificado** (refactor pendiente) | `syntropylog-native` `NATIVE_CONFIG` |
| 3 | 🟠 Media | `MaskingEngine.process` muta el objeto del caller (camino JS) | ✅ **FIX APLICADO + verificado** | `src/masking/MaskingEngine.ts` |

**Cambios aplicados en esta sesión (sin commitear):**
- `syntropylog-native/src/lib.rs` — `truncate` char-boundary-safe (#1) + `configure_native` con
  guarda de config divergente (#2 interino) + 2 tests de regresión.
- `src/masking/MaskingEngine.ts` — masking copy-on-write no-mutante (#3) + docstrings corregidos.
- `tests/masking/MaskingEngine.test.ts` — 3 tests de regresión (no-mutación, DAG, ciclo).
- **Pendiente:** #2 refactor per-instance (ficha aparte) · #1 red de seguridad 4.3 · paridad truncado 4.4.

> ⚠️ Para reproducir #2 y #3 hace falta el `dist/` **recompilado desde el `src/` actual** (`pnpm build`
> en la raíz): el `dist/` que estaba en el árbol era **más viejo** que el código fuente (le faltaba
> `getNativeRules` y el masking spec-based). No es un bug en sí, pero es un aviso: el artefacto
> compilado versionado podía quedar por detrás del source.

---

# 🔴 BUG #1 (CRÍTICO) — Panic/abort del proceso al loguear texto no-ASCII largo (motor nativo)

> **Estado:** CONFIRMADO end-to-end + **FIX APLICADO Y VERIFICADO** (2026-08-08).
> **Componente:** `syntropylog-native` (Rust) — función `truncate`.
> **Severidad:** Crítica. Rompe la garantía central del framework: *"Failsafe — logging can't crash your app."*
> **Clase:** Bug **de librería**, no de implementación del usuario. Se dispara con el uso
> recomendado (`log.info({ campo }, 'msg')`).

---

## 1. Resumen ejecutivo

Loguear un objeto cuyo **valor de string** es texto no-ASCII (acentos, emojis, CJK, cirílico, URLs
percent-encoded, etc.) de **más de 300 bytes** puede **abortar el proceso Node con `SIGABRT`**.

- El `try/catch` de `Logger._log` / `SerializationManager.serializeDirect` **no lo atrapa**: no es
  una excepción JS, es un `abort()` del runtime de Rust cruzando el borde N-API.
- `process.on('uncaughtException')` **tampoco lo atrapa**.
- No requiere payload hostil: cualquier contenido de usuario en un idioma con caracteres multibyte
  (una descripción de producto en español, un nombre en japonés, un comentario con emoji) lo dispara.

El texto **corto** (< 300 bytes) es seguro. El texto **ASCII puro** de cualquier largo es seguro (el
byte de corte siempre cae en un límite de carácter). El problema aparece cuando se combinan:
**> 300 bytes** y **un carácter multibyte que cruza el byte de corte (índice 297).**

---

## 2. Causa raíz

`syntropylog-native/src/lib.rs`:

```rust
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {          // s.len() = longitud en BYTES
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])   // ← slice por BYTE, sin char boundary
    }
}
```

`max_len` es `maxStringLength` (default **300**, enviado por `configureNative`). Con `max_len = 300`,
el slice es `&s[..297]`. Si el byte 297 cae **dentro** de un carácter multibyte, Rust paniquea:

```
byte index 297 is not a char boundary; it is inside 'á' (bytes 296..298)
```

En un `cdylib` napi construido en release (`lto = true`, sin unwind tables utilizables), el panic no
puede desenrollarse y el runtime hace:

```
fatal runtime error: failed to initiate panic, error 5, aborting
```

→ el proceso termina con **exit code 134 (SIGABRT)**.

### Camino de llegada (por qué es alcanzable en uso normal)

```
log.info({ descripcion }, 'nuevo producto')
  → Logger._log  (src/logger/Logger.ts)
  → SerializationManager.serializeDirect(...)   (metadata = { descripcion })
  → native.fastSerializeFromJson(level, msg, ts, service, JSON.stringify(metadata))
  → [Rust] fast_serialize_from_json → mask_value(...)
        → rama String → MaskCtx::process_string(s)
        → process_string → truncate(&out, 300)   ← PANIC → abort
```

> **Nota:** el `message` (primer string) **no** pasa por `process_string` (se inserta tal cual en
> `build_log_line`). Por eso `log.info('msg largo con acentos…')` como **mensaje** no crashea; el que
> crashea es el texto largo que viaja como **valor de metadata** — es decir, el estilo PII-keyed
> recomendado (`log.info({ campo }, 'msg')`).

---

## 3. Reproducción

### 3.1 Unit test del crate (aísla el panic, sin napi)

Agregar temporalmente a `syntropylog-native/src/lib.rs` dentro de `mod tests`:

```rust
#[test]
fn temp_mask_value_realistic_configured_path() {
    let cfg = test_config(); // max_string_length=300, max_depth=10, sanitize=true
    let sensitive = HashSet::new();
    let ctx = MaskCtx { config: &cfg, sensitive_set: &sensitive,
                        redact_patterns: &[], masking_rules: &[] };
    let input = serde_json::json!({ "note": "é".repeat(200) }); // 400 bytes
    let _ = mask_value(&input, &ctx, 0);
}
```

```bash
cd syntropylog-native && cargo test temp_mask_value_realistic -- --nocapture
```

**Resultado:** `panicked at src/lib.rs:294:28: byte index 297 is not a char boundary`.

### 3.2 End-to-end por la API pública (el que importa)

Con `dist/` y el addon compilados (`pnpm build` en la raíz y en `syntropylog-native`):

```js
// e2e-crash.mjs
import { syntropyLog } from './dist/index.mjs';
await syntropyLog.init({ logger: { serviceName: 'crash-repro', level: 'info' } });
const log = syntropyLog.getLogger('repro');
console.log('native in use:', syntropyLog.isNativeAddonInUse()); // true
process.on('uncaughtException', (e) => console.log('uncaught CAUGHT:', e.message));

const descripcion = 'á'.repeat(200); // 400 bytes, no-ASCII
log.info({ descripcion }, 'nuevo producto');   // ← estilo recomendado
console.log('>>> SURVIVED <<<');               // ← nunca se imprime
await syntropyLog.shutdown();
```

```bash
node e2e-crash.mjs ; echo "EXIT: $?"
```

**Resultado observado:**

```
native in use: true
thread '<unnamed>' panicked at src/lib.rs:294:28:
byte index 297 is not a char boundary; it is inside 'á' (bytes 296..298) ...
fatal runtime error: failed to initiate panic, error 5, aborting
EXIT: 134            # SIGABRT — ni "uncaught CAUGHT" ni ">>> SURVIVED <<<" se imprimieron
```

---

## 4. Fix propuesto

### 4.1 Fix primario — truncado seguro por límite de carácter (obligatorio)

`syntropylog-native/src/lib.rs`:

```rust
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        return s.to_string();
    }
    // Retroceder el punto de corte hasta el límite de carácter UTF-8 más cercano ≤ (max_len-3).
    let mut end = max_len.saturating_sub(3);
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", &s[..end])
}
```

- `is_char_boundary` es O(1); el `while` retrocede a lo sumo 3 bytes (ancho máx. de un char UTF-8 − 1).
- Nunca paniquea.

**Test de regresión (agregar permanentemente):**

```rust
#[test]
fn truncate_never_panics_on_multibyte() {
    for s in ["é".repeat(200), "🚀".repeat(100), "日本語".repeat(120), "a".repeat(500)] {
        let out = truncate(&s, 300);
        assert!(out.len() <= 300);                 // respeta el cap
        assert!(out.is_char_boundary(out.len()));  // sigue siendo UTF-8 válido
    }
}
```

### 4.2 Auditar los demás cortes por byte

`truncate` es el único `&s[..]` por índice de byte en producción (verificado). `mask_chars` /
`mask_digits` operan sobre `Vec<char>` (seguros) y `split_kept_tail` usa `str::find` + `split_at`
(el índice de `find` siempre es límite de carácter). Aun así, **antes de cerrar**, correr:

```bash
rg '\&\w+\[\.\.' syntropylog-native/src   # cualquier slice de str por índice numérico
```

y confirmar que ninguno más pueda caer fuera de un char boundary.

### 4.3 Defensa en profundidad — que el nativo no pueda tumbar el proceso

Aunque 4.1 elimina *este* panic, la promesa "logging can't crash your app" exige que **ningún** panic
del motor nativo aborte el proceso. Hoy sí lo hace. Opciones (elegir según lo que permita el build):

- **Preferida:** envolver el cuerpo de cada `#[napi]` (`fast_serialize`, `fast_serialize_from_json`)
  en `std::panic::catch_unwind`; ante panic, devolver un string con el prefijo
  `[SYNTROPYLOG_NATIVE_ERROR]` (el lado JS ya lo trata como fallo → cae al pipeline JS). **Requiere**
  que el `cdylib` se compile con unwinding (sin `panic = "abort"` y con unwind tables), porque el
  abort observado (`failed to initiate panic`) indica que hoy el unwinding no está disponible —
  revisar `Cargo.toml`/flags del build de napi.
- Registrar un `panic::set_hook` que loguee a stderr de forma controlada (no cambia el abort, pero
  mejora el diagnóstico).

> El fix 4.1 es suficiente para cerrar el bug reportado. 4.3 es la red que evita que el próximo
> `unwrap`/slice olvidado vuelva a violar el failsafe.

### 4.4 Paridad JS ↔ Rust (verificar, no romper)

El truncado JS vive en el pipeline (`DataSanitizer`, `maxStringLength`) y usa operaciones seguras de
JS (nunca paniquea). Tras el fix, confirmar que para el mismo input el **output** de ambos motores
sigue coincidiendo (bytes/code-units vs chars puede diferir en el punto exacto de corte). Sugerido:
extender el fixture compartido con casos multibyte largos, o agregar un test de paridad específico de
truncado.

---

## 5. Impacto y workaround temporal

**Impacto:** cualquier servicio que loguee contenido de usuario multilingüe como metadata puede
sufrir caídas de proceso no atrapables. En un worker/POD esto es un reinicio; bajo carga con datos
no-ASCII, potencialmente un crash-loop.

**Workaround hasta el fix** (cualquiera de estos):

- `init({ logger: { disableNativeAddon: true } })` → usa el pipeline JS (no paniquea; el JS trunca
  con `slice`, seguro). Cuesta performance del motor nativo, pero elimina el crash.
- Evitar valores de metadata > 300 bytes (poco práctico como garantía).

---

## 6. Checklist de cierre

- [x] Aplicar fix 4.1 (`truncate` con `is_char_boundary`). ✅ aplicado en `lib.rs`.
- [x] Agregar test de regresión 4.1. ✅ `truncate_never_panics_on_multibyte` +
      `mask_value_multibyte_long_value_does_not_panic` (13/13 verdes).
- [x] Auditar otros slices por byte (4.2). ✅ `rg '\&\w+\[\.\.'` sobre `src/` → único hit era
      `truncate`; el resto opera sobre `Vec<char>` o `split_at` en boundary.
- [ ] Decidir e implementar defensa en profundidad (4.3) — sigue abierto (el abort en vez de throw
      persiste para cualquier panic futuro). Recomendado dejar ficha aparte.
- [ ] Verificar paridad de truncado JS↔Rust (4.4) — pendiente.
- [x] Rebuild del addon + rerun del repro → imprime `>>> SURVIVED all cases <<<` y `EXIT: 0`. ✅
      Casos verificados: `á×200`, `🚀×100`, `日本語×120` → truncados válidos, sin crash.
- [ ] `npm test` (suite JS) verde — pendiente de correr.

---

---

# BUG #2 (🟠 ALTO) — Config nativo global rompe el aislamiento multi-tenant → fuga de PII

> **Estado:** CONFIRMADO end-to-end → **fix INTERINO aplicado y verificado** (2026-08-08). Refactor
> per-instance (fix definitivo) pendiente como ficha.
> **Componente:** `syntropylog-native/src/lib.rs` (`NATIVE_CONFIG: OnceCell`) + `configure_native`.
> **Severidad:** Alta. Fuga silenciosa de PII en el escenario multi-tenant que `createSyntropyLog()`
> publicita explícitamente. `configureNative` **devuelve `true` mintiendo**.

## Resumen

El motor nativo guarda la config de masking en un **`OnceCell` global de proceso**:

```rust
static NATIVE_CONFIG: OnceCell<CompiledConfig> = OnceCell::new();

#[napi]
pub fn configure_native(config_json: String) -> bool {
    // ...compila reglas...
    let _ = NATIVE_CONFIG.set(compiled);  // ← no-op si YA estaba seteado
    true                                   // ← devuelve true IGUAL (miente)
}
```

Con dos instancias factory (`createSyntropyLog()`) en el mismo proceso y **reglas de masking
distintas**, la segunda llama `configureNative` con SU config, Rust la **ignora en silencio**, pero
devuelve `true` → `isNativeAddonInUse()` da `true` y la instancia B **enmascara con las reglas de A**.
La config de B se descarta; sus campos sensibles salen en claro.

## Reproducción (API pública)

```js
import { createSyntropyLog, MaskingStrategy } from './dist/index.mjs';
const rule = (p) => ({ pattern:new RegExp(p,'i'), strategy:MaskingStrategy.CUSTOM, spec:{ redact:true } });

const slA = createSyntropyLog();
await slA.init({ logger:{serviceName:'A'}, masking:{ enableDefaultRules:false, rules:[rule('secreto')] } });
const slB = createSyntropyLog();
await slB.init({ logger:{serviceName:'B'}, masking:{ enableDefaultRules:false, rules:[rule('clave')] } });

const payload = { secreto:'A-PII', clave:'B-PII' };
slA.getLogger('a').info(payload, 'MARK_A');
slB.getLogger('b').info(payload, 'MARK_B');
```

**Observado:**

```
MARK_A: {"secreto":"[REDACTED]","clave":"B-PII", ...}   ← correcto (regla de A)
MARK_B: {"secreto":"[REDACTED]","clave":"B-PII", ...}   ← MAL: aplicó la regla de A;
                                                          la regla propia de B ("redact clave")
                                                          se ignoró → "clave":"B-PII" filtrado
```

Tenant B pidió redactar `clave` y en cambio le redactaron `secreto` (regla ajena) mientras su PII real
salió en claro.

## Fix propuesto

**Correcto (refactor):** la config de masking nativa debe ser **por instancia**, no global. Opción
más limpia: exponer una clase napi (p. ej. `NativeEngine`) que **posea su `CompiledConfig`**; cada
`SerializationManager` tiene la suya y llama a métodos de esa instancia (`engine.fastSerializeFromJson(...)`)
en vez de a funciones libres que leen el `OnceCell`.

**Interino (barato, preserva correctitud sin refactor):** que `configure_native` **compare** — si ya
hay una config seteada y la nueva **difiere**, devolver `false` (no `true`). Así la 2.ª instancia con
reglas distintas cae al pipeline JS (enmascara bien, más lento) en vez de usar reglas ajenas:

```rust
pub fn configure_native(config_json: String) -> bool {
    let compiled = /* parse + compile; false si no compila */;
    match NATIVE_CONFIG.get() {
        None => { let _ = NATIVE_CONFIG.set(compiled); true }
        Some(existing) => existing.raw_json == compiled.raw_json, // igual → true; distinta → false (fallback JS)
    }
}
```

(Requiere guardar el JSON crudo o un hash en `CompiledConfig` para comparar.) Elimina la fuga; el
costo es perder native para la 2.ª config divergente hasta el refactor real.

**Test de regresión:** el repro de arriba debe mostrar `MARK_B` con `clave:"[REDACTED]"` y
`secreto:"A-PII"` (o, con el interino, ambos enmascarados por JS según las reglas de B).

---

# BUG #3 (🟠 MEDIO) — `MaskingEngine.process` muta el objeto del caller (camino JS/fallback)

> **Estado:** CONFIRMADO → **FIX APLICADO y verificado** (2026-08-08): copy-on-write no-mutante con
> memo por referencia (maneja DAG y ciclos) + 3 tests de regresión + docstrings corregidos.
> **Componente:** `src/masking/MaskingEngine.ts` (`applyMaskingRules`).
> **Severidad:** Media. Corrupción de estado de la app desde el acto de loguear. Solo en el camino
> **JS/fallback** (native deshabilitado, regla con función custom, regex no soportada, o **cualquier
> plataforma sin binario nativo**). El camino nativo NO muta.

## Resumen

`applyMaskingRules` escribe `dataObj[key] = …` **sobre el objeto recibido**, y `process` lo retorna —
pese a que el JSDoc dice *"returns a new object with the masked data"*. El pipeline hace copia
**shallow** del primer nivel, así que los **objetos anidados se comparten por referencia**: enmascarar
muta los anidados del **caller**.

## Causa raíz: la implementación abandonó su diseño documentado

El bug no es "faltó un `clone`" — es que **la implementación ya no coincide con el diseño que su propio
docstring describe**. La clase se documenta como *flatten → mask → reconstruct*:

```
línea 5-6 : "flattens complex nested objects into linear key-value pairs,
             applies masking rules, and then RECONSTRUCTS the original structure"
línea 191 : "Instead of processing nested objects RECURSIVELY, we flatten them"
```

Pero **no existe ninguna función de flattening/reconstruct en `src/masking/`** (verificado con `rg`), y
`applyMaskingRules` (línea 335) dice lo contrario: *"Applies masking rules **recursively**"*, recorriendo
y **mutando in-place**. El paso *"reconstruct"* del diseño original era exactamente lo que hacía el
masking no-mutante: se aplanaba a un mapa **nuevo**, se enmascaraba, y se **reconstruía una estructura
nueva** — el objeto de entrada nunca se tocaba. Al reescribirlo como walk recursivo in-place se perdió
esa propiedad (y de paso el docstring quedó mintiendo, y la promesa de *"O(n) regardless of depth via
flattening"* es falsa: es un recursivo O(n)).

Corolario: el fix correcto **restaura la intención de diseño** (producir estructura nueva), no le pega
un parche encima.

## Reproducción

```js
const sl = createSyntropyLog();
await sl.init({ logger:{ disableNativeAddon:true },
  masking:{ enableDefaultRules:false, rules:[{ pattern:/secreto/i, strategy:MaskingStrategy.CUSTOM, spec:{redact:true} }] } });

const user = { nombre:'Ana', secreto:'MI-PASSWORD', nested:{ secreto:'OTRO' } };
sl.getLogger('x').info(user, 'guardando user');
console.log(user.nested.secreto); // → "[REDACTED]"  ← el objeto del caller fue MUTADO

const obj2 = { secreto:'X' };
const ret = sl.getMasker().process(obj2);
console.log(ret === obj2);        // → true   ← retorna el MISMO ref, no un clon
console.log(obj2.secreto);        // → "[REDACTED]"  ← muta el input
```

**Observado:** `user.nested.secreto` pasó de `"OTRO"` a `"[REDACTED]"` **en la estructura del caller**;
`getMasker().process()` devolvió el mismo objeto mutado.

## Fix propuesto

**Invariante:** `MaskingEngine.process` **nunca** debe escribir sobre el input. Dos caminos:

- **(A) Restaurar el diseño documentado (flatten → mask → reconstruct).** Aplanar a un mapa lineal
  nuevo, enmascarar, reconstruir estructura nueva. Es no-mutante por construcción y cumple lo que el
  docstring ya promete (borra la mentira en vez de dejarla). Costo: implementar flatten/unflatten
  (con cuidado en arrays y claves con `.`).
- **(B) Mantener el walk recursivo pero copy-on-write.** Para la rama objeto, crear `out = { ...dataObj }`
  (o construirlo por clave) y setear `out[key]`, nunca `dataObj[key]` — igual que ya se hace para arrays
  vía `isArrayModified`. Menos código que (A); misma correctitud.

En ambos, corregir el JSDoc y aseverar que `process()` / `getMasker().process()` devuelvan un objeto
**distinto** del input. Recomendado **(B)** por costo/beneficio, salvo que se quiera recuperar
literalmente el diseño flatten.

**Test de regresión:** loguear un objeto con anidados (native off) y aseverar que el objeto original
queda **idéntico** a su snapshot previo; `process(obj) !== obj`.

---

## Apéndice — riesgo de drift (no es bug hoy)

- **Sync manual de constantes duplicadas** entre TS y Rust (`MASK_DEFAULT_CAP_LENGTH`, `maxDepth`,
  `maxStringLength`). El fixture compartido cubre el primitivo de mask, **no** estos números. Si
  divergen, los dos motores truncan/anidan distinto sin que ningún test lo note. Sugerido: un test de
  paridad que aserte los defaults, o generar las constantes Rust desde `src/constants.ts` en build.
