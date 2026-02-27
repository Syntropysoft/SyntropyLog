# Revisión: AppLoggerBridge.ts

Revisión del PoC que une la API legacy `appLogger` (echeq) con SyntropyLog.

---

## Lo que está bien

1. **Idea del facade**: La API `appLogger.info/warn/error/audit` replica el contrato legacy; el resto de la app no cambia y el backend (SyntropyLog) se puede cambiar detrás de este módulo.
2. **Uso de `logger.audit()`**: Correcto usar el nivel `audit` para bypass del filtro por severidad y envío al transport dedicado (BD).
3. **UniversalAdapter + UniversalLogFormatter**: Encajan para mapear `LogEntry` a la forma de `echeq_logs.system_logs`.
4. **Pasar `originalLevel` en meta**: Necesario para persistir en BD el nivel legacy (`info`/`warn`/`error`) en lugar de `audit`.

---

## Problemas a corregir

### 1. Ubicación de `masking` en el config

**Problema**: `maskingPolicy` está dentro de `logger: { masking: maskingPolicy }`. En SyntropyLog la configuración de masking es **a nivel raíz** del config, no dentro de `logger`.

**Corrección**: Mover a la raíz:

```ts
await syntropyLog.init({
  logger: { level: 'info', transports: { ... } },
  masking: maskingPolicy,  // aquí, no dentro de logger
});
```

---

### 2. Formato de `masking` no coincide con el schema

**Problema**: `maskingPolicy` usa `fields` y `patterns: [{ regex, mask }]`. El schema de SyntropyLog espera `masking.rules` con forma `{ pattern, strategy }`, donde `strategy` es un `MaskingStrategy` (enum: e.g. `password`, `token`, `credit_card`, etc.), no `regex` + `mask` libre.

**Corrección**: Usar el formato que entiende el schema, por ejemplo:

```ts
import { MaskingStrategy } from '../../src/masking/MaskingEngine';

const maskingPolicy = {
  preserveLength: true,
  rules: [
    { pattern: /password|token|secret|cvv/i, strategy: MaskingStrategy.PASSWORD },
    { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, strategy: MaskingStrategy.CREDIT_CARD },
    // Si hay DNI/ID, usar CUSTOM o un strategy que aplique
  ],
};
```

Si el schema no permite regex de contenido (solo de nombres de campo), habría que revisar la doc/schema y ajustar.

---

### 3. `context: 'all'` en el mapping no hace nada

**Problema**: En `UniversalLogFormatter` no existe un path especial `'all'`. `getValueByPath('all', entry)` devuelve `undefined`, así que la columna `context` quedaría `undefined`.

**Corrección**: Usar la opción `includeAllIn` del formatter para volcar todo el contexto en una clave (p. ej. la columna `context` de la tabla):

```ts
new UniversalLogFormatter({
  mapping: {
    // ... resto del mapping PERO quitar context de aquí
    level: ['metadata.originalLevel', 'level'],  // ver punto 4
    message: 'message',
    user_id: 'userId',   // ver punto 5
    tenant_id: 'tenantId',
    // ... etc
  },
  includeAllIn: 'context',  // vuelca bindings + metadata en result.context
});
```

Y **quitar** la entrada `context: 'all'` del objeto `mapping`.

---

### 4. Nivel persistido en BD: `audit` vs `info`/`warn`/`error`

**Problema**: Al llamar `logger.audit()`, el `LogEntry.level` es `'audit'`. Si en el mapping se pone `level: 'level'`, en la tabla se guardaría `audit`. La tabla legacy suele esperar `info` | `warn` | `error`.

**Corrección**: En el mapping, usar primero `originalLevel` (que el bridge ya pone en meta) y fallback a `level`:

```ts
level: ['originalLevel', 'level'],
```

Así en BD queda el nivel legacy; si en algún caso no se pasa `originalLevel`, caería a `audit`.

---

### 5. Paths del formatter: `metadata.X` vs top-level

**Problema**: En el pipeline de SyntropyLog, el segundo argumento de `logger.audit(message, meta)` se **mergea** en el `LogEntry` (no se guarda como `entry.metadata`). Es decir, `userId`, `tenantId`, `originalLevel`, etc. quedan en la **raíz** del entry. En `UniversalLogFormatter.getValueByPath`, si usás `metadata.userId`, se busca `entry.metadata?.userId`; como `entry.metadata` no existe, devuelve `undefined`.

**Corrección**: Mapear por nombres en la raíz del entry (y opcionalmente fallbacks por si en el futuro se usa bindings):

