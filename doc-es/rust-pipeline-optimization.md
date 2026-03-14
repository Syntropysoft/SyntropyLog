# Rust y el pipeline de log: cuánto más trabajo pesado podemos darle

Este documento responde a la pregunta: **qué tanto más podemos darle trabajo pesado a Rust y acelerar todo el pipeline de log**.

**I/O:** En I/O no hay quien le gane a Node (streams, libuv, escritura a disco/red). Aquí no movemos I/O a Rust; hablamos solo de **trabajo CPU** donde la fuerza bruta de Rust sí suma.

---

## Estado actual: quién hace qué

### Con addon nativo cargado (path rápido)

1. **Logger** llama a `serializationManager.serializeDirect(level, message, timestamp, service, metadata)`.
2. **SerializationManager** detecta el addon y llama a `native.fastSerialize(level, message, timestamp, service, metadata)`.
3. **Rust** (`fast_serialize` en `syntropylog-native`):
   - Convierte el objeto `metadata` de JS a un árbol `serde_json::Value` con **detección de referencias circulares** y normalización de `Error` (name, message, stack).
   - Aplica **límites**: `MAX_KEYS_PER_OBJECT` (500), `MAX_ARRAY_LENGTH` (1000).
   - Recorre el árbol con **mask_value**: profundidad máxima, truncado de strings, claves sensibles → `[REDACTED]`, patrones regex de redacción.
   - Construye el JSON final (level, message, service, timestamp + metadata enmascarado) y devuelve **una sola string**.
4. **Logger** recibe `serializedNative` y pasa esa string directamente a cada transport con `transport.log(serializedNative)`.

En este path **no se ejecuta** el pipeline JS (SerializationStep, HygieneStep, SanitizationStep, TimeoutStep) ni el **MaskingEngine** en JS.

### Sin addon nativo (fallback)

1. **Logger** llama a `serializeDirect` igual.
2. **SerializationManager** no tiene addon (o falló) → construye un objeto `logEntry` y llama a `serialize(logEntry, context)`.
3. **Pipeline JS**:
   - **SerializationStep**: serializadores custom o pass-through.
   - **HygieneStep**: detección de circulares (atajo con `JSON.stringify` o `safeDecycle`), normalización de `Error`.
   - **SanitizationStep**: `DataSanitizer` (maxDepth, claves sensibles).
   - **TimeoutStep**: metadatos de timeout.
4. **Logger** recibe `result.data` (objeto), llama a **MaskingEngine.process(entry)** (regex, reglas de enmascarado) y pasa el objeto enmascarado a los transports.

El trabajo pesado en JS aquí es: recorrido del objeto (hygiene + sanitización) y **MaskingEngine** (regex sobre strings en todo el árbol).

---

## Qué ya hace Rust (resumen)

| Funcionalidad              | Rust (addon) | Pipeline JS (sin addon) |
|---------------------------|--------------|--------------------------|
| Referencias circulares    | Sí (`js_unknown_to_value` + `HashSet` de punteros) | Sí (HygieneStep) |
| Normalización de Error    | Sí (name, message, stack) | Sí (HygieneStep) |
| Límite de profundidad     | Sí (`max_depth` en `mask_value`) | Sí (DataSanitizer, TimeoutStep) |
| Límite de keys/array       | Sí (500 keys, 1000 items) | No explícito en pipeline |
| Truncado de strings       | Sí (`max_string_length`) | Implícito en sanitización |
| Claves sensibles          | Sí (`sensitive_fields` + `redact_patterns`) | Sí (DataSanitizer + MaskingEngine) |
| Salida final              | Una string JSON | Objeto → MaskingEngine → objeto |

Con addon, **todo el trabajo pesado de serialización + sanitización + enmascarado** ya está en Rust. El pipeline JS solo se usa cuando no hay addon o cuando el addon falla.

---

## Oportunidades para darle más trabajo a Rust y acelerar

### 1. Un solo recorrido en Rust (convertir + enmascarar)

**Hoy:** Rust hace dos pasadas sobre los datos:

- `js_unknown_to_value`: recorre el objeto JS y construye un `serde_json::Value`.
- `mask_value`: recorre ese `Value` y produce otro con truncado, redacción y límites.

**Oportunidad:** Fusionar en **un solo recorrido**: mientras se convierte de JS a una representación interna, aplicar ya truncado, redacción por clave y límite de profundidad. Así se reduce memoria intermedia y un pase completo sobre el árbol.

**Impacto:** Menos asignaciones y menos trabajo por log en el path nativo. Requiere refactor solo en `syntropylog-native` (sin cambios en JS).

---

### 2. Strip de caracteres de control / ANSI en Rust

