# Análisis: Log actual (echeq-backend) vs SyntropyLog (gabys)

Comparación del sistema de logging actual del backend con la implementación de **SyntropyLog** en `/home/suario/source/gabys/SyntropyLog` para evaluar ganancias posibles.

---

## 1. Estado actual del log en echeq-backend

### Arquitectura
- **Winston** como núcleo: niveles `error`, `warn`, `info`, `http`, `debug`.
- **Transports**: Consola, archivos por categoría (app, warn, error, http, http-slow, http-errors, performance, database, audit), **DatabaseTransport** (batch a `echeq_logs.system_logs`), **Azure Application Insights**.
- **Clasificación**: `log-classifier.js` → `shouldLogToDatabase(level, context)` decide qué va a PostgreSQL (auditoría) y qué solo a Application Insights/archivos.
- **Trazabilidad**: `request-context.js` (AsyncLocalStorage) + middleware que inyecta `traceId`/`correlationId` en `req`; se propaga a mano en los logs.
- **Persistencia a BD**: `utils/logger.js` → `logSystemEvent()` + `DatabaseTransport`; columnas diagnósticas vía `diagnostic-fields.js` (error_detail, endpoint, batch_id, user_email, company_name, diagnostic_summary).

### Facade actual: `src/utils/app-logger.js`
- **Punto único de uso** para el resto de la app: todo el código que deba loguear debe usar **appLogger**.
- **API estable (ILogger)**: `appLogger.info(message, meta)`, `appLogger.warn(message, meta)`, `appLogger.error(message, meta)`, `appLogger.audit(message, meta, level)`.
- **Implementación actual**: `getLegacyLogger()` devuelve `{ loggers, logSystemEvent }` de `utils/logger` (Winston). El facade solo delega.
- **Implicación**: Cuando la primera historia de logger (unificación, ECLB-167) esté integrada y todo pase por el facade, **cambiar la implementación detrás del facade** (p. ej. de Winston a SyntropyLog) es **transparente** para todos los llamadores: solo se cambia qué hace `getLegacyLogger()` o cómo está implementado `app-logger.js`; el resto del código no se toca.

### Problemas conocidos (alineados con ECLB-167, ECLB-203, ECLB-204)
- **Varias implementaciones de `logSystemEvent`**: en `utils/logger.js`, `routes/logs.js` (con config por tenant/company), `src/services/commons/systemLog.js` (recibe pool), `routes/system-admin.js`, `routes/users.js`, etc. → alto acoplamiento y criterio no unificado. **Objetivo**: que todo termine detrás del facade (un solo backend de log).
- **Sin sanitización centralizada de PII/credenciales** antes de escribir en logs (ECLB-204 pendiente).
- **Integridad de logs** (append-only, firma, retención) no implementada (ECLB-203 pendiente).

---

## 2. Qué ofrece SyntropyLog (carpeta gabys)

### Arquitectura
- **Logger** con API tipo Pino: `info`, `warn`, `error`, `debug`, `trace`, `fatal`, y **`audit`** (nivel que hace bypass del filtro por severidad).
- **ContextManager** con AsyncLocalStorage: correlation/trace se propagan en toda la cadena async sin pasar parámetros.
- **Transports** por categoría: `default` y `audit` (u otras) con destinos distintos (consola, archivo, adapters).
- **UniversalAdapter** + **UniversalLogFormatter**: persistencia agnóstica; un `executor(data)` recibe el objeto formateado; el formateo se define por **mapeo JSON** (ej. `column_msg: 'message'`, `column_user: 'metadata.userId'`). Cero dependencias extra para el core.
- **Masking** integrado: `MaskingEngine` con campos, patrones regex y `preserveLength`.
- **Filosofía "Silent Observer"**: si el logging falla, la app sigue; no lanza ni interrumpe.
- **Testing**: `createTestHelper()`, `SyntropyLogMock`, sin init/shutdown en tests.

