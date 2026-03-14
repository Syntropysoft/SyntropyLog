# Características de SyntropyLog — Lista canónica con ejemplos

Este documento toma como **referencia** la lista del stack completo que se describe en [benchmark-memory-run.md](./benchmark-memory-run.md) (sección «Entornos de alta demanda») y expande **cada punto** con una breve explicación y ejemplos de uso. Sirve para revisar que la documentación y el código estén alineados y para que nuevos usuarios vean de un vistazo qué incluye SyntropyLog y cómo usarlo.

---

## Lista canónica del stack

SyntropyLog está pensado para **alta demanda** y entornos regulados. Las cifras de benchmarks se obtienen con **todo el stack** activo. Ese stack incluye:

1. **Addon nativo (Rust)** — un solo recorrido serializar + enmascarar + sanitizar; strip ANSI en metadata.
2. **Logging Matrix** — control declarativo de qué campos de contexto salen por nivel (poco en `info`, todo en `error`).
3. **Universal Adapter** (y **AdapterTransport**) — enviar logs a cualquier backend (PostgreSQL, MongoDB, Elasticsearch, S3) con un solo `executor`; sin atarte a un vendor.
4. **MaskingEngine** — reglas built-in y custom; los campos sensibles no salen del pipeline.
5. **Pipeline de serialización** — referencias circulares, límite de profundidad configurable, timeouts; el log no bloquea el event loop.
6. **SanitizationEngine** — strip de caracteres de control; seguro frente a log injection.
7. **Contexto / headers** — propagación de correlation ID y transaction ID; única fuente de verdad desde la config.
8. **API fluida** — `withRetention`, `withSource`, `withTransactionId`.
9. **Control de transports por llamada** — `.override()`, `.add()`, `.remove()` sin crear nuevas instancias de logger.
10. **Audit y retention** — nivel `audit`; `withRetention(anyJson)` para compliance (SOX, GDPR); enrutar por política a transports dedicados.
11. **Ciclo de vida** — `init()` / `shutdown()`; flush graceful en SIGTERM/SIGINT.
12. **Hooks de observabilidad** — `onLogFailure`, `onTransportError`, `onSerializationFallback`, `onStepError`, `masking.onMaskingError`; `isNativeAddonInUse()`.
13. **Matrix en runtime** — `reconfigureLoggingMatrix()` sin reiniciar; frontera de seguridad: solo cambia qué campos se ven.
14. **Tree-shaking** — `sideEffects: false` y ESM; en el bundle solo entra lo que importás.

A continuación cada punto se desarrolla con explicación y ejemplos.

---

## 1. Addon nativo (Rust)

**Qué es:** Un addon opcional en Rust que hace en un solo recorrido la serialización, el masking y la sanitización. Incluye strip de ANSI en metadata. Si el addon no está disponible (plataforma no soportada, Node incompatible), el framework usa el pipeline en JS de forma transparente.

**Ejemplo:** No hace falta configurar nada; si instalás el paquete en Linux/Windows/macOS con Node ≥20, el addon se usa automáticamente. Para deshabilitarlo (p. ej. debugging): `SYNTROPYLOG_NATIVE_DISABLE=1`.

```ts
// Comprobar en runtime si el addon está en uso
if (syntropyLog.isNativeAddonInUse()) {
  console.log('Usando pipeline Rust');
}
```

**Docs:** [building-native-addon.es.md](./building-native-addon.es.md).

---

## 2. Logging Matrix

**Qué es:** Un contrato declarativo que define **exactamente** qué campos del contexto aparecen en cada nivel de log. En `info` podés tener solo `correlationId` y `userId`; en `error` y `fatal` todo el contexto. Así los logs de éxito son livianos y los de error tienen todo lo necesario para depurar.

**Ejemplo:**

```ts
await syntropyLog.init({
  logger: { level: 'info', serviceName: 'my-app' },
  loggingMatrix: {
    default: ['correlationId'],
    info:    ['correlationId', 'userId', 'operation'],
    warn:    ['correlationId', 'userId', 'operation', 'errorCode'],
    error:   ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId', 'orderId'],
    fatal:   ['*'],  // todos los campos del contexto
  },
});
```

Mismo `logger.info(...)` y `logger.error(...)`; lo que cambia es qué campos del contexto se incluyen en el payload, según el nivel.

---

## 3. Universal Adapter y AdapterTransport

**Qué es:** Enviar cada log a **cualquier** backend (PostgreSQL, MongoDB, Elasticsearch, S3, etc.) implementando una sola función `executor`. No hay acople a un vendor; el entry point es un objeto de log ya serializado y enmascarado.

**Ejemplo:**

