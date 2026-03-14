# SyntropyLog

<p align="center">
  <img src="https://raw.githubusercontent.com/Syntropysoft/SyntropyLog/main/assets/beaconLog-2.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>Structured Observability Framework for Node.js</strong>
  <br />
  Declarative. Flexible. Built for regulated environments.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml"><img src="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml/badge.svg" alt="CI Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-95.13%25-brightgreen" alt="Test Coverage"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-v0.11.1-brightgreen.svg" alt="Version 0.11.1"></a>
  <a href="https://socket.dev/npm/package/syntropylog"><img src="https://socket.dev/api/badge/npm/package/syntropylog" alt="Socket Badge"></a>
</p>

---

## What is SyntropyLog?

SyntropyLog is a **structured observability framework** for Node.js. You declare what your logs should carry (context, level-based fields, retention, masking), and SyntropyLog makes it happen everywhere—automatically. No manual plumbing, no hidden behavior.

It is built for **high demand** and **regulated environments** (banking, healthcare, financial services): HIPAA-style field control via the Logging Matrix, SOX-style audit trails via `withRetention`, and a pipeline that never lets logging crash your app.

---

## Full picture — what's in the box

Everything below is part of the same stack (benchmarks use this full stack). Each item has a **How** section in this README so you can see how to use it.

| # | Feature | What it does |
|---|--------|---------------|
| 1 | **Native addon (Rust)** | Single-pass serialize + mask + sanitize; ANSI strip. Falls back to JS if unavailable. |
| 2 | **Logging Matrix** | Declarative control of which context fields appear per level (lean on `info`, full on `error`). |
| 3 | **Universal Adapter** | Send logs to any backend (PostgreSQL, MongoDB, Elasticsearch, S3) via one `executor` function. |
| 4 | **MaskingEngine** | Redact sensitive fields before any transport; built-in + custom rules. |
| 5 | **Serialization pipeline** | Circular refs, depth limit, timeout; logging never blocks the event loop. |
| 6 | **SanitizationEngine** | Strip control characters; log injection resistant. |
| 7 | **Context / headers** | Correlation ID and transaction ID from config; single source of truth. |
| 8 | **Fluent API** | `withRetention`, `withSource`, `withTransactionId` — bind once, carry on every log. |
| 9 | **Per-call transport control** | `.override()`, `.add()`, `.remove()` for one log call without new logger instances. |
| 10 | **Audit & retention** | `audit` level (always logged); `withRetention(anyJson)` for compliance routing. |
| 11 | **Lifecycle** | `init()` / `shutdown()`; graceful flush on SIGTERM/SIGINT. |
| 12 | **Observability hooks** | `onLogFailure`, `onTransportError`, `onSerializationFallback`, etc.; `isNativeAddonInUse()`. |
| 13 | **Matrix in runtime** | `reconfigureLoggingMatrix()` without restart; only field visibility, not security. |
| 14 | **Tree-shaking** | `sideEffects: false` + ESM; bundle only what you import. |

**More detail and examples (ES):** [doc-es/caracteristicas-y-ejemplos.md](doc-es/caracteristicas-y-ejemplos.md).

---

## Quick Start

### Install

```bash
npm install syntropylog
```

Prebuilt native addon (Rust) for Linux, Windows, macOS installs automatically on Node ≥20. If unavailable, the JS pipeline is used transparently.

### Init and first log

**Initialization is a Promise that must resolve before you can print logs.** Until it resolves (on the `ready` event), `getLogger()` returns a no-op logger that drops all messages. Listen for `ready` and `error` *before* calling `init()`.

```typescript
import { syntropyLog } from 'syntropylog';

async function initializeSyntropyLog() {
  return new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', (err) => reject(err));
    syntropyLog.init({
      logger: { level: 'info', serviceName: 'my-app' },
    });
  });
}

async function main() {
  await initializeSyntropyLog();   // promise must resolve before any log
  const log = syntropyLog.getLogger();
  log.info('Hello, SyntropyLog.');
}
main();
```

### Graceful shutdown

```typescript
process.on('SIGTERM', async () => {
  await syntropyLog.shutdown();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await syntropyLog.shutdown();
  process.exit(0);
});
```

### Framework entry points

| Framework | Where to call `await init` |
|----------|----------------------------|
| Express / Fastify | Before `app.listen()` in server entry |
| NestJS | `AppModule.onModuleInit()` or before `app.listen()` in `bootstrap()` |
| Lambda / Serverless | Module-level lazy singleton (outside the handler) |

---

## 1. Native addon (Rust)

**What:** Optional Rust addon does serialize + mask + sanitize in one pass. Used automatically when available; no config. Disable with `SYNTROPYLOG_NATIVE_DISABLE=1` (e.g. debugging).

**How:** Nothing to configure. Check at runtime:

```typescript
if (syntropyLog.isNativeAddonInUse()) {
  // Rust pipeline active
}
```

See [doc-es/building-native-addon.es.md](doc-es/building-native-addon.es.md) for building from source.

---

## 2. Logging Matrix

