<p align="center">
  <img src="https://syntropysoft.com/syntropylog-logo.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>Structured logging for regulated environments.</strong>
  <br />
  Declare what every log carries — by level, by context, by compliance policy — and the framework enforces it everywhere.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
</p>

---

## What SyntropyLog is

A logging framework built specifically for regulated environments (banking, healthcare, fintech). The job it does is different from a general logger: it **proves which fields can appear in which logs**, and **routes audit records by retention policy** — so compliance reviews the configuration, not the codebase.

Four pillars:

- **Logging Matrix** — a declarative whitelist of context fields per log level. If a field isn't in the matrix for that level, it never reaches a transport. Field control by config, not by code review.
- **Retention-aware audit trail with delivery guarantees** — `withRetention({ policy: 'SOX', years: 5 })` travels with each entry so your transport routes it to the right table / bucket / cold store. `DurableAdapterTransport` adds buffer + exponential-backoff retry + dead-letter queue so audit-tagged entries survive transient backend outages — the headline compliance gap that fire-and-forget loggers leave open.
- **Universal Adapter** — one `executor` function sends logs to Postgres, Mongo, Elasticsearch, S3, anything. You write the executor; the framework stays agnostic of client libraries.
- **Silent Observer pipeline** — masking, sanitization, serialization with timeout and depth limits, prototype-pollution defense. Logging cannot crash your app; failures surface through hooks and counters (`getStats()`).

Optional Rust native addon does serialize + mask + sanitize in a single pass when available, transparent JS fallback when not.

---

## Quick Start

```bash
npm install syntropylog
```

```typescript
import { syntropyLog } from 'syntropylog';

await syntropyLog.init({
  logger: { level: 'info', serviceName: 'payments-api' },
  loggingMatrix: {
    default: ['correlationId'],
    info:    ['correlationId', 'userId', 'operation'],
    error:   ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId'],
    fatal:   ['*'],
  },
});

const log = syntropyLog.getLogger();
log.info({ userId: 123, operation: 'charge' }, 'Payment processed');
```

`await syntropyLog.init(...)` resolves when the framework is ready. See [docs/lifecycle.md](docs/lifecycle.md) for graceful shutdown and per-framework integration.

---

## The killer example — Logging Matrix in action

This is the feature that justifies adopting another logger. Same call, different output by level:

```typescript
// Matrix configured at init:
// info  → [correlationId, userId, operation]
// error → [correlationId, userId, operation, errorCode, tenantId, orderId]

log.info({ userId: 123, tenantId: 'acme', orderId: 'ord_42', operation: 'charge' },
         'Payment captured');
// → { correlationId, userId, operation, msg: 'Payment captured' }
//   tenantId and orderId are dropped — not in the info whitelist

log.error({ userId: 123, tenantId: 'acme', orderId: 'ord_42', operation: 'charge', errorCode: 'CARD_DECLINED' },
          'Payment failed');
// → { correlationId, userId, operation, errorCode, tenantId, orderId, msg: 'Payment failed' }
//   full context surfaces only on error
```

You declare the contract once in `init()`. Compliance reviews the matrix, not your codebase.

---

## Compliance routing — retention as data

`withRetention` attaches policy metadata to a logger. Your transport's `executor` reads it and routes accordingly:

```typescript
const audit = log.withRetention({ policy: 'SOX_AUDIT_TRAIL', years: 5 });
audit.audit({ userId: 123, action: 'payment.approve' }, 'Manager override');

// In your AdapterTransport executor:
async executor(entry) {
  const table = entry.retention?.policy === 'SOX_AUDIT_TRAIL'
    ? 'audit_long_term'
    : 'logs_hot';
  await db.insert(table, entry);
}
```

The `audit` level is always written regardless of the configured log level.

---

## What's in the box

