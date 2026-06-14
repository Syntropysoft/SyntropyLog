<p align="center">
  <img src="https://syntropysoft.com/syntropylog-logo.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>The observability framework for backend JavaScript.</strong>
  <br />
  Declare your rules <strong>once</strong> — context, masking, field control, retention — and every service uses them <strong>already wired</strong>. Stop writing the same boilerplate N times.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml"><img src="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml/badge.svg" alt="CI Status"></a>
  <a href="https://codecov.io/gh/Syntropysoft/SyntropyLog"><img src="https://codecov.io/gh/Syntropysoft/SyntropyLog/branch/main/graph/badge.svg" alt="Test Coverage"></a>
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog?label=version&color=blue" alt="Version"></a>
  <a href="https://socket.dev/npm/package/syntropylog"><img src="https://socket.dev/api/badge/npm/package/syntropylog" alt="Socket Badge"></a>
</p>

> **Not a logger — an observability pipeline.** With Pino or Winston you wire correlation IDs, PII redaction, and per-level field control yourself, in every service. SyntropyLog does it for you: declare it **once** in `init()`, and it runs on every log call, in every async chain, across every service. You write the rules **once**; the framework enforces them on every entry — before it ever reaches the **console, Datadog, Grafana, your database, an OpenTelemetry collector, or wherever your `executor` sends it.**

---

## What SyntropyLog is

Every Node.js team building microservices ends up writing the same boilerplate: thread `correlationId` through every call, scrub `password`/`email` before logging, remember to stamp `service` on every entry, repeat the same header-extraction middleware on every service.

SyntropyLog solves that **declaratively**. You declare the rules once at startup; the framework applies them consistently on every log call, in every async chain, across every service.

It is scoped on purpose: SyntropyLog owns the **log pipeline up to the moment of persistence** — matrix filtering, context propagation, masking, sanitization, serialization, retention metadata. **It does not manage any backend** (no Redis, HTTP, or broker clients in the core). Where the entry goes is a one-function `executor` you write. That keeps the framework independent of client-library versions and storage churn.

Four pillars:

- **Logging Matrix** — a declarative whitelist of context fields per log level. If a field isn't in the matrix for that level, it never reaches a transport. Field control by config, not by code review.
- **Retention-aware audit trail with delivery guarantees** — `withRetention(...)` travels with each entry so your transport routes it by policy. `DurableAdapterTransport` adds buffer + exponential-backoff retry + dead-letter queue so audit-tagged entries survive transient backend outages.
- **Universal Adapter** — one `executor` function sends logs to Postgres, Mongo, Elasticsearch, S3, anything. You write the executor; the framework stays agnostic of client libraries.
- **Silent Observer pipeline** — masking, sanitization, serialization with timeout and depth limits, prototype-pollution defense. Logging cannot crash your app; failures surface through hooks and counters (`getStats()`).

An optional Rust native addon does serialize + mask + sanitize in a single pass when available, with transparent JS fallback when not.

---

## The declarative shift

With Pino or Winston, you **write logging**. With SyntropyLog, you **declare observability**.

| Instead of… | You declare… | SyntropyLog does automatically |
|---|---|---|
| Threading `correlationId` through every function | `contextManager.run(fn)` | Propagates to all logs in scope via `AsyncLocalStorage` |
| Scrubbing sensitive fields before logging | `masking: { enableDefaultRules: true }` | Masks email, password, token, card, SSN, phone on every log |
| Repeating `service: 'payments'` on every call | `getLogger('payments')` | `service` on every log from that logger |
| Copying context into child functions | `logger.child({ orderId })` | Bindings carried on every subsequent call |
| Routing compliance logs manually | `logger.withRetention('SOX_AUDIT_TRAIL')` | `retention` payload travels sanitized to all transports |
| Writing a transport class per destination | `AdapterTransport` + `UniversalAdapter` | Your `executor` receives the clean entry — connect to anything |
| Building headers per downstream target | `outbound: { http: {...}, kafka: {...} }` | `getPropagationHeaders('kafka')` returns the right wire names |