**Hoy:** En JS existe **SanitizationEngine**, que elimina códigos ANSI y caracteres de control de los strings para evitar log injection. Ese motor es opcional en los **transports** (p. ej. ConsoleTransport puede usarlo). En el path nativo, el transport recibe ya una **string**; si el transport no la vuelve a sanitizar, los caracteres de control podrían seguir en la salida.

**Oportunidad:** Añadir en Rust, dentro del tratamiento de strings (en `mask_value` o en un helper usado ahí), el strip de:

- Secuencias ANSI (equivalente al regex de `SanitizationEngine`).
- Opcionalmente, caracteres de control genéricos.

Así la salida del addon es segura por defecto y no dependemos de un segundo paso en JS. Coste: un pase regex/char sobre cada string; en Rust suele ser muy barato.

**Impacto:** Paridad de seguridad con el path JS y posible eliminación de la necesidad de SanitizationEngine en transports cuando la entrada viene del addon.

---

### 3. Reducir cruces N-API (metadata como string) — experimental

**Hoy:** Rust recibe el objeto `metadata` como `JsUnknown` y lo recorre con `get_named_property` / `get_element`, etc. Cada acceso es un cruce N-API (JS ↔ Rust).

**Oportunidad:** Que **JS** haga `JSON.stringify(metadata)` y pase a Rust **una sola string**. Rust haría `serde_json::from_str` y luego el mismo `mask_value` (o el recorrido unificado del punto 1). Así solo hay **un** cruce N-API por log (el string).

**Trade-off:**  
- Ventaja: menos cruces N-API; puede ganar en objetos muy grandes o muy anidados.  
- Desventaja: `JSON.stringify` en JS puede fallar con circulares (habría que seguir usando el path “objeto” cuando falle) y añade un serializado completo en V8.

**Recomendación:** Implementar como **path opcional** (p. ej. intentar `JSON.stringify`; si no hay error, llamar a una nueva función Rust `fast_serialize_from_json(level, message, timestamp, service, metadata_json_string)`; si hay error, fallback al `fast_serialize` actual con objeto). Medir en benchmark (throughput y p99) con metadata pequeña y grande antes de dejarlo por defecto.

---

### 4. Custom serializers

Los **serializadores custom** (SerializationStep) son funciones JS. **No** se pueden mover a Rust. Cualquier log que dependa de ellos seguirá usando el pipeline JS. No hay más trabajo que darle a Rust en esa parte; el diseño actual (addon para el path estándar, pipeline JS para custom serializers) es el tope razonable.

---

### 5. Asegurar que el addon sea la norma (prebuilt)

Cuantos más procesos usen el addon, más se “acelera todo el pipeline” en la práctica:

- **Release / prebuilt:** Ya tenéis el flujo de compilar el addon en los tres OS y empaquetar binarios en `syntropylog-native` para la publicación npm. Mantenerlo y documentarlo asegura que la mayoría de instalaciones usen el path Rust.
- **Detección y fallback:** Si el addon no carga (instalación sin prebuilt, versión de Node incompatible), el fallback al pipeline JS es correcto. Opcional: un callback `onSerializationFallback` o similar para observabilidad cuando no se usa Rust.

---

## Otras tareas pesadas (fuera del pipeline)

Además del pipeline de serialización/sanitización/enmascarado, hay más trabajo **puro CPU** que podemos aprovechar en Rust.

### 6. Formateo de mensaje (`util.format`)

**Hoy:** Cuando el usuario hace `logger.info('User %s did %d actions', name, count)`, en JS se llama a `util.format(message, ...formatArgs)`. Es CPU (sustitución de placeholders, números, etc.) en el hot path.

**Oportunidad:** Exponer en Rust una función tipo `format_message(fmt_string, args_json)` que implemente un subconjunto compatible con Node (p. ej. `%s`, `%d`, `%i`, `%f`, `%j`). El Logger llamaría al addon para formatear el mensaje antes de pasarlo a `fastSerialize`. Así se quita `util.format` del hot path cuando hay argumentos de formato.

**Impacto:** Menor presión en V8 en llamadas con muchos placeholders. Riesgo: paridad 100% con `util.format` (objetos, símbolos, etc.) puede ser trabajosa; un subconjunto útil ya aporta valor.

---

### 7. Reglas "built-in" del MaskingEngine en el path sin addon

**Hoy:** Cuando **no** hay addon, después del pipeline JS se usa **MaskingEngine** en JS: recorrido recursivo del objeto, regex sobre cada clave, y para cada valor string aplica estrategias (credit card, SSN, email, phone, password, token) con muchos `replace` y lógica por tipo. Es CPU puro y puede dominar el p99 en el fallback.