**What:** A JSON contract that defines exactly which context fields appear at each log level. If a field isn’t in the matrix for that level, it never appears in the output.

**How:** Set `loggingMatrix` in `init()`:

```typescript
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

| Matrix key | Resolves to context |
|------------|---------------------|
| `correlationId` | `x-correlation-id`, `correlationId` |
| `transactionId` | `x-trace-id`, `transactionId` |
| `userId`, `tenantId`, `operation`, `errorCode`, `orderId`, `paymentId`, `eventType` | same key |
| `*` | All context fields |

---

## 3. Universal Adapter — log to any backend

**What:** Send each log to PostgreSQL, MongoDB, Elasticsearch, S3, etc. by implementing a single `executor`. No vendor lock-in; you receive one structured object per log (already masked).

**How:** Use `AdapterTransport` + `UniversalAdapter`:

```typescript
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

`logEntry` has: `level`, `message`, `serviceName`, `correlationId`, `timestamp`, `meta`. If `executor` throws, SyntropyLog logs the error and continues (Silent Observer).

---

## 4. MaskingEngine

**What:** Redacts sensitive fields before logs reach any transport. Built-in rules (password, email, token, card, SSN, phone) plus custom rules by name/regex.

**How:** Configure `masking` in `init()`:

```typescript
import { MaskingStrategy } from 'syntropylog';

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

| Strategy | Example output |
|----------|----------------|
| PASSWORD | `********` |
| EMAIL | `j***@example.com` |
| TOKEN | `eyJh...a1B9c` |
| CREDIT_CARD | `****-****-****-1234` |

If masking fails, the pipeline does not throw (Silent Observer). Custom rules: use ReDoS-safe regex; keys longer than 256 chars are skipped.

---

## 5. Serialization pipeline (resilience)

**What:** Prevents "death by log": circular refs are neutralized, depth is limited (default 10 → `[MAX_DEPTH_REACHED]`), and a configurable timeout via `serializerTimeoutMs` aborts long serialization so the event loop keeps running. For most apps 50–100ms is enough; the library default is higher.

**How:** Set timeout in logger config (e.g. 50–100ms):

```typescript
logger: {
  serviceName: 'my-app',
  serializerTimeoutMs: 100,  // optional; e.g. 50–100ms for most apps
}
```

Logging never throws; failures are reported inside the log payload.

---

## 6. SanitizationEngine

**What:** Strips control characters and ANSI from string values before any transport writes. Reduces log injection risk.

**How:** No configuration; it runs inside the pipeline. Together with the Logging Matrix (whitelist), it forms the safety boundary for log content.

---

## 7. Context — correlation ID and transaction ID

**What:** One config defines header names; correlation and transaction IDs propagate to all logs and operations inside the same context (e.g. one request).

**How:** Set `context` in `init()` and use a small middleware:

```typescript
await syntropyLog.init({
  context: {
    correlationIdHeader: 'X-Correlation-ID',
    transactionIdHeader: 'X-Transaction-ID',
  },
});

// Express/Fastify middleware (once per app)
const { contextManager } = syntropyLog;
app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    const correlationId = contextManager.getCorrelationId();
    contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
    next();
  });
});
```

After that, every `logger.info(...)` inside the request carries the same `correlationId` without passing it manually.

---

## 8. Fluent API — withRetention, withSource, withTransactionId

**What:** Builders that return new loggers with bound metadata: `withSource('ModuleName')`, `withTransactionId('txn-123')`, `withRetention({ policy: 'SOX', years: 5 })`. Every log from that logger carries that data.

**How:**

```typescript
const log = syntropyLog.getLogger();

const auditLogger = log
  .withSource('PaymentService')
  .withRetention({ policy: 'SOX_AUDIT_TRAIL', years: 5 });

auditLogger.info({ userId: 123, action: 'payment' }, 'Payment processed');
// Entry includes source and retention; your executor can route by retention.policy
```

| Builder | Binds |
|---------|--------|
| `withSource('X')` | `source: 'X'` |
| `withTransactionId('id')` | `transactionId: 'id'` |
| `withRetention({ ... })` | `retention: { ... }` (any JSON) |
| `child({ k: v })` | arbitrary key-value |

---

## 9. Per-call transport control

**What:** For a single log call you can send only to specific transports (`.override()`), add destinations (`.add()`), or remove one (`.remove()`), without creating new logger instances.

**How:** Define a transport pool with `transportList` and `env`, then use the fluent methods on the next call only:

```typescript
await syntropyLog.init({
  logger: {
    envKey: 'NODE_ENV',
    transportList: {
      consola: new ColorfulConsoleTransport({ name: 'consola' }),
      db:      dbTransport,
      azure:   azureTransport,
    },
    env: {
      development: ['consola'],
      production:  ['consola', 'db', 'azure'],
    },
  },
});