---

## Quick Start

```bash
npm install syntropylog
```

A complete, runnable minimum — configure declaratively, then log:

```typescript
import { syntropyLog } from 'syntropylog';

async function main() {
  // 1. Configure once. Declarative: the matrix decides which fields each level emits.
  await syntropyLog.init({
    logger: { level: 'info', serviceName: 'payments-api' },
    masking: { enableDefaultRules: true },
    loggingMatrix: {
      default: ['correlationId'],
      info:    ['correlationId', 'userId', 'operation'],
      error:   ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId'],
      fatal:   ['*'],
    },
  });

  // 2. Use it anywhere. No transport configured ⇒ structured JSON to the console by default.
  const log = syntropyLog.getLogger();
  log.info({ userId: 123, operation: 'charge', email: 'john@example.com' }, 'Payment processed');
  // → {"level":"info","message":"Payment processed","service":"payments-api",
  //    "userId":123,"operation":"charge","email":"j***@example.com"}
  //   email was masked automatically; correlationId appears once a request context is set.

  // 3. Flush and close cleanly (e.g. on SIGTERM).
  await syntropyLog.shutdown();
}

main();
```

`await syntropyLog.init(...)` returns a `Promise<void>` and resolves when the framework is ready — until it resolves, `getLogger()` returns a no-op that drops messages, so always `await` it. `shutdown()` flushes in-flight logs and closes resources.

> **Named loggers are cached singletons.** `getLogger()` returns the default logger (named after `serviceName`); `getLogger('billing')` returns a per-name instance. Call it again with the same name and you get the *same* logger back — an internal LRU pool (up to 1,000) manages them, so you can `getLogger('billing')` freely across modules without ever creating duplicates. Each named logger can even resolve its own transports.

```typescript
const billing = syntropyLog.getLogger('billing');
syntropyLog.getLogger('billing') === billing; // true — same cached instance
```

**Where to call `await init`:**