**Oportunidad:** Exponer en Rust una función que reciba **una string JSON** (el entry ya serializado por el pipeline JS) y devuelva otra string JSON con las **mismas reglas built-in** (sensitive_fields, redact_patterns, y opcionalmente estrategias tipo credit_card/SSN/email si las alineamos con el addon). Las reglas **custom** (funciones JS `customMask`) seguirían en JS: o se aplican después sobre el resultado, o solo están disponibles cuando hay addon vía config. Así el path sin addon también descarga la parte más pesada del masking a Rust (un solo cruce N-API: string in, string out).

**Impacto:** El fallback sin addon se acerca más al rendimiento del path nativo en la parte de masking. Complejidad: mantener paridad de comportamiento entre Rust y MaskingEngine (reglas default).

---

### 8. Compresión (feature futura)

Si en el futuro se quiere **comprimir** líneas de log antes de enviarlas (p. ej. buffer → comprimir → enviar por red), la compresión es **CPU pura**. Rust con crates como `zstd` o `lz4` es muy rápido. El addon podría exponer `compress_log_buffer(data: string) -> Buffer`; el **I/O** (escribir al socket, archivo o cola) sigue en Node. Así se reparte: Rust hace la parte pesada de CPU, Node hace el write/send.

**Impacto:** Habilitaría logs comprimidos sin bloquear el event loop con compresión en JS. Solo tiene sentido si se añade la feature de compresión.

---

### 9. Hashing para sampling / deduplicación

Si se implementa **sampling por contenido** (p. ej. "solo enviar 1 de cada N logs con el mismo hash") o deduplicación, el **hash** de la línea es CPU. Rust puede calcular un hash rápido (xxhash, fnv, etc.) en nanosegundos y exponer algo como `hash_for_sampling(line: string) -> number`. La decisión "enviar o no" y el I/O siguen en Node.

**Impacto:** Sampling/dedup sin coste apreciable en el hot path. Solo aplica si se añade esta capacidad.

---

### Resumen de "otras tareas"

| Tarea | Dónde hoy | Oportunidad Rust | I/O |
|--------|-----------|-------------------|-----|
| Formateo de mensaje | `util.format` en Logger | `format_message` en addon | No; solo CPU. |
| Masking built-in (fallback) | MaskingEngine en JS | Rust: string JSON → string JSON enmascarada | No. |
| Compresión | — | Addon: comprimir buffer; Node escribe | I/O sigue en Node. |
| Hashing (sampling) | — | Addon: hash de línea; decisión en Node | I/O sigue en Node. |

---

## Resumen ejecutivo

| Acción | Dónde | Efecto |
|--------|--------|--------|
| **Un solo recorrido convert+mask en Rust** | syntropylog-native | Menos memoria y menos CPU por log en el path nativo. |
| **Strip ANSI/control chars en Rust** | syntropylog-native | Salida segura sin paso extra en JS; paridad con SanitizationEngine. |
| **Metadata como string (opcional)** | Logger/SerializationManager + addon | Posible ganancia en N-API; requiere benchmark y fallback si `JSON.stringify` falla. |
| **Mantener prebuilt en release** | CI / release | Maximiza el uso del path Rust en producción. |
| **Formateo de mensaje en Rust** | addon `format_message` | Quitar `util.format` del hot path cuando hay placeholders. |
| **Masking built-in para fallback** | addon: JSON in → JSON out | Path sin addon descarga el masking pesado a Rust (string in/out). |
| **Compresión (futuro)** | addon | CPU en Rust; I/O (write/send) sigue en Node. |
| **Hashing para sampling (futuro)** | addon | Hash en Rust; decisión e I/O en Node. |
| **Custom serializers** | — | Siguen en JS; no hay más trabajo que mover a Rust ahí. |

En conjunto: **el trabajo pesado del pipeline de log ya está en Rust cuando el addon está cargado.** Las mejoras siguientes son optimizar el propio addon (un solo recorrido, ANSI/control chars) y, si se quiere exprimir más, probar el path “metadata como string” con benchmarks. El resto del “acelerar todo el pipeline” pasa por asegurar que ese path nativo sea el que se use por defecto (prebuilt, documentación, y opcionalmente observabilidad del fallback). Además, fuera del pipeline: formateo de mensaje, masking del fallback, y en el futuro compresión y hashing. I/O se deja en Node; Rust asume el trabajo CPU puro.

**Plan de implementación:** Para ir tachando tareas y seguir el avance, ver **[Plan de implementación: Rust como "Fórmula 1" del pipeline](rust-implementation-plan.md)** en esta misma carpeta.
