# SyntropyLog Features — Canonical List with Examples

This document uses as its **reference** the full stack list described in [benchmark-memory-run.md](./benchmark-memory-run.md) (section "High-Demand Environments") and expands **each item** with a brief explanation and usage examples. It serves to verify that documentation and code are aligned, and to give new users a quick overview of what SyntropyLog includes and how to use it.

---

## Canonical Stack List

SyntropyLog is designed for **high-demand** and regulated environments. Benchmark figures are obtained with the **full stack** active. That stack includes:

1. **Native addon (Rust)** — single-pass serialize + mask + sanitize; ANSI strip in metadata.
2. **Logging Matrix** — declarative control of which context fields appear per level (lean on `info`, full on `error`).
3. **Universal Adapter** (and **AdapterTransport**) — send logs to any backend (PostgreSQL, MongoDB, Elasticsearch, S3) with a single `executor`; no vendor lock-in.
4. **MaskingEngine** — built-in and custom rules; sensitive fields never leave the pipeline.
5. **Serialization pipeline** — circular references, configurable depth limit, timeouts; logging never blocks the event loop.
6. **SanitizationEngine** — control character stripping; safe against log injection.
7. **Context / headers** — correlation ID and transaction ID propagation; single source of truth from config.
8. **Fluent API** — `withRetention`, `withSource`, `withTransactionId`.
9. **Per-call transport control** — `.override()`, `.add()`, `.remove()` without creating new logger instances.
10. **Audit and retention** — `audit` level; `withRetention(anyJson)` for compliance (SOX, GDPR); route by policy to dedicated transports.
11. **Lifecycle** — `init()` / `shutdown()`; graceful flush on SIGTERM/SIGINT.
12. **Observability hooks** — `onLogFailure`, `onTransportError`, `onSerializationFallback`, `onStepError`, `masking.onMaskingError`; `isNativeAddonInUse()`.
13. **Matrix at runtime** — `reconfigureLoggingMatrix()` without restart; security boundary: only changes which fields are visible.
14. **Tree-shaking** — `sideEffects: false` and ESM; only what you import ends up in the bundle.

Each item is expanded with explanation and examples below.

---

## 1. Native Addon (Rust)

**What it is:** An optional Rust addon that performs serialization, masking, and sanitization in a single pass. Includes ANSI stripping in metadata. If the addon is unavailable (unsupported platform, incompatible Node version), the framework transparently falls back to the JS pipeline.

**Example:** Nothing to configure; if you install the package on Linux/Windows/macOS with Node ≥20, the addon is used automatically. To disable it (e.g. for debugging): `SYNTROPYLOG_NATIVE_DISABLE=1`.

```ts
// Check at runtime whether the addon is in use
if (syntropyLog.isNativeAddonInUse()) {
  console.log('Using Rust pipeline');
}
```

**Docs:** [building-native-addon.md](./building-native-addon.md).

---

## 2. Logging Matrix

**What it is:** A declarative contract that defines **exactly** which context fields appear at each log level. On `info` you might have only `correlationId` and `userId`; on `error` and `fatal`, the full context. This keeps success logs lean and error logs fully detailed for debugging.

**Example:**

```ts
await syntropyLog.init({
  logger: { level: 'info', serviceName: 'my-app' },
  loggingMatrix: {
    default: ['correlationId'],
    info:    ['correlationId', 'userId', 'operation'],
    warn:    ['correlationId', 'userId', 'operation', 'errorCode'],
    error:   ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId', 'orderId'],
    fatal:   ['*'],  // all context fields
  },
});
```

Same `logger.info(...)` and `logger.error(...)`; what changes is which context fields are included in the payload, based on the level.

---

## 3. Universal Adapter and AdapterTransport

**What it is:** Send each log to **any** backend (PostgreSQL, MongoDB, Elasticsearch, S3, etc.) by implementing a single `executor` function. No vendor lock-in; the entry point is a log object that is already serialized and masked.

**Example:**

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

The `executor` receives a single object with `level`, `message`, `serviceName`, `correlationId`, `timestamp`, `meta` (already masked). Where and how to persist is up to your code.

---

## 4. MaskingEngine

**What it is:** Redacts sensitive fields **before** the log reaches any transport. Includes built-in rules (password, email, token, credit card, SSN, phone) and custom rules by name or regex. Sensitive values never leave the pipeline.

**Example:**

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

For custom rules **without string literals** (and without Sonar alerts), import the **`maskEnum`** object: it includes all aliases (`MASK_KEY_*`) and the arrays `MASK_KEYS_PASSWORD`, `MASK_KEYS_TOKEN`, `MASK_KEYS_ALL`. One import, declarative. Details: [Sensitive key aliases](./SENSITIVE_KEY_ALIASES.md).

If masking fails (e.g. timeout on a custom rule), the pipeline does not throw: it returns the object and processing continues (Silent Observer).

---

## 5. Serialization Pipeline

**What it is:** Pipeline that prevents logging from blocking the event loop: detects and neutralizes circular references, applies a configurable **depth limit** (default 10; deeper nodes are replaced with `[MAX_DEPTH_REACHED]`) and a configurable **timeout** (default 5s via `serializerTimeoutMs`). If serialization takes too long, it aborts and logs a safe subset.

**Example:**

```ts
await syntropyLog.init({
  logger: {
    serviceName: 'my-app',
    serializerTimeoutMs: 5000,  // optional; default 5s
  },
});
// Objects with circular references or excessive depth won't crash the app;
// the pipeline handles them safely and logging continues.
```

There is no "breadth limit" in the current code; only depth and timeout.

---

## 6. SanitizationEngine

**What it is:** Removes control characters and ANSI sequences from string values before they reach any transport. Reduces the risk of **log injection** in terminals or SIEM systems.