```ts
import { AdapterTransport, UniversalAdapter } from 'syntropylog';

const dbTransport = new AdapterTransport({
  name: 'db',
  adapter: new UniversalAdapter({
    executor: async (logEntry) => {
      await prisma.systemLog.create({
        data: {
          level:         logEntry.level,
          message:       logEntry.message,
          serviceName:   logEntry.serviceName,
          correlationId: logEntry.correlationId,
          payload:       logEntry.meta,
          timestamp:     new Date(logEntry.timestamp),
        },
      });
    },
  }),
});
```

El `executor` recibe un único objeto con `level`, `message`, `serviceName`, `correlationId`, `timestamp`, `meta` (ya enmascarado). Dónde y cómo persistir depende de tu código.

---

## 4. MaskingEngine

**Qué es:** Redacta campos sensibles **antes** de que el log llegue a cualquier transport. Incluye reglas built-in (password, email, token, tarjeta, SSN, teléfono) y reglas custom por nombre o por regex. Los valores sensibles no salen del pipeline.

**Ejemplo:**

```ts
await syntropyLog.init({
  logger: { ... },
  masking: {
    enableDefaultRules: true,
    maskChar: '*',
    preserveLength: true,
    rules: [
      {
        pattern: /cuit|cuil/i,
        strategy: MaskingStrategy.CUSTOM,
        customMask: (value) => value.replace(/\d(?=\d{4})/g, '*'),
      },
    ],
  },
});
```

Para reglas custom **sin literales** (y sin alertas de Sonar), importá el objeto **`maskEnum`**: incluye todos los aliases (`MASK_KEY_*`) y los arrays `MASK_KEYS_PASSWORD`, `MASK_KEYS_TOKEN`, `MASK_KEYS_ALL`. Un solo import, declarativo. Detalle: [Sensitive key aliases (EN)](../docs/SENSITIVE_KEY_ALIASES.md).

Si el masking falla (p. ej. timeout en una regla custom), el pipeline no lanza: devuelve el objeto y el flujo sigue (Silent Observer).

---

## 5. Pipeline de serialización

**Qué es:** Pipeline que evita que el log bloquee el event loop: detecta y neutraliza referencias circulares, aplica un **límite de profundidad** configurable (default 10; los nodos más profundos se reemplazan por `[MAX_DEPTH_REACHED]`) y un **timeout** configurable (default 5s vía `serializerTimeoutMs`). Si la serialización tarda demasiado, se aborta y se loguea un subconjunto seguro.

**Ejemplo:**

```ts
await syntropyLog.init({
  logger: {
    serviceName: 'my-app',
    serializerTimeoutMs: 5000,  // opcional; default 5s
  },
});
// Objetos con referencias circulares o muy profundos no tiran la app;
// el pipeline los trata de forma segura y el log sigue.
```

No hay un “límite de ancho” (breadth) en el código actual; solo profundidad y timeout.

---

## 6. SanitizationEngine

**Qué es:** Elimina caracteres de control y secuencias ANSI de los valores de string antes de que lleguen a cualquier transport. Reduce el riesgo de **log injection** en terminales o en SIEM.

**Ejemplo:** No se configura por separado; corre dentro del pipeline. Junto con la Logging Matrix (whitelist de campos), forma la frontera de seguridad del contenido que se escribe en logs.

---

## 7. Contexto / headers (correlation ID, transaction ID)

**Qué es:** La config define los nombres de header (p. ej. `X-Correlation-ID`, `X-Transaction-ID`) una sola vez. Esos valores se propagan a todos los logs y llamadas dentro del contexto (p. ej. dentro de `contextManager.run()` o en middlewares que usen el contexto).

**Ejemplo:**

```ts
await syntropyLog.init({
  context: {
    correlationIdHeader: 'X-Correlation-ID',
    transactionIdHeader: 'X-Transaction-ID',
  },
});

// En middleware (Express/Fastify):
app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    const correlationId = contextManager.getCorrelationId();
    contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
    next();
  });
});
```

A partir de ahí, cada `logger.info(...)` dentro de ese request lleva el mismo `correlationId` sin pasarlo a mano.

---

## 8. API fluida — withRetention, withSource, withTransactionId

**Qué es:** Métodos que devuelven **nuevos** loggers (inmutables) con metadatos fijos: `withSource('ModuleName')`, `withTransactionId('txn-123')`, `withRetention({ policy: 'SOX', years: 5 })`. Cada log de ese logger lleva esos datos sin tener que pasarlos en cada llamada.

**Ejemplo:**

```ts
const log = syntropyLog.getLogger();

const auditLogger = log
  .withSource('PaymentService')
  .withRetention({ policy: 'SOX_AUDIT_TRAIL', years: 5 });

auditLogger.info({ userId: 123, action: 'payment' }, 'Payment processed');
// El entry incluye source: 'PaymentService' y retention: { policy: 'SOX_AUDIT_TRAIL', years: 5 }
```

