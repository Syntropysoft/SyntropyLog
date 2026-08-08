# El motor nativo y los transports que consumen objetos

> **Estado:** diagnóstico CONFIRMADO (reproducido) + propuesta de resolución (Opción A en curso).
> **Fecha:** 2026-08-08.
> **Componentes:** `src/logger/Logger.ts`, `src/logger/transports/{Transport,AdapterTransport,DurableAdapterTransport}.ts`, motor nativo (`fast_serialize*`).
> **Severidad:** Alta. El motor nativo (feature estrella de performance) es **mutuamente excluyente**
> con los transports que necesitan el `LogEntry` estructurado (auditoría durable, OTLP, adapters).
> El fallo es **silencioso**: `isNativeAddonInUse()` da `true`, la consola se ve bien, pero el
> executor de auditoría recibe un string y deja de persistir → riesgo de compliance.

---

## 1. Diagnóstico

El motor nativo (Rust, `fast_serialize` / `fast_serialize_from_json`) devuelve un **string JSON ya
serializado** (enmascarado en una sola pasada). En `Logger._log`, el camino nativo entrega ese string
a **todos** los transports por igual:

```ts
// src/logger/Logger.ts (camino nativo, simplificado)
if (serializationResult.serializedNative) {
  for (const transport of effectiveTransports) {
    if (transport.isLevelEnabled(level)) {
      transport.log(serializationResult.serializedNative); // ← STRING a TODOS
    }
  }
}
```

Eso está bien para los transports **de consola** (quieren el string, ya serializado = rápido). Pero
rompe a los que **consumen el objeto**:

- **`DurableAdapterTransport`** — rutea por el campo `retention` (`durableOnlyForRetention`) y le pasa
  la entrada a un `executor` que persiste datos estructurados. Con un string no puede leer `.retention`
  ni entregar un objeto.
- **`AdapterTransport`** — delega a un `ILogTransportAdapter` que casi siempre persiste/forwardea
  estructura (OTLP, un colector, un bus de auditoría).

El propio código lo delata: `DurableAdapterTransport.hasRetention()` tiene este comentario —

```ts
// "...we don't need to parse here because the JS pipeline calls log() with an object
//  (the native path is for the bundled formatter, not directly to the adapter)."
```

**Esa suposición es el bug.** El camino nativo NO es solo para el formatter de consola: el Logger le
manda el string a cada transport, incluido el adapter/durable.

### Consecuencia observable

Una app con transports estructurados **debe mantener el motor nativo apagado** para que la auditoría
funcione. En la práctica se apaga sin querer: cualquier regla de masking con `customMask` (función JS)
hace `getNativeRules() → null` y desactiva el nativo — y ahí "funciona todo", por la razón equivocada.

### Evidencia (reproducción real)

En un consumidor real (motor-ventas), el test de auditoría financiera falla al encender el nativo:

```ts
const durable = new DurableAdapterTransport({
  executor: (entry) => { if (entry && typeof entry === 'object') seen.push(entry); },
  durableOnlyForRetention: true,
});
// ...
sl.getLogger('audit').withRetention(FINANCIAL_AUDIT_POLICY).audit({ eventType: 'OrderPaid' }, 'pago');
// ...
expect(seen.filter(e => 'retention' in e)).toHaveLength(1); // ❌ 0 con nativo ON (recibe string)
```

- Nativo **OFF** (customMask presente) → executor recibe **objeto** → 12/12 verde.
- Nativo **ON** (regla declarativa) → executor recibe **string** → `typeof === 'object'` false → 0 → falla.

Confirmado por bisección: revertir solo el encendido del nativo hace pasar el test.

---

## 2. Impacto

- El motor nativo y **cualquier** transport que inspeccione/persista campos del entry son
  **incompatibles** hoy. Eso incluye auditoría durable, OTLP y adapters de persistencia.
- El fallo es **silencioso y peligroso**: no hay excepción, la consola enmascara bien, pero el rastro
  de auditoría (p. ej. retención fiscal a 10 años) se pierde. `isNativeAddonInUse()` reporta `true`.

---

## 3. Propuestas de resolución

### ✅ Opción A — Capacidad `wantsObject` en el transport + parse único en el Logger (RECOMENDADA, en curso)

El string nativo **es JSON válido del entry enmascarado**; para los transports que necesitan objeto,
se `JSON.parse`ea de vuelta (masking ya aplicado en Rust → el objeto parseado ya viene enmascarado).

- `Transport` gana un getter `wantsObject` (default `false` = consola lee el string).
- `AdapterTransport` y `DurableAdapterTransport` lo overridean a `true`.
- `Logger`, en el camino nativo, parsea el string **una sola vez** (lazy) y entrega el **objeto** a los
  transports con `wantsObject`, y el **string** a los demás.