### Archivos relevantes en SyntropyLog
- `src/logger/Logger.ts`: pipeline de log (nivel, serialización, masking, dispatch a transports).
- `src/logger/adapters/UniversalAdapter.ts`: delega persistencia a un `executor(data)`.
- `src/logger/formatters/UniversalLogFormatter.ts`: mapeo JSON de `LogEntry` a cualquier estructura (ideal para mapear a columnas de `echeq_logs.system_logs`).
- `examples/AuditAdapterExample.ts`: auditoría a Postgres con categoría `audit`.
- `tests/logger/AuditRouting.test.ts`: audit bypass de nivel y ruteo a transport dedicado.

---

## 3. Comparativa directa

| Aspecto | echeq-backend (actual) | SyntropyLog (gabys) |
|--------|------------------------|----------------------|
| **Punto único de escritura** | No: varias implementaciones de `logSystemEvent` (ECLB-167) | Sí: un logger; auditoría vía `.audit()` y transport dedicado |
| **Qué va a BD** | `shouldLogToDatabase()` en log-classifier + lista de AUDIT_EVENTS / types | Nivel `audit` + ruteo por categoría (ej. transport `audit` → UniversalAdapter a Postgres) |
| **Mapeo a tabla** | Código fijo en logger + `extractDiagnosticFields()` | UniversalLogFormatter con mapping JSON (ej. level → level, message → message, metadata.userId → user_id) |
| **Correlation / traceId** | Manual: middleware + inyección en req + uso en cada log | Automático: ContextManager.run() en middleware; todos los logs del request llevan el mismo contexto |
| **Masking PII/credenciales** | No (ECLB-204 pendiente) | Sí: MaskingEngine con fields/patterns/preserveLength |
| **Integridad / retención** | No (ECLB-203 pendiente) | Base: bindings `retention`, formatter y adapter pueden aplicar políticas; append-only/firma sería capa adicional |
| **Azure / Application Insights** | Transport propio (winston-azure-transport) | Adaptador/transport custom o UniversalAdapter a API |
| **Tests** | Mockear Winston + pool y varias rutas | createTestHelper(), mocks sin init/shutdown |
| **Idioma** | JavaScript | TypeScript (el backend es JS; se podría usar compilado o solo ideas) |

---

## 4. Ganancias concretas si se incorporan ideas o SyntropyLog

### 4.1 Unificación (ECLB-167)
- **Hoy**: Muchas versiones de `logSystemEvent`; distintas firmas y comportamientos.
- **Con enfoque SyntropyLog**: Un solo logger; todo lo “de auditoría” por `logger.audit()` (o categoría `audit`) y un único adapter/transport que escribe en `echeq_logs.system_logs`. Reducción de duplicación y criterio único.

### 4.2 Sanitización PII (ECLB-204)
- **Hoy**: Sin masking centralizado; riesgo de que PII/credenciales lleguen a logs.
- **Con SyntropyLog**: Masking aplicado en el pipeline antes de enviar a cualquier transport (consola, archivo, BD). Configuración por campos y patrones; una sola vez en el init.

### 4.3 Integridad y retención (ECLB-203)
- **Hoy**: Sin append-only ni firma ni política de retención en código.
- **SyntropyLog**: Permite bindings de retención y formateo; la política concreta (append-only, firma) se puede implementar en el `executor` del UniversalAdapter o en una capa encima (mismo esquema de “un solo punto de escritura”).

### 4.4 Menos código propio
- **Hoy**: `log-classifier.js`, `diagnostic-fields.js`, INSERT manual con 14 columnas, lógica de batch en DatabaseTransport.
- **Con UniversalAdapter + UniversalLogFormatter**: Un único mapeo JSON desde LogEntry a las columnas de `system_logs`; el `executor` hace el INSERT (o llama a un servicio). El clasificador “qué va a BD” se reemplaza por “todo lo que llega al transport audit”.

### 4.5 Trazabilidad
- **Hoy**: AsyncLocalStorage ya usado; traceId se propaga bien pero hay que recordar pasarlo en cada `createLogEntry`/context.
- **SyntropyLog**: El contexto (correlationId, traceId) se inyecta una vez en el middleware y queda en todos los logs del request sin tocar cada llamada.