| Framework | Where |
|---|---|
| Express / Fastify | Before `app.listen()` in the server entry |
| NestJS | In `bootstrap()` before `app.listen()` (see [NestJS](#nestjs)) |
| Lambda / Serverless | Module-level singleton outside the handler; init once, reused across invocations |

**Where to go next:** run [`01-hello-world`](https://github.com/Syntropysoft/syntropylog-examples/tree/main/01-hello-world) (examples `00`–`21`), or jump to [What's in the box](#whats-in-the-box).

---

## Logging Matrix — the differentiator

A declarative contract defining exactly which context fields appear at each level. Same call, different output by level:

```typescript
// info  → [correlationId, userId, operation]
// error → [correlationId, userId, operation, errorCode, tenantId, orderId]

log.info({ userId: 123, tenantId: 'acme', orderId: 'ord_42', operation: 'charge' },
         'Payment captured');
// → { correlationId, userId, operation, message: 'Payment captured' }
//   tenantId and orderId are dropped — not in the info whitelist

log.error({ userId: 123, tenantId: 'acme', orderId: 'ord_42', operation: 'charge', errorCode: 'CARD_DECLINED' },
          'Payment failed');
// → full context surfaces only on error
```

You declare the contract once in `init()`. Compliance reviews the matrix, not your codebase.

```typescript
// Typed variant — typos in keys become compile-time errors:
import { defineMatrix } from 'syntropylog';
const matrix = defineMatrix(['correlationId', 'userId', 'operation', 'errorCode'] as const, {
  info:  ['correlationId', 'userId'],
  error: ['correlationId', 'userId', 'operation', 'errorCode'],
});
```

Change which fields are visible per level at runtime — no restart. Security boundary: only field visibility changes; masking and transports stay as set at `init()`.

```typescript
syntropyLog.reconfigureLoggingMatrix({ info: ['correlationId', 'userId'], error: ['*'] });
```

Full guide: [docs/logging-matrix.md](docs/logging-matrix.md).

---

## Named loggers and the fluent API

`child()` binds context once — every log from that instance carries it automatically. Bindings are immutable and composable; `child()` never mutates the parent.

```typescript
const log = syntropyLog.getLogger('order-service').child({ orderId, userId });
log.info('Processing started');                    // carries orderId, userId
const paymentLog = log.child({ step: 'payment' }); // adds step, keeps the rest
paymentLog.info('Charging card');                  // carries orderId, userId, step
```

All builders compose on top of `child()`:

```typescript
const auditLog = syntropyLog.getLogger('payment-service')
  .child({ provider: 'stripe', region: 'us-east-1' })
  .withSource('ChargeProcessor')
  .withTransactionId('txn-789')
  .withRetention('PCI_DSS_REQ_10');   // registered policy name (see Compliance routing)
auditLog.audit('Card charged', { amount: 299, currency: 'USD' });
```

| Builder | Binds to every log | Notes |
|---|---|---|
| `getLogger('name')` | `service: 'name'` | cached singleton per name |
| `child({ k: v })` | arbitrary key/value | foundation of all builders |
| `withSource('X')` | `source: 'X'` | module / component name |
| `withTransactionId('id')` | `transactionId: 'id'` | cross-service trace |
| `withMeta({ ... })` | `retention: { ... }` | any JSON — sanitized, routable by executor |
| `withRetention(name \| rules)` | `retention: { ... }` | registry lookup by name, or inline rules |

Full guide: [docs/fluent-api.md](docs/fluent-api.md).

> **Logging accepts JSON.** Pass plain JSON metadata. For non-JSON values (`Date`, `Error`, class instances) serialize them in your code first — e.g. `err instanceof Error ? err.message : String(err)`. See [`15-testing-serializers`](https://github.com/Syntropysoft/syntropylog-examples/tree/main/15-testing-serializers).

---

## Context propagation

SyntropyLog uses Node's native `AsyncLocalStorage`. Context propagates across `Promise.all()`, `async/await` chains, and concurrent requests — each request is fully isolated.

```typescript
const { contextManager } = syntropyLog;

await contextManager.run(async () => {
  contextManager.set('correlationId', req.headers['x-correlation-id'] ?? randomUUID());
  contextManager.set('userId', req.user.id);
  log.info('Request received');   // correlationId, userId here
  await fetchFromDb();            // …and here too — no argument threading
});
```

### Drop-in middleware (Express / Fastify)

The library ships ready-made correlation middleware — multi-header resolution → W3C `traceparent` → generate; echoes onto the response; holds the ALS scope until `res.finish`.

```typescript
import { correlationIdMiddleware, fastifyCorrelationHook } from 'syntropylog';

app.use(correlationIdMiddleware());                          // Express
fastify.addHook('onRequest', fastifyCorrelationHook());      // Fastify
```

### Inbound / outbound header translation

Conceptual field names (`correlationId`, `traceId`, `tenantId`) are internal keys. The name that travels on the wire is declared by you per source/target. The framework translates at the moment of sending. No built-in defaults — you declare exactly the fields your service needs.

```typescript
await syntropyLog.init({
  context: {
    inbound:  { frontend: { correlationId: 'X-Correlation-ID', traceId: 'X-Trace-ID' },
                partner:  { correlationId: 'x-request-id',     traceId: 'x-b3-traceid' } },
    outbound: { http:     { correlationId: 'X-Correlation-ID', traceId: 'X-Trace-ID' },
                kafka:    { correlationId: 'correlationId',    traceId: 'traceId' } },
  },
});

// Inbound: pure wire→internal translation; you decide the policy for missing fields.
const fields = extractInboundContext(req.headers, 'frontend', syntropyLog.config.context);
contextManager.set('correlationId', fields['correlationId'] ?? randomUUID());

// Outbound: internal→wire for a named target. Only fields present in context appear.
await fetch(url, { headers: contextManager.getPropagationHeaders('http') });
// → { 'X-Correlation-ID': '…', 'X-Trace-ID': '…' }
await kafkaProducer.send({ topic, messages: [{ headers: contextManager.getPropagationHeaders('kafka'), value }] });
// → { correlationId: '…', traceId: '…' }
```

Full guide: [docs/context.md](docs/context.md).

---

## Data masking

Masking runs automatically on every entry before it reaches any transport — **identically in the native Rust engine and the JS fallback** (one declarative rule set, asserted byte-for-byte equal by a shared parity test). Rules apply by field name at any depth.

> **Masking matches the field _name_, not the content.** It redacts the value of fields whose key matches a rule (`email`, `token`, …); it does **not** scan free-text strings, array elements, or the log message for PII. Put sensitive data in keyed fields — see [Scope & limitations](docs/masking.md#scope--limitations).

```typescript
await syntropyLog.init({
  masking: {
    enableDefaultRules: true,    // email, phone, credit_card, ssn, password, token + secret families
    regexTimeoutMs: 100,         // ReDoS guard for custom rules (default 100ms)
    rules: [
      // Declarative custom mask (a `spec`, not a JS function) → runs in the native engine too.
      { pattern: /cuit|cuil/i, strategy: MaskingStrategy.CUSTOM, spec: { scope: 'digits', unmaskEnd: 4 } },
    ],
  },
});

// Metadata goes FIRST (object), message second — only the metadata object is masked.
log.info({ creditCardNumber: '4111-1111-1111-1234', amount: 299.90 }, 'Payment');
// → creditCardNumber: "****-****-****-1234"   amount: 299.9 (numbers untouched)
log.info({ order: { user: { token: 'abc123', id: 'USR-1' } } }, 'Order');
// → order.user.token: "[REDACTED]"   order.user.id: "USR-1" (not a sensitive key)
```

**Identifiers keep their last digits (debuggable); credentials are fully redacted:**

| Field key (examples) | Result |
|---|---|
| `email`, `mail` | `j***@example.com` |
| `phone`, `mobile`, `tel` | `***-***-4567` |
| `creditCard`, `cardNumber`, `credit_card` | `****-****-****-1234` |
| `ssn`, `social_security` | `***-**-6789` |
| `password`, `pass`, `pwd`, `secret` | `[REDACTED]` |
| `token`, `apiKey`, `key`, `auth`, `jwt`, `bearer` | `[REDACTED]` |

Spread the defaults and add your own; use the `maskEnum` aliases instead of string literals (no Sonar S2068 noise):

```typescript
import { getDefaultMaskingRules, maskEnum, MaskingStrategy } from 'syntropylog';
masking: {
  enableDefaultRules: false,
  rules: [
    ...getDefaultMaskingRules({ maskChar: '*' }),
    { pattern: new RegExp(maskEnum.MASK_KEYS_TOKEN.join('|'), 'i'), strategy: MaskingStrategy.TOKEN },
  ],
}
```

**Silent Observer:** if masking fails or times out, the pipeline never throws — it returns a safe payload marked `_maskingFailed` with only allowed keys (`level`, `timestamp`, `message`, `service`); the raw metadata never leaks. Full guide: [docs/masking.md](docs/masking.md).

---

## Compliance routing — retention as data

The `audit` level is **always emitted**, regardless of the configured log level — for compliance events that must always be recorded. `withRetention(...)` attaches policy metadata that your executor reads to route by table / bucket / cold store.

```typescript
import { defineRetentionPolicies } from 'syntropylog';

const retentionPolicies = defineRetentionPolicies({
  SOX_AUDIT_TRAIL: { years: 5 },
  GDPR_ARTICLE_17: { years: 7, subjectIdField: 'userId' },
  PCI_DSS_REQ_10:  { years: 1, immediate: true },
});

await syntropyLog.init({ logger: { serviceName: 'payments' }, retentionPolicies });

const audit = syntropyLog.getLogger().withRetention('SOX_AUDIT_TRAIL');
audit.audit({ userId: 123, action: 'payment.approve' }, 'Manager override');
// entry.retention = { years: 5 }

// In your executor:
async function executor(entry) {
  const table = entry.retention?.years >= 5 ? 'audit_long_term' : 'logs_hot';
  await db.insert(table, entry);
}
```

`withRetention('NAME')` looks the name up in the registry and throws `RetentionPolicyNotFoundError` (listing the registered names) on a miss; `withRetention({ ... })` with an object bypasses the registry. `withMeta({ ... })` is the freeform equivalent — any JSON, no lookup. Control-by-control mapping for HIPAA / SOX / GDPR / PCI-DSS: [docs/compliance.md](docs/compliance.md).

---

## Transports

Default output is plain JSON (no transport needed). For development, colored console variants; for production routing, the adapter transports.

| Transport | Output | Use case |
|---|---|---|
| *(default)* `ConsoleTransport` | Structured JSON | Production, log aggregators |
| `ClassicConsoleTransport` | Single-line, colored | Development |
| `PrettyConsoleTransport` | Pretty-printed, colored | Deep inspection |
| `CompactConsoleTransport` | Compact one-liner, colored | High-volume dev |
| `ColorfulConsoleTransport` | Full-line colored | Live POD debugging |
| `AdapterTransport` | Any destination | DBs, HTTP APIs, queues |
| `DurableAdapterTransport` | Any destination, **delivery-guaranteed** | Compliance / audit sinks |
| `SpyTransport` | In-memory capture | Tests (see [Testing](#testing)) |

Console transports auto-detect TTY — in CI/pipes/production they fall back to plain JSON. ANSI is built in (no `chalk`), respects `NO_COLOR`.

### AdapterTransport + UniversalAdapter

You write one `executor` — sync or async — that receives the already-masked, context-enriched, formatted entry and sends it anywhere.

```typescript
import { AdapterTransport, UniversalAdapter, UniversalLogFormatter } from 'syntropylog';

const formatter = new UniversalLogFormatter({
  mapping: { level: 'level', message: 'message', correlationId: 'correlationId', payload: 'meta', timestamp: 'timestamp' },
});

const dbTransport = new AdapterTransport({
  name: 'db',
  formatter,
  adapter: new UniversalAdapter({
    executor: async (data) => {
      await Promise.all([                       // same object, several destinations
        prisma.systemLog.create({ data }),
        esClient.index({ index: 'logs', body: data }),
      ]);
    },
  }),
});
```

### DurableAdapterTransport — delivery guarantees for audit logs

Turns audit-flagged entries into delivery-guaranteed writes: in-memory buffer, exponential-backoff retry, and a dead-letter queue via `onDrop`. **Selective by default** — only entries with `retention` metadata take the durable path; `info`/`warn`/`error` keep fire-and-forget semantics.

```typescript
import { DurableAdapterTransport } from 'syntropylog';

const durable = new DurableAdapterTransport({
  executor: async (entry) => { await auditStore.write(entry); }, // must reject on failure to retry
  bufferSize: 1000,           // default
  maxRetries: 5,              // default
  initialBackoffMs: 100,      // default → exponential up to…
  maxBackoffMs: 30_000,       // default (30s)
  dropStrategy: 'oldest',     // 'oldest' | 'newest' | 'reject'  (default 'oldest')
  durableOnlyForRetention: true,  // default — only retention-tagged entries are durable
  flushTimeoutMs: 5_000,      // default — flush()/shutdown() drain window, then DLQ the rest
  onDrop: (entry, reason, cause) => {
    // reason: 'buffer-full' | 'retries-exhausted'
    deadLetterFile.append(entry);
  },
});

await syntropyLog.init({ logger: { serviceName: 'payments', transports: [durable] } });
```

This closes the audit-log-loss gap that fire-and-forget loggers leave open. Full guide: [docs/transports.md](docs/transports.md).

### Per-call transport control & per-env routing

Define a named pool and route by environment, then override for a single call without new logger instances:

```typescript
await syntropyLog.init({
  logger: {
    transportList: { console: new ColorfulConsoleTransport(), db: dbTransport },
    env: { development: ['console'], production: ['console', 'db'] },
    envKey: 'NODE_ENV',
  },
});

log.override('console').info('only to console');
log.remove('db').add('console').info('default minus db');
```

---

## Testing

A first-class testing toolkit under `syntropylog/testing` — no real framework instance needed. `SpyTransport` captures entries for assertions; `createTestHelper()` and `createServiceWithMock()` mock the framework for unit tests.

```typescript
import { SpyTransport, createTestHelper, createServiceWithMock } from 'syntropylog/testing';

// Assert on emitted logs:
const spy = new SpyTransport();
// …wire spy as a transport, exercise code…
expect(spy.getEntries()).toHaveLength(1);
expect(spy.findEntries({ level: 'warn' })).toHaveLength(1);
expect(spy.getLastEntry()?.message).toBe('done');
spy.clear();

// Inject a mock framework into a service under test:
const helper = createTestHelper(vi.fn);        // or jest.fn
beforeEach(() => helper.beforeEach());
const service = createServiceWithMock(UserService, helper.mockSyntropyLog);
```

`SpyTransport` methods: `getEntries()`, `findEntries(predicate | fn)`, `getFirstEntry()`, `getLastEntry()`, `clear()`. Full guide: [docs/testing-mocks.md](docs/testing-mocks.md). Runnable examples: `13`–`16`.

---

## NestJS

`syntropylog/nestjs` ships a `LoggerService` implementation, a global module, and a per-class logger decorator. `@nestjs/*`, `reflect-metadata`, and `rxjs` are **optional peer dependencies** — non-Nest users see no warnings.

```typescript
// main.ts — init before creating the app
import { syntropyLog } from 'syntropylog';
await syntropyLog.init({ logger: { serviceName: 'my-app', level: 'info' } });
const app = await NestFactory.create(AppModule);

// app.module.ts
import { SyntropyLogModule } from 'syntropylog/nestjs';
@Module({ imports: [SyntropyLogModule.forRoot()] })
export class AppModule {}

// any.service.ts — @InjectLogger() binds .withSource(ClassName) per consumer
import { InjectLogger } from 'syntropylog/nestjs';
import type { ILogger } from 'syntropylog';

@Injectable()
export class PaymentService {
  constructor(@InjectLogger() private readonly log: ILogger) {}
  charge() { this.log.info({ amount: 1500 }, 'Charging'); } // entry includes source: 'PaymentService'
}
```

`forRoot({ syntropyLog })` accepts an instance from `createSyntropyLog()` for multi-tenant or isolated-test setups; `{ loggerName, defaultContext }` route Nest's own logs separately.

---

## OpenTelemetry

No framework changes needed — define a formatter, write an executor that calls `otelLogger.emit()`, register it as a transport. Per-call routing works the same (`.override('otel')`). Full guide: [docs/opentelemetry-integration.md](docs/opentelemetry-integration.md).

---

## Observability & lifecycle hooks

Optional callbacks observe pipeline failures without ever throwing; `getStats()` aggregates them.

```typescript
await syntropyLog.init({
  onLogFailure:            (err, entry)   => metrics.increment('log_failures'),
  onTransportError:        (err, context) => alerting.notify('transport', context, err), // 'flush' | 'shutdown' | 'log'
  onSerializationFallback: ()             => metrics.increment('serialization_fallback'),
  onStepError:             (step, err)    => metrics.increment('step_error'),
  masking: { onMaskingError: (err)        => metrics.increment('masking_errors') },
});

syntropyLog.getStats();
// → { state, initializedAt, uptimeMs, nativeAddonActive,
//     failures: { log, transport, serializationFallback, masking, step } }
```

The **serialization pipeline** guarantees logging never blocks the event loop: a `HygieneStep` neutralizes circular references and caps depth, a `TimeoutStep` enforces a mandatory per-step timeout ("no death by log"), and a `SanitizationStep` strips control characters. Full guide: [docs/lifecycle.md](docs/lifecycle.md).

### Multi-instance & hot reconfiguration

```typescript
import { createSyntropyLog } from 'syntropylog';
const sl = createSyntropyLog();               // independent instance (multi-tenant, tests, micro-frontends)
await sl.init({ logger: { serviceName: 'tenant-acme' } });

// Per-POD debugging without restart — add a transport, then restore:
syntropyLog.reconfigureTransportsForDebug({ add: [new ColorfulConsoleTransport({ level: 'error' })] });
syntropyLog.resetTransports();
```

---

## Native addon (Rust)

An optional Rust addon does serialize + mask + sanitize in a single pass. It installs automatically on Node ≥ 20 for Linux, macOS, and Windows; if unavailable, the JS pipeline is used transparently.

```typescript
syntropyLog.isNativeAddonInUse(); // true when the Rust pipeline is active
// Force JS mode: logger.disableNativeAddon: true in init()
```

Build from source: [docs/building-native-addon.md](docs/building-native-addon.md).

---

## Performance

The only honest head-to-head is **minimal logging** — everyone doing the bare minimum (plain JSON, no masking). Above that, SyntropyLog runs masking, matrix filtering, sanitization and context on every call and Pino/Winston don't, so it's a **different category, not a race**.

**Minimal logging — the apples-to-apples comparison (avg µs):**

| Simple log (JSON) | M2 | WSL2/AMD | x64 CI |
|---|---|---|---|
| **SyntropyLog** | **0.93** | **1.41** | 1.61 |
| Pino | 1.22 | 1.60 | **1.06** |
| Winston | 1.17 | 2.01 | 3.55 |

- Even at the bare minimum, SyntropyLog is **fastest on M2 and WSL2** and **always beats Winston**; a bare Pino is faster on x64 server CPUs (margin varies run-to-run on noisy CI).
- **Full pipeline (masking + context + matrix):** ~5–8 µs. No fair head-to-head exists here — Pino/Winston don't do this work, so their numbers serve only as a no-masking reference.
- **Memory:** ~181 bytes/op — on par with Pino, ~5× below Winston (~936) on simple logs.

Full report (three machines, percentiles, CI-noise caveat): [docs/benchmark-report.md](docs/benchmark-report.md). Run: `pnpm run bench:memory`.

---

## What SyntropyLog is not

It is a structured-logging and context-propagation framework. It is **not** a log aggregation backend (use Elasticsearch / Loki / CloudWatch), a distributed-tracing system (use OpenTelemetry — see the integration guide), or a metrics collector (use Prometheus / Datadog). It is the component that makes every log line **correct, consistent, and safe before it reaches any of those systems**.

---

## Security & supply chain

- **No network I/O at runtime.** The framework contacts no external URLs; the only output is what your transports produce.
- **Zero runtime dependencies** (`dependencies: {}`). The optional native addon is built from auditable Rust source in the same repo — no opaque prebuilt binaries; transparent JS fallback.
- **No environment sniffing** — configuration is passed to `init()`; the package reads no env vars on its own.
- **Hardened pipeline:** prototype-pollution guard (`__proto__`/`constructor`/`prototype` stripped at every depth), ReDoS-safe masking (regex timeout), Silent Observer (logging never throws).
- **Supply chain:** all devDeps pinned to exact versions, `pnpm.overrides` verified, NPM provenance signing on publish; `pnpm audit` reports 0 vulnerabilities.

Full details: [SECURITY.md](./SECURITY.md).

---

## What's in the box

| Feature | One-liner | Docs |
|---|---|---|
| **Logging Matrix** | Whitelist of context fields per level; `defineMatrix()` for typed keys | [logging-matrix.md](docs/logging-matrix.md) |
| **MaskingEngine** | Redact PII before transport; `getDefaultMaskingRules`, `maskEnum`, ReDoS-safe | [masking.md](docs/masking.md) |
| **Universal Adapter** | One `executor` → any backend; framework stays agnostic | [transports.md](docs/transports.md) |
| **DurableAdapterTransport** | Buffer + backoff retry + DLQ; delivery guarantees for retention-tagged audit entries | [transports.md](docs/transports.md) |
| **Transport pool & per-env routing** | `transportList` + `env`; per-call `override`/`add`/`remove` | [transports.md](docs/transports.md) |
| **Fluent API** | `child`, `withSource`, `withTransactionId`, `withMeta`, `withRetention`; `defineRetentionPolicies()` registry | [fluent-api.md](docs/fluent-api.md) |
| **Context propagation** | Correlation + transaction IDs via `AsyncLocalStorage`; inbound/outbound wire-name translation | [context.md](docs/context.md) |
| **Express / Fastify** | `correlationIdMiddleware()` / `fastifyCorrelationHook()` — multi-header + W3C `traceparent` + response echo | [context.md](docs/context.md) |
| **NestJS module** | `syntropylog/nestjs`: `SyntropyLogModule`, `SyntropyNestLoggerService`, `@InjectLogger()` | [#nestjs](#nestjs) |
| **Audit & retention routing** | Always-on `audit` level + `withRetention` payload routed by executor | [compliance.md](docs/compliance.md) |
| **Lifecycle, hooks & serialization** | `init`/`shutdown`, `onLogFailure`, timeout/depth limits, circular-ref immunity | [lifecycle.md](docs/lifecycle.md) |
| **Self-observability** | `getStats()` — failure counters, fallbacks, uptime, native-addon state | [lifecycle.md](docs/lifecycle.md) |
| **Testing toolkit** | `syntropylog/testing`: `SpyTransport`, `createTestHelper`, `createServiceWithMock` | [testing-mocks.md](docs/testing-mocks.md) |
| **Multi-instance factory** | `createSyntropyLog()` returns independent instances | [lifecycle.md](docs/lifecycle.md) |
| **Runtime reconfiguration** | Hot-change level / matrix / debug transport | [runtime-reconfiguration.md](docs/runtime-reconfiguration.md) |
| **Native addon (Rust)** | Single-pass serialize + mask + sanitize; transparent JS fallback | [native-addon.md](docs/native-addon.md) |
| **OpenTelemetry export** | Emit to an OTLP collector via `UniversalAdapter` | [opentelemetry-integration.md](docs/opentelemetry-integration.md) |
| **Prototype-pollution defense** | `__proto__`/`constructor`/`prototype` stripped at the pipeline boundary | [compliance.md](docs/compliance.md) |
| **Tree-shaking** | `sideEffects: false` + ESM | — |

---

## Documentation & examples

- **[Logging Matrix](docs/logging-matrix.md)** · **[Compliance routing](docs/compliance.md)** · **[Masking](docs/masking.md)** · **[Transports](docs/transports.md)** · **[Context](docs/context.md)** · **[Fluent API](docs/fluent-api.md)** · **[Lifecycle & hooks](docs/lifecycle.md)** · **[Runtime reconfiguration](docs/runtime-reconfiguration.md)** · **[Testing & mocks](docs/testing-mocks.md)**
- **[Native addon (Rust)](docs/native-addon.md)** · **[Building it from source](docs/building-native-addon.md)** · **[OpenTelemetry](docs/opentelemetry-integration.md)** · **[Stability & compatibility](docs/stability.md)**
- **[Migrating from Pino](docs/migration-from-pino.md)** — practical side-by-side
- **[Benchmark report (throughput + memory)](docs/benchmark-report.md)** — SyntropyLog vs Pino vs Winston, three machines
- **[Examples repository](https://github.com/Syntropysoft/syntropylog-examples)** — 22 runnable examples (`00`–`21`): fundamentals (`00`–`09`), integration (`10`–`12`), testing (`13`–`16`), benchmark (`17`), compliance & observability (`18` durable transport, `19` retention policies, `20` getStats, `21` correlation middleware)
- **[Documentación en Español](doc-es/caracteristicas-y-ejemplos.md)**

```bash
cd 00-setup-initialization && npm install && npm run dev
```

---

## Contributing & License

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md). License: **Apache-2.0**.