```ts
user_id: ['userId', 'bindings.userId'],
tenant_id: ['tenantId', 'bindings.tenantId'],
ip_address: ['ip', 'ipAddress'],
user_agent: 'userAgent',
source: ['source', 'category'],
error_detail: ['error.stack', 'err.stack'],
endpoint: ['endpoint', 'url'],
batch_id: 'batchId',
user_email: 'userEmail',
company_name: 'companyName',
diagnostic_summary: 'summary',
```

(El formatter ya busca en `bindings` cuando el key no está en la raíz; con el merge actual, lo normal es que estén en la raíz.)

---

### 6. Columna `id` en el mapping

**Problema**: `id: { value: undefined }` hace que el objeto formateado tenga `id: undefined`. El executor (INSERT) tendría que omitir `id` o usar DEFAULT; si hace `INSERT ... (id, ...) VALUES ($1, ...)` con `undefined`, puede fallar o escribir NULL según el driver.

**Corrección**: No mapear `id`. Dejar que la tabla use su default (p. ej. `gen_random_uuid()` o `serial`) y que el executor solo inserte las columnas que recibe con valor definido, o que omita explícitamente `id`.

---

### 7. Transports para `default` (logs no-audit)

**Problema**: `default: []` implica que `getLogger('app')` (que resuelve a la categoría `default`) no envía logs a ningún sitio. En el PoC puede estar bien para mostrar solo audit→BD, pero en una migración real los logs de aplicación (info/warn/error) quedarían sin salida.

**Sugerencia**: Para producción, dar al menos un transport a `default` (p. ej. consola o archivo), o documentar que el ejemplo solo persiste audit y que hay que configurar `default` en el entorno real.

---

### 8. Imports desde `examples/migration`

**Problema**: Los imports usan `'../src/SyntropyLog'` etc. Desde `examples/migration/`, `../` es `examples/`, así que `../src` es `examples/src`, que normalmente no existe; el código fuente suele estar en `src/` en la raíz del repo.

**Corrección**: Ajustar rutas según la estructura real del repo, por ejemplo:

- Si los examples están en `examples/migration/`, algo como `'../../src/SyntropyLog'` (subir a raíz y bajar a `src`), o
- Usar el paquete publicado: `import { syntropyLog } from 'syntropylog';`

---

### 9. Inicialización y uso del bridge

**Problema**: `initLegacyBridge(dbExecutor)` está definida pero no se exporta ni se llama. Quien use el bridge debe:

1. Llamar `await initLegacyBridge(dbExecutor)` al arranque (con un executor que haga el INSERT a `echeq_logs.system_logs`).
2. Usar `appLogger` después.

Si no se llama `init`, `syntropyLog.getLogger(...)` puede fallar o comportarse mal.

**Sugerencia**: Exportar `initLegacyBridge` y documentar en el archivo o en un README que hay que llamarla antes de usar `appLogger`, y que `dbExecutor` debe recibir el objeto formateado y ejecutar el INSERT (omitiendo `id` o usando DEFAULT para las columnas no mapeadas).

---

### 10. Firma de `audit` y compatibilidad con el legacy

**Legacy (echeq)**: `appLogger.audit(message, meta, level = 'info')` — el tercer parámetro es el nivel para BD/consola.

**Bridge**: `audit(message, meta, level = 'info')` hace `logger.audit(message, { ...meta, originalLevel: level })`. Correcto. Solo falta asegurar que el formatter use `originalLevel` para la columna `level` en BD (punto 4).

---

## Resumen de cambios sugeridos

| # | Qué | Dónde |
|---|-----|--------|
| 1 | Mover `masking` a la raíz del config | `initLegacyBridge` |
| 2 | Usar `masking.rules` con `pattern` + `strategy` (MaskingStrategy) | `maskingPolicy` |
| 3 | Usar `includeAllIn: 'context'` y quitar `context: 'all'` del mapping | `UniversalLogFormatter` |
| 4 | Mapear `level` a `['originalLevel', 'level']` | `legacyMapping` |
| 5 | Usar paths en raíz (y fallbacks): `userId`, `tenantId`, etc. | `legacyMapping` |
| 6 | Quitar `id` del mapping | `legacyMapping` |
| 7 | Documentar o añadir transport para `default` | config + comentarios |
| 8 | Corregir imports (`../../src/` o paquete) | imports |
| 9 | Exportar y documentar `initLegacyBridge` y uso de `dbExecutor` | módulo + README/comentarios |

Con estos ajustes, el bridge queda alineado con el schema de SyntropyLog, con el comportamiento del formatter y con la tabla legacy, y el reemplazo detrás del facade sigue siendo transparente para el resto de la app.