**Example:** No separate configuration needed; it runs inside the pipeline. Together with the Logging Matrix (field whitelist), it forms the security boundary for log content.

---

## 7. Context / Headers (Correlation ID, Transaction ID)

**What it is:** Config defines header names (e.g. `X-Correlation-ID`, `X-Transaction-ID`) once. Those values propagate to all logs and calls within the context (e.g. inside `contextManager.run()` or in middleware using the context).

**Example:**

```ts
await syntropyLog.init({
  context: {
    correlationIdHeader: 'X-Correlation-ID',
    transactionIdHeader: 'X-Transaction-ID',
  },
});

// In middleware (Express/Fastify):
app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    const correlationId = contextManager.getCorrelationId();
    contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
    next();
  });
});
```

From that point on, every `logger.info(...)` inside that request carries the same `correlationId` without passing it manually.

---

## 8. Fluent API — withRetention, withSource, withTransactionId

**What it is:** Methods that return **new** (immutable) loggers with fixed metadata: `withSource('ModuleName')`, `withTransactionId('txn-123')`, `withRetention({ policy: 'SOX', years: 5 })`. Every log from that logger carries that data without having to pass it on each call.

**Example:**

```ts
const log = syntropyLog.getLogger();

const auditLogger = log
  .withSource('PaymentService')
  .withRetention({ policy: 'SOX_AUDIT_TRAIL', years: 5 });

auditLogger.audit({ userId: 123, action: 'payment' }, 'Payment processed');
// Entry includes source: 'PaymentService' and retention: { policy: 'SOX_AUDIT_TRAIL', years: 5 }
```

---

## 9. Per-Call Transport Control

**What it is:** For a **single** log call you can change destinations without touching global config: send only to certain transports (`.override('console')`), add destinations (`.add('azure')`), or remove one (`.remove('db')`). No need to create new logger instances.

**Example:**

```ts
const log = syntropyLog.getLogger('app');

log.info('goes to default env transports');

log.override('console').info('only to console');
log.add('azure').info('default + Azure');
log.remove('db').add('file').info('no db, with file');
```

Each method applies only to the **next** log; the following call without override/add/remove reverts to the default set.

**Docs:** [TRANSPORT_POOL_AND_ENV.md](../examples/TRANSPORT_POOL_AND_ENV.md).

---

## 10. Audit and Retention

**What it is:**
- **Audit:** `audit` level that is always logged, regardless of the configured minimum level (bypasses the level filter).
- **Retention:** `withRetention(anyJson)` attaches policy metadata (e.g. GDPR, SOX, PCI-DSS) to each log; the Universal Adapter `executor` can route by `retention.policy` to dedicated tables or buckets.

**Example:**

```ts
const auditLogger = log.withRetention({ policy: 'GDPR_ARTICLE_17', years: 7, region: 'eu-west-1' });
auditLogger.audit({ userId: 123, action: 'data-export' }, 'GDPR export');
// Always written; retention travels in the entry for the executor to route it.
```

---

## 11. Lifecycle — init / shutdown

**What it is:** `init()` starts the pipeline and emits `ready` when ready. **Do not** use `getLogger()` before `ready` has been emitted. `shutdown()` does a graceful flush (waits for in-flight logs to be written) and closes resources; hook it to SIGTERM/SIGINT.

**Example:**

```ts
async function main() {
  await new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', reject);
    syntropyLog.init(config);
  });
  const log = syntropyLog.getLogger();
  log.info('System ready');

  process.on('SIGTERM', async () => {
    await syntropyLog.shutdown();
    process.exit(0);
  });
}
```

---

## 12. Observability Hooks

**What it is:** Optional callbacks in config to observe failures without logging throwing: `onLogFailure`, `onTransportError`, `onSerializationFallback`, `onStepError`, `masking.onMaskingError`. Additionally, `isNativeAddonInUse()` indicates at runtime whether the Rust addon is being used.

**Example:**

```ts
await syntropyLog.init({
  logger: { ... },
  onLogFailure: (err, entry) => metrics.increment('log_failures'),
  onTransportError: (err, context) => alerting.notify('transport', context, err),
  onSerializationFallback: (reason) => metrics.increment('serialization_fallback'),
  masking: { onMaskingError: (err) => metrics.increment('masking_errors') },
});
```

None of these hooks should throw; the pipeline continues even if a transport or step fails.

---

## 13. Matrix at Runtime — reconfigureLoggingMatrix

**What it is:** Change the Logging Matrix **on the fly**, without restarting. Useful to temporarily increase verbosity in production (e.g. include all fields on `error`). The security boundary: only changes **which fields** are visible per level; does not modify masking, transports, or infrastructure.

**Example:**

```ts
// Temporarily enable full context on error
syntropyLog.reconfigureLoggingMatrix({
  default: ['correlationId'],
  info:    ['correlationId', 'userId', 'operation'],
  error:   ['*'],
});
// Restore later
syntropyLog.reconfigureLoggingMatrix(originalMatrix);
```

---

## 14. Tree-Shaking

**What it is:** The package is published with `sideEffects: false` and as ESM. Bundlers (Vite, Rollup, webpack, esbuild) can eliminate code you don't import; only what you use ends up in the final bundle.

**Example:** If you only import `syntropyLog` and `ClassicConsoleTransport`, the rest of the transports and adapters you don't reference won't be included.

---

## References

- **Original list (benchmark):** [benchmark-memory-run.md](./benchmark-memory-run.md) — section "High-Demand Environments".
- **README (EN):** [../README.md](../README.md) — Quick Start, Matrix, Masking, Universal Adapter, shutdown, etc.
- **Transport pool (EN):** [../examples/TRANSPORT_POOL_AND_ENV.md](../examples/TRANSPORT_POOL_AND_ENV.md).