const log = syntropyLog.getLogger('app');
log.info('uses env default');
log.override('consola').info('only to console');
log.remove('db').add('azure').info('default minus db, plus azure');
```

See [examples/TRANSPORT_POOL_AND_ENV.md](examples/TRANSPORT_POOL_AND_ENV.md) and `examples/TransportPoolExample.ts`.

---

## 10. Audit and retention

**What:** The `audit` level is always logged regardless of the configured level. `withRetention(anyJson)` attaches policy metadata (e.g. GDPR, SOX, PCI-DSS) so your `executor` can route to different tables or buckets.

**How:**

```typescript
const auditLogger = log.withRetention({ policy: 'GDPR_ARTICLE_17', years: 7 });
auditLogger.audit({ userId: 123, action: 'data-export' }, 'GDPR export');
// Always written; retention travels in the entry for routing
```

Your `executor` can read `logEntry.retention?.policy` and persist to the right store.

---

## 11. Lifecycle — init / shutdown

**What:** `init()` starts the pipeline and emits `ready` when safe to use. `shutdown()` flushes in-flight logs and closes resources; hook it to SIGTERM/SIGINT so you don’t lose logs on exit.

**How:** Init is shown in Quick Start. Shutdown:

```typescript
process.on('SIGTERM', async () => {
  await syntropyLog.shutdown();
  process.exit(0);
});
```

---

## 12. Observability hooks

**What:** Optional callbacks to observe failures without logging throwing: `onLogFailure`, `onTransportError`, `onSerializationFallback`, `onStepError`, `masking.onMaskingError`. Plus `isNativeAddonInUse()` at runtime.

**How:** Pass them in `init()`:

```typescript
await syntropyLog.init({
  logger: { ... },
  onLogFailure: (err, entry) => metrics.increment('log_failures'),
  onTransportError: (err, context) => alerting.notify('transport', context, err),
  onSerializationFallback: () => metrics.increment('serialization_fallback'),
  masking: { onMaskingError: (err) => metrics.increment('masking_errors') },
});
```

| Hook | When it runs |
|------|----------------|
| `onLogFailure?(error, entry)` | Log call fails (serialization or transport) |
| `onTransportError?(error, context)` | Transport fails; `context` is `'flush'`, `'shutdown'`, or `'log'` |
| `onSerializationFallback?(reason)` | Native addon failed for this call; JS pipeline used |
| `onStepError?(step, error)` | Pipeline step failed (e.g. hygiene) |
| `masking.onMaskingError?(error)` | Masking failed (e.g. timeout); never receives raw payload |

---

## 13. Matrix in runtime

**What:** Change which context fields are visible per level without restart. Security boundary: only field visibility changes; masking and transports stay as set at `init()`.

**How:**

```typescript
syntropyLog.reconfigureLoggingMatrix({
  default: ['correlationId'],
  info:    ['correlationId', 'userId', 'operation'],
  error:   ['*'],
});
// Restore later with original matrix
```

---

## 14. Tree-shaking

**What:** Package is published with `sideEffects: false` and ESM so bundlers include only what you import.

**How:** Import only what you use; unused transports and adapters are dropped from the bundle.

---

## Console transports (default and pretty)

By default the library outputs **plain JSON** to the console. For colored, human-readable output in development, use a pretty transport:

| Transport | Style |
|-----------|--------|
| *(default)* | Plain JSON |
| `ClassicConsoleTransport` | Single-line, colored |
| `PrettyConsoleTransport` | Pretty-printed, colored |
| `CompactConsoleTransport` | Compact one-liner, colored |
| `ColorfulConsoleTransport` | Full-line colored |

Colors use built-in ANSI; no chalk. Disabled when stdout is not a TTY or when `NO_COLOR` is set.

```typescript
import { ClassicConsoleTransport } from 'syntropylog';
syntropyLog.init({
  logger: {
    level: 'info',
    serviceName: 'my-app',
    transports: [new ClassicConsoleTransport()],
  },
});
```

---

## Security & Compliance

| Dynamically configurable | Fixed at init |
|--------------------------|---------------|
| Logging Matrix, log level, additive masking rules | Transports, core masking config (`maskChar`, `maxDepth`), Redis/HTTP/broker |

---

## Documentation

- **[Features and examples (ES)](doc-es/caracteristicas-y-ejemplos.md)** — Canonical stack list with explanations and code examples; aligned with the benchmark report.
- **[Benchmark report (throughput + memory)](doc-es/benchmark-memory-run.md)** — Run `pnpm run bench` or `pnpm run bench:memory` from repo root. Compare native vs JS: `pnpm run bench` vs `SYNTROPYLOG_NATIVE_DISABLE=1 pnpm run bench`.
- **[Rust addon (ES)](doc-es/building-native-addon.es.md)** — Build from source.
- **[Improvement plan & roadmap](doc-es/code-improvement-analysis-and-plan.md)** — Backlog and phased plan.
- **[Rust implementation plan (ES)](doc-es/rust-implementation-plan.md)** — Native addon checklist; links to [rust-pipeline-optimization.md](doc-es/rust-pipeline-optimization.md).

---

## Contributing & License

See [CONTRIBUTING.md](./CONTRIBUTING.md). License: **Apache-2.0**.