```ts
// Logger, camino nativo:
let parsed; let parseFailed = false;
for (const t of transports) {
  if (!t.isLevelEnabled(level)) continue;
  if (t.wantsObject) {
    if (parsed === undefined && !parseFailed) {
      try { parsed = JSON.parse(nativeLine); } catch { parseFailed = true; }
    }
    t.log(parsed ?? nativeLine); // fallback al string si el parse falla (nunca se pierde el log)
  } else {
    t.log(nativeLine);
  }
}
```

- **Pros:** cambio mínimo y centralizado; **parse una sola vez** aunque haya N adapters; la consola
  mantiene su fast-path (string); hace que los adapters vean **siempre** un objeto (consistente con el
  camino JS — se elimina el "string en nativo, objeto en JS"); fail-safe (si el parse fallara, cae al
  string, nunca se pierde la línea).
- **Contras:** un `JSON.parse` por log que llegue a un transport-objeto (aceptable: esos transports ya
  persisten/hacen I/O; el costo es marginal frente a eso). El objeto parseado usa `timestamp` en
  formato RFC3339 (como lo emite el nativo), no idéntico al camino JS, pero con todos los campos.

### Opción B — Parsear dentro de cada transport adapter

`AdapterTransport`/`DurableAdapterTransport` parsean el string ellos mismos.

- **Pros:** sin cambios en el Logger ni API nueva en `Transport`.
- **Contras:** cada transport parsea por su cuenta → **N parses** para N adapters del mismo log; lógica
  duplicada; no ayuda a futuros consumidores de objeto (OTLP, etc.) sin repetir el patrón.

### Opción C — Que el nativo devuelva string **y** objeto

`fast_serialize` retorna también el objeto enmascarado (o el Logger lo reconstruye).

- **Contras:** anula el beneficio del nativo (doble trabajo / marshaling de objetos por N-API); cambio
  grande en la frontera Rust↔JS.

### Opción D — Desactivar el nativo si hay algún transport-objeto

Auto-apagar el nativo cuando se registra un transport con `wantsObject`.

- **Contras:** tira la performance del nativo para la consola solo porque existe **un** adapter; peor
  que A (que conserva el string rápido para consola y da objeto solo a quien lo necesita).

### Recomendación

**Opción A.** Mínima, correcta, eficiente (parse único), backward-compatible para consola, y elimina la
inconsistencia string-vs-objeto que sufren hoy los adapters.

---

## 4. Plan de implementación (Opción A) — ✅ HECHO

- [x] `Transport`: getter `wantsObject` (default `false`).
- [x] `AdapterTransport`: `override get wantsObject() { return true; }`.
- [x] `DurableAdapterTransport`: `override get wantsObject() { return true; }` + comentario obsoleto de
      `hasRetention` corregido.
- [x] `Logger`: helper `emitNativeLine(line, transports, level)` con **parse único** (lazy, compartido);
      usado en los dos puntos de emisión nativa (fast-path de 1 arg y camino normal).

## 5. Plan de verificación — ✅ HECHO

- [x] Test unit: nativo (mock `serializedNative`) → `wantsObject` recibe **objeto** con `retention`;
      consola recibe **string** (`tests/logger/Logger.test.ts`, parse único).
- [x] Test unit: línea nativa no-JSON → **fallback al string** (nunca se pierde el log).
- [x] `npm test` completo verde (**688**, +2 nuevos).
- [x] **E2E con el motor nativo REAL:** `isNativeAddonInUse: true` + `DurableAdapterTransport` con
      `retention` → el executor recibe el **objeto** `{ eventType, retention, secreto: '[REDACTED]' }`
      (masking aplicado). Confirma que la auditoría durable funciona **con el nativo encendido**.
- [ ] Integración en motor-ventas (pendiente de publicar esta versión): con ella + swap
      `customMask → TOKEN`, el test de auditoría debe pasar con el nativo ON. Verificado de forma
      equivalente en SyntropyLog (mismo escenario: `DurableAdapterTransport` + `retention` + nativo).

## 6. Rollout

- Va como **feature/minor** de SyntropyLog (nueva versión). Es aditivo y no rompe consumidores
  (los transports de consola no cambian; los adapters pasan de recibir string a recibir objeto en el
  camino nativo, que es lo que ya recibían en el camino JS).
- Habilita que motor-ventas cambie el `customMask` de la dirección por `strategy: TOKEN` y **encienda el
  motor nativo** conservando la auditoría durable/OTLP.