### 4.6 Testing
- **Hoy**: Tests que dependen de Winston y a veces del pool.
- **SyntropyLog**: Helpers de test y mocks que evitan init/shutdown; se testea lógica de negocio sin levantar logging real.

---

## 5. Estrategia con el facade: reemplazo transparente

Hoy el **facade** (`src/utils/app-logger.js`) ya expone la API que usa el resto de la app (`info`, `warn`, `error`, `audit`). Eso permite:

1. **Primera historia de logger (p. ej. ECLB-167 – unificación)**  
   - Objetivo: un solo backend de log (una sola implementación de `logSystemEvent` / criterio único de auditoría).  
   - Acción: que **todo** el código que hoy llama a `loggers` / `logSystemEvent` pase a usar **solo** `appLogger`. El facade sigue delegando en `utils/logger`, pero detrás del facade ya hay una única implementación (Winston + un solo `logSystemEvent`).  
   - Resultado: el resto de la app solo conoce `appLogger`; la implementación concreta queda detrás del facade.

2. **Cambio posterior (p. ej. SyntropyLog u otra librería)**  
   - Cuando esté todo integrado con la primera historia, **solo se cambia la implementación dentro del facade** (p. ej. `getLegacyLogger()` deja de devolver Winston y devuelve un adapter que habla con SyntropyLog, o se reescribe el módulo para usar SyntropyLog directamente).  
   - La API de `appLogger` se mantiene; los llamadores no cambian. **Caso transparente**: mismo contrato, otra implementación.

Por tanto: el trabajo de la primera historia es unificar **detrás** del facade y migrar llamadas directas a `loggers`/`logSystemEvent` hacia `appLogger`. A partir de ahí, cualquier cambio de motor de log es local al facade.

---

## 6. Opciones de adopción

### A) Adoptar SyntropyLog como librería
- **Pros**: Un solo punto de log, masking, audit, UniversalAdapter, contexto automático, testing.
- **Contras**: Backend en JS; SyntropyLog en TS (usar compilado o paquete publicado).
- **Con el facade**: Migración = implementar detrás de `app-logger.js` un backend que use SyntropyLog (manteniendo la misma API `info`/`warn`/`error`/`audit`). Sin tocar el resto del código.

### B) Replicar solo ideas en el código actual (sin cambiar de librería)
- **Un solo `logSystemEvent`** detrás del facade y que todo (routes, systemLog.js, errorHandler, etc.) use **appLogger** → resuelve ECLB-167.
- **Pipeline de masking** en ese único punto antes de escribir a BD/archivos → acerca a ECLB-204.
- **Mapeo declarativo** para reemplazar `extractDiagnosticFields` por algo más mantenible.

### C) Híbrido
- Mantener Winston para consola/archivos/Azure detrás del facade.
- Introducir un **único** “audit sink” (p. ej. UniversalAdapter en JS) que reciba lo que hoy va a BD y lo mapee a `system_logs`. El facade sigue exponiendo la misma API.

---

## 7. Conclusión

- **Sí hay ganancia** en comparar con SyntropyLog: unificación (ECLB-167), sanitización (ECLB-204), menos código propio, trazabilidad más simple y mejor testing.
- **El facade actual** (`appLogger`) es la clave: concentrar todo el uso en él en la primera historia de logger permite que, más adelante, **cambiar la implementación (p. ej. a SyntropyLog) sea transparente** para el resto del código; solo se cambia qué hay detrás del facade.
- **Recomendación práctica**:  
  - **Primera historia**: ECLB-167 (un solo `logSystemEvent`) + que todo el backend use **solo** `appLogger`; la implementación única queda detrás del facade.  
  - **Siguiente**: ECLB-204 (masking) en ese único punto; opcionalmente formatter por mapeo JSON.  
  - **Cuando corresponda**: Si se adopta SyntropyLog (u otro motor), el cambio se hace **solo en el facade**; el resto sale transparente.

Si querés, el siguiente paso puede ser un plan de tareas concretas (por sprints) para la primera historia y la migración de llamadas a `appLogger`.