---

## 9. Control de transports por llamada

**Qué es:** Para **una sola** llamada a log podés cambiar destinos sin tocar la config global: enviar solo a ciertos transports (`.override('consola')`), agregar destinos (`.add('azure')`) o quitar uno (`.remove('db')`). No hace falta crear nuevas instancias de logger.

**Ejemplo:**

```ts
const log = syntropyLog.getLogger('app');

log.info('va a los transports por defecto del env');

log.override('consola').info('solo a consola');
log.add('azure').info('default + Azure');
log.remove('db').add('archivo').info('sin db, con archivo');
```

Cada método aplica solo al **siguiente** log; el siguiente sin override/add/remove vuelve al conjunto por defecto.

**Docs:** [TRANSPORT_POOL_AND_ENV.md](../examples/TRANSPORT_POOL_AND_ENV.md).

---

## 10. Audit y retention

**Qué es:**  
- **Audit:** nivel `audit` que se loguea siempre, independiente del level configurado (bypass del filtro por nivel).  
- **Retention:** `withRetention(anyJson)` adjunta metadatos de política (p. ej. GDPR, SOX, PCI-DSS) a cada log; el `executor` del Universal Adapter puede enrutar por `retention.policy` a tablas o buckets dedicados.

**Ejemplo:**

```ts
const auditLogger = log.withRetention({ policy: 'GDPR_ARTICLE_17', years: 7, region: 'eu-west-1' });
auditLogger.audit({ userId: 123, action: 'data-export' }, 'GDPR export');
// Siempre se escribe; retention viaja en el entry para que el executor lo enrute.
```

---

## 11. Ciclo de vida — init / shutdown

**Qué es:** `init()` arranca el pipeline, conexiones (Redis, etc.) y emite `ready` cuando está listo. **No** se debe usar `getLogger()` antes de que `ready` haya sido emitido. `shutdown()` hace flush graceful (espera a que se escriban los logs en curso) y cierra recursos; conviene engancharlo a SIGTERM/SIGINT.

**Ejemplo:**

```ts
async function main() {
  await new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', reject);
    syntropyLog.init(config);
  });
  const log = syntropyLog.getLogger();
  log.info('Sistema listo');

  process.on('SIGTERM', async () => {
    await syntropyLog.shutdown();
    process.exit(0);
  });
}
```

---

## 12. Hooks de observabilidad

**Qué es:** Callbacks opcionales en la config para observar fallos sin que el logging tire: `onLogFailure`, `onTransportError`, `onSerializationFallback`, `onStepError`, `masking.onMaskingError`. Además `isNativeAddonInUse()` indica en runtime si se está usando el addon Rust.

**Ejemplo:**

```ts
await syntropyLog.init({
  logger: { ... },
  onLogFailure: (err, entry) => metrics.increment('log_failures'),
  onTransportError: (err, context) => alerting.notify('transport', context, err),
  onSerializationFallback: (reason) => metrics.increment('serialization_fallback'),
  masking: { onMaskingError: (err) => metrics.increment('masking_errors') },
});
```

Ninguno de estos hooks debe lanzar; el pipeline sigue aunque falle un transport o un paso.

---

## 13. Matrix en runtime — reconfigureLoggingMatrix

**Qué es:** Cambiar la Logging Matrix **en caliente**, sin reiniciar. Útil para subir temporalmente la verbosidad en producción (p. ej. incluir todos los campos en `error`). La frontera de seguridad: solo cambia **qué campos** se ven por nivel; no modifica masking, transports ni infra.

**Ejemplo:**

```ts
// Habilitar contexto completo en error temporalmente
syntropyLog.reconfigureLoggingMatrix({
  default: ['correlationId'],
  info:    ['correlationId', 'userId', 'operation'],
  error:   ['*'],
});
// Restaurar después
syntropyLog.reconfigureLoggingMatrix(originalMatrix);
```

---

## 14. Tree-shaking

**Qué es:** El paquete se publica con `sideEffects: false` y como ESM. Los bundlers (Vite, Rollup, webpack, esbuild) pueden eliminar el código que no se importa; en el bundle final solo entra lo que usás.

**Ejemplo:** Si solo importás `syntropyLog` y `ClassicConsoleTransport`, no se incluye el resto de transports ni adapters que no referencies.

---

## Referencias

- **Lista original (benchmark):** [benchmark-memory-run.md](./benchmark-memory-run.md) — sección «Entornos de alta demanda».
- **README (EN):** [../README.md](../README.md) — Quick Start, Matrix, Masking, Universal Adapter, shutdown, etc.
- **Transport pool (EN):** [../examples/TRANSPORT_POOL_AND_ENV.md](../examples/TRANSPORT_POOL_AND_ENV.md).