| Feature | One-liner | Docs |
|---------|-----------|------|
| **Logging Matrix** | Declarative whitelist of context fields per level; `defineMatrix()` for typed keys | [docs/logging-matrix.md](docs/logging-matrix.md) |
| **MaskingEngine** | Redact passwords, tokens, PII before transport; `maskEnum` for typed alias sets | [docs/masking.md](docs/masking.md) |
| **Universal Adapter** | One `executor` → any backend; framework stays agnostic of client libraries | [docs/transports.md](docs/transports.md) |
| **DurableAdapterTransport** | Buffer + exponential-backoff retry + DLQ; delivery guarantees for `withRetention`-tagged audit entries | [docs/compliance.md](docs/compliance.md) |
| **Transport pool & per-env routing** | `override` / `add` / `remove` per call | [docs/transports.md](docs/transports.md) |
| **Fluent API** | `withSource`, `withTransactionId`, `withRetention`, `child`; `defineRetentionPolicies()` registry for typed policies | [docs/fluent-api.md](docs/fluent-api.md) |
| **Context propagation** | Correlation + transaction IDs across a request via `AsyncLocalStorage` | [docs/context.md](docs/context.md) |
| **Express middleware** | `correlationIdMiddleware()` — multi-header + W3C `traceparent` + response echo + ALS scope to `res.finish` | [docs/context.md](docs/context.md) |
| **Fastify hook** | `fastifyCorrelationHook()` for `onRequest`; same resolution + propagation semantics | [docs/context.md](docs/context.md) |
| **NestJS module** | `syntropylog/nestjs`: `SyntropyLogModule`, `SyntropyNestLoggerService`, `@InjectLogger()` | [docs/context.md#nestjs](docs/context.md#nestjs) |
| **Lifecycle, hooks & serialization** | `init` / `shutdown`, `onLogFailure`, `onTransportError`, timeout/depth limits | [docs/lifecycle.md](docs/lifecycle.md) |
| **Self-observability** | `getStats()` — counters for log failures, transport errors, fallbacks, masking errors, uptime | [docs/lifecycle.md](docs/lifecycle.md) |
| **Multi-instance factory** | `createSyntropyLog()` returns independent `ISyntropyLog` instances (tests, multi-tenant, micro-frontends) | [docs/lifecycle.md](docs/lifecycle.md) |
| **Runtime reconfiguration** | Hot-change level / matrix / debug transport | [docs/runtime-reconfiguration.md](docs/runtime-reconfiguration.md) |
| **Native addon (Rust)** | Single-pass serialize + mask + sanitize; transparent JS fallback | [docs/native-addon.md](docs/native-addon.md) |
| **OpenTelemetry export** | Emit to an OTLP collector via `UniversalAdapter` + `UniversalLogFormatter` | [docs/opentelemetry-integration.md](docs/opentelemetry-integration.md) |
| **Audit & retention routing** | Always-on `audit` level + `withRetention` payload routed by executor; compliance-grade logging | [docs/compliance.md](docs/compliance.md) |
| **Prototype-pollution defense** | `__proto__` / `constructor` / `prototype` stripped from metadata at the pipeline boundary | [docs/compliance.md](docs/compliance.md) |
| **Tree-shaking** | `sideEffects: false` + ESM | — |

---

## Pretty console transports (development)

Default output is plain JSON. For colored, human-readable output:

```typescript
import { ClassicConsoleTransport } from 'syntropylog';
syntropyLog.init({
  logger: {
    serviceName: 'my-app',
    transports: [new ClassicConsoleTransport()],
  },
});
```

Variants: `Classic`, `Pretty`, `Compact`, `Colorful`. ANSI built-in, no `chalk` dependency, respects `NO_COLOR` and non-TTY.

---

## Framework integration

| Framework | What to import | Where to wire it |
|---|---|---|
| Express | `correlationIdMiddleware` from `syntropylog` | `app.use(correlationIdMiddleware())` before routes; `await syntropyLog.init(...)` before `app.listen()` |
| Fastify | `fastifyCorrelationHook` from `syntropylog` | `fastify.addHook('onRequest', fastifyCorrelationHook())`; `await syntropyLog.init(...)` before `listen()` |
| NestJS | `SyntropyLogModule` from `syntropylog/nestjs` | `imports: [SyntropyLogModule.forRoot()]` in your root module; `await syntropyLog.init(...)` in `bootstrap()`; inject loggers with `@InjectLogger()` |
| Lambda / Serverless | (no helper) | Module-level singleton outside the handler; `await syntropyLog.init(...)` once, reused across invocations |

Full middleware examples and correlation propagation: [docs/context.md](docs/context.md).

---

## Documentation

- **[Logging Matrix](docs/logging-matrix.md)** — the differentiator, in depth
- **[Compliance routing](docs/compliance.md)** — HIPAA / SOX / GDPR positioning
- **[Masking & sensitive keys](docs/masking.md)**
- **[Transports & universal adapter](docs/transports.md)**
- **[Context propagation](docs/context.md)**
- **[Fluent API](docs/fluent-api.md)**
- **[Lifecycle, hooks & serialization](docs/lifecycle.md)**
- **[Runtime reconfiguration](docs/runtime-reconfiguration.md)**
- **[Native addon (Rust)](docs/native-addon.md)** — concepts and runtime checks
- **[Building the native addon from source](docs/building-native-addon.md)** — macOS / Windows / Linux
- **[OpenTelemetry integration](docs/opentelemetry-integration.md)** — exporting logs to an OTLP collector
- **[NestJS integration](docs/context.md#nestjs)** — `syntropylog/nestjs` module, `SyntropyNestLoggerService`, `@InjectLogger()`
- **[Migrating from Pino](docs/migration-from-pino.md)** — practical side-by-side guide for teams switching
- **[Benchmark report (throughput + memory)](docs/benchmark-memory-run.md)**
- **[Examples repository](https://github.com/Syntropysoft/syntropylog-examples)** — runnable examples 01–17
- **[Documentación en Español](doc-es/caracteristicas-y-ejemplos.md)**

---

## Contributing & License

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md). License: **Apache-2.0**.
