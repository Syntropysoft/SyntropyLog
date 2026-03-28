<p align="center">
  <img src="https://syntropysoft.com/syntropylog-logo.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>The Declarative Observability Framework for Node.js.</strong>
  <br />
  You declare what each log should carry. SyntropyLog handles the rest.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml"><img src="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml/badge.svg" alt="CI Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-95.13%25-brightgreen" alt="Test Coverage"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-v1.0.0--rc.2-blue.svg" alt="Version 1.0.0-rc.2"></a>
  <a href="https://socket.dev/npm/package/syntropylog"><img src="https://socket.dev/api/badge/npm/package/syntropylog" alt="Socket Badge"></a>
</p>

---

## What is SyntropyLog?

Every Node.js team building microservices ends up writing the same boilerplate: thread `correlationId` through every function call, scrub `password` fields before logging, remember to add `service` and `env` to every entry, repeat the same context extraction middleware on every service.

SyntropyLog solves the boilerplate problem declaratively. You declare the rules once at startup. The framework applies them consistently on every log call, in every async chain, across every service — without you thinking about it again.

```typescript
import { syntropyLog } from 'syntropylog';

await syntropyLog.init({
  logger:  { level: 'info', serviceName: 'payment-service' },
  masking: { enableDefaultRules: true },
});

const logger = syntropyLog.getLogger('payment-service')
  .child({ provider: 'stripe', currency: 'USD' });

await contextManager.run(async () => {
  contextManager.set('correlationId', 'req-abc');
  logger.info('Card charged', { amount: 299.90, email: 'john@example.com' });
  // → {"level":"info","message":"Card charged","service":"payment-service",
  //    "correlationId":"req-abc","provider":"stripe","currency":"USD",
  //    "amount":299.9,"email":"j***@example.com"}
});
```

The `correlationId` propagated automatically. The `email` was masked automatically. The `service` field appeared automatically. You wrote none of that explicitly.

---

## The declarative shift

With Pino or Winston, you **write** logging. With SyntropyLog, you **declare** observability.

| Instead of... | You declare... | SyntropyLog does automatically |
|---------------|----------------|-------------------------------|
| Threading `correlationId` through every function | `contextManager.run(fn)` | Propagates to all logs in scope via `AsyncLocalStorage` |
| Scrubbing sensitive fields before logging | `masking: { enableDefaultRules: true }` | Masks email, password, token, credit card on every log |
| Repeating `service: 'payment'` on every call | `getLogger('payment-service')` | `service` field on every log from that logger |
| Copying context into child functions | `logger.child({ orderId })` | All bindings carried automatically on every subsequent call |
| Routing compliance logs manually | `logger.withMeta({ policy: 'PCI-DSS' })` | `retention` payload travels sanitized to all transports |
| Writing a transport class per destination | `AdapterTransport(adapter: UniversalAdapter(...))` | Your executor receives the clean entry — connect to anything |
| Manually building headers per downstream target | `outbound: { kafka: {...}, s3: {...} }` | `getPropagationHeaders('kafka')` returns the right wire names |

---

## Quick start

```bash
npm install syntropylog
```

Prebuilt native addon (Rust) for Linux, Windows, and macOS installs automatically on Node ≥ 20. If unavailable, the JS pipeline is used transparently.

```typescript
import { syntropyLog } from 'syntropylog';

async function main() {
  await syntropyLog.init({
    logger: { level: 'info', serviceName: 'my-app' },
    masking: { enableDefaultRules: true },
  });

  const log = syntropyLog.getLogger('my-app');
  log.info('Service started', { version: '1.0.0' });

  process.on('SIGTERM', async () => { await syntropyLog.shutdown(); process.exit(0); });
  process.on('SIGINT',  async () => { await syntropyLog.shutdown(); process.exit(0); });
}
main();
```

`syntropyLog.init()` returns a `Promise<void>` — always await it. Until it resolves, `getLogger()` returns a no-op that drops all messages. `shutdown()` flushes in-flight logs and closes resources.

| Framework | Where to call `await init` |
|-----------|---------------------------|
| Express / Fastify | Before `app.listen()` in the server entry |
| NestJS | `AppModule.onModuleInit()` or before `app.listen()` in `bootstrap()` |
| Lambda | Module-level lazy singleton (outside the handler) |

---

## Named loggers and child()

Each component gets its own named logger. `child()` binds context once — every log from that instance carries it automatically. Bindings are immutable and composable.

```typescript
async function processOrder(orderId: string, userId: string) {
  // Bind once — no need to repeat on every call
  const log = syntropyLog.getLogger('order-service')
    .child({ orderId, userId });

  log.info('Processing started');                           // carries orderId, userId
  log.info('Inventory checked');                            // carries orderId, userId

  const paymentLog = log.child({ step: 'payment' });        // adds step, keeps the rest
  paymentLog.info('Charging card');                         // carries orderId, userId, step
  paymentLog.info('Approved', { amount: 299.90 });
}
```

`child()` never mutates the parent. Each call returns a new logger with merged bindings.

### Full composition — all builders

```typescript
const paymentLog = syntropyLog.getLogger('payment-service')
  .child({ provider: 'stripe', region: 'us-east-1' })
  .withSource('ChargeProcessor')
  .withTransactionId('txn-789')
  .withMeta({ policy: 'PCI-DSS', years: 7, destination: 's3-cold' });

paymentLog.audit('Card charged', { amount: 299, currency: 'USD' });
paymentLog.error('Charge failed',  { code: 'card_declined' });
```

| Builder | Binds to every log | Notes |
|---------|-------------------|-------|
| `getLogger('name')` | `service: 'name'` | cached per name |
| `child({ k: v })` | arbitrary key-value pairs | foundation of all builders |
| `withSource('X')` | `source: 'X'` | module / component name |
| `withTransactionId('id')` | `transactionId: 'id'` | cross-service trace |
| `withMeta({ ... })` | `retention: { ... }` | any JSON — sanitized, routable by executor |

---

## Context propagation

SyntropyLog uses Node.js's native `AsyncLocalStorage`. Context propagates correctly across `Promise.all()`, `async/await` chains, and concurrent requests — each request is fully isolated.

```typescript
async function handleRequest(req: Request) {
  await contextManager.run(async () => {
    contextManager.set('correlationId', req.headers['x-correlation-id'] ?? randomUUID());
    contextManager.set('userId', req.user.id);

    log.info('Request received');      // correlationId, userId here
    await fetchFromDb();               // correlationId, userId here too
    log.info('Request complete');
  });
}

async function fetchFromDb() {
  // No function argument needed — context is already here
  log.debug('Running query');          // correlationId, userId propagated automatically
}
```

Concurrent requests are fully isolated. Each `contextManager.run(fn)` opens its own scope; inner scopes do not leak into outer ones.

---

## Data masking

Masking runs automatically on every log entry before it reaches any transport. Default rules cover the most common sensitive fields. The engine flattens nested objects, applies rules by field name, then reconstructs the original structure — at any depth.

```typescript
await syntropyLog.init({
  masking: {
    enableDefaultRules: true,   // email, password, token, credit card, SSN, phone
    rules: [
      // Add your own — compiled once at init()
      { pattern: /cuit|cuil/i, strategy: MaskingStrategy.CUSTOM, customMask: (v) => v.replace(/\d(?=\d{4})/g, '*') },
    ],
  },
});

log.info('Payment', { creditCardNumber: '4111-1111-1111-1234', amount: 299.90 });
// → creditCardNumber: "****-****-****-1234"   amount: 299.9 (not masked)

log.info('User', { email: 'john@example.com', name: 'John Doe' });
// → email: "j***@example.com"   name: "John Doe" (not masked)

log.info('Order', { order: { user: { token: 'abc123', id: 'USR-1' } } });
// → order.user.token: "******"   order.user.id: "USR-1" (not masked)
```

**Default rules**

| Field pattern | Strategy | Example result |
|---------------|----------|----------------|
| `email`, `mail` | Email | `j***@example.com` |
| `password`, `pass`, `pwd`, `secret` | Full mask | `************` |
| `token`, `key`, `auth`, `jwt`, `bearer` | Token | `eyJh...a1B9c` |
| `creditCard`, `cardNumber` | Last 4 | `****-****-****-1234` |
| `ssn`, `socialSecurity` | Last 4 | `*****6789` |
| `phone`, `mobile`, `tel` | Last 4 | `*******4567` |

### Spread default rules and add your own

```typescript
import { getDefaultMaskingRules, MaskingStrategy } from 'syntropylog';

masking: {
  enableDefaultRules: false,
  rules: [
    ...getDefaultMaskingRules({ maskChar: '*' }),
    { pattern: /myCustomKey|internalSecret/i, strategy: MaskingStrategy.PASSWORD },
  ],
}
```

### Sensitive key aliases — `maskEnum`

`maskEnum` exports every `MASK_KEY_*` constant and grouped arrays (`MASK_KEYS_TOKEN`, `MASK_KEYS_PASSWORD`, `MASK_KEYS_ALL`). Import it once and spread what you need — no string literals, no Sonar warnings.

```typescript
import { maskEnum, MaskingStrategy, getDefaultMaskingRules } from 'syntropylog';

{ pattern: new RegExp(maskEnum.MASK_KEYS_TOKEN.join('|'), 'i'), strategy: MaskingStrategy.TOKEN }
```

Full list: [docs/SENSITIVE_KEY_ALIASES.md](docs/SENSITIVE_KEY_ALIASES.md). If Sonar flags S2068 on your own aliases file: [docs/SONAR_FILE_EXCEPTION.md](docs/SONAR_FILE_EXCEPTION.md).

If masking fails, the pipeline does not throw — failures are reported inside the log payload (Silent Observer).

---

## Audit level and withMeta()

`audit` bypasses the configured level filter — it is always emitted regardless of the runtime log level. Use it for compliance events that must always be recorded.

`withMeta(payload)` attaches arbitrary structured metadata to every log from that logger instance. The payload travels sanitized to all transports as `logEntry.retention`. Your executor reads it and decides which table, bucket, or downstream system to route to.

```typescript
const auditLog = syntropyLog.getLogger('compliance')
  .withMeta({ policy: 'GDPR_ARTICLE_17', years: 7, destination: 's3-cold' })
  .child({ userId: 'USR-42' });

auditLog.audit('Data exported', { records: 1500 });
// → level: "audit"  retention: {policy: "GDPR_ARTICLE_17", ...}
//   userId: "USR-42"  records: 1500

// audit always appears — even when level is 'error'
log.info('this will be filtered');  // not emitted
auditLog.audit('this will not');    // always emitted
```

**withMeta() use cases**

| Use case | Payload |
|----------|---------|
| Log retention routing | `{ years: 7, destination: 'cold-storage' }` |
| Compliance tagging | `{ policy: 'GDPR', dataClass: 'PII' }` |
| Experiment tracking | `{ experiment: 'checkout-v2', variant: 'B' }` |
| Release context | `{ version: '1.4.0', deployId: 'd-001' }` |

> `withRetention()` is kept for backward compatibility and delegates to `withMeta()`.

---

## Express / Fastify middleware

One middleware wires automatic context propagation into every request. Define your constants once and use them everywhere — config, middleware, service calls.

```typescript
// constants/context.ts
export const FIELD_CORRELATION_ID = 'correlationId';
export const FIELD_TENANT_ID      = 'tenantId';
export const SOURCE_FRONTEND      = 'frontend';
export const TARGET_HTTP          = 'http';
```

```typescript
import { randomUUID } from 'crypto';
import { syntropyLog, extractInboundContext } from 'syntropylog';
import { FIELD_CORRELATION_ID, SOURCE_FRONTEND } from './constants/context';

await syntropyLog.init({
  context: {
    inbound:  { [SOURCE_FRONTEND]: { [FIELD_CORRELATION_ID]: 'X-Correlation-ID', tenantId: 'X-Tenant-ID' } },
    outbound: { http:              { [FIELD_CORRELATION_ID]: 'X-Correlation-ID', tenantId: 'X-Tenant-ID' } },
  },
});

const { contextManager, config } = syntropyLog;

app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    // 1. Pure translation: wire names → internal field names.
    //    extractInboundContext normalizes wire names to lowercase (Node.js lowercases all incoming headers).
    //    Returns only the fields that were present in the request — no defaults, no opinions.
    const fields = extractInboundContext(req.headers, SOURCE_FRONTEND, config.context);

    // 2. Your policy: decide what happens when a field is missing.
    //    The framework does not know what a "correlation ID" is — that is your domain.
    contextManager.set(FIELD_CORRELATION_ID, fields[FIELD_CORRELATION_ID] ?? randomUUID());
    if (fields['tenantId']) contextManager.set('tenantId', fields['tenantId']);

    next();
  });
});
```

Every log emitted during a request automatically carries `correlationId` and `tenantId` — extracted from the incoming headers or generated if absent.

```typescript
app.get('/orders/:id', async (req, res) => {
  log.info('Fetching order', { orderId: req.params.id });
  // → {"level":"info","message":"Fetching order","service":"api",
  //    "correlationId":"req-abc","tenantId":"acme","orderId":"123"}
});
```

---

## Propagation headers

### Conceptual field names

`correlationId`, `tenantId`, `traceId` are **conceptual names internal to the framework**. They are not the names that travel on the wire — they are the keys SyntropyLog uses to identify each field inside the active context.

The actual name that travels — the HTTP header, the Kafka key, the S3 metadata key — is declared by you in the configuration. The framework uses the conceptual names internally to read and write context, and translates them to the correct wire name for each destination at the moment of sending.

```
inbound['frontend']   internal context     outbound['http']       outbound['kafka']
───────────────────   ────────────────     ─────────────────      ─────────────────
X-Correlation-ID   -> correlationId     -> X-Correlation-ID  /   correlationId
X-Tenant-ID        -> tenantId          -> X-Tenant-ID       /   tenantId

inbound['partner']    internal context     outbound['http']       outbound['kafka']
───────────────────   ────────────────     ─────────────────      ─────────────────
x-request-id       -> correlationId     -> X-Correlation-ID  /   correlationId
```

`inbound` and `outbound` are symmetric: `{ name: { field: wireName } }`. Each inbound source can use different wire names — the internal context and outbound side are identical regardless of which source the request came in from. Application code only ever works with conceptual names.

---

### Configuration

No built-in defaults. You declare exactly the fields your service needs — nothing more, nothing less. The recommended pattern is to define constants in one file and use them as keys everywhere — config, middleware, and callers. A typo is caught by the IDE instead of failing silently at runtime.

```typescript
// constants/context.ts
export const FIELD_CORRELATION_ID = 'correlationId';
export const FIELD_TRACE_ID       = 'traceId';
export const FIELD_TENANT_ID      = 'tenantId';

export const SOURCE_FRONTEND = 'frontend';
export const SOURCE_PARTNER  = 'partner';
export const SOURCE_LEGACY   = 'legacy';

export const TARGET_HTTP  = 'http';    // default — used by getPropagationHeaders() with no arg
export const TARGET_KAFKA = 'kafka';
export const TARGET_S3    = 's3';
```

```typescript
import { FIELD_CORRELATION_ID, FIELD_TRACE_ID, FIELD_TENANT_ID,
         SOURCE_FRONTEND, SOURCE_PARTNER, SOURCE_LEGACY,
         TARGET_HTTP, TARGET_KAFKA, TARGET_S3 } from './constants/context';

await syntropyLog.init({
  context: {
    inbound: {
      [SOURCE_FRONTEND]: { [FIELD_CORRELATION_ID]: 'X-Correlation-ID', [FIELD_TRACE_ID]: 'X-Trace-ID' },
      [SOURCE_PARTNER]:  { [FIELD_CORRELATION_ID]: 'x-request-id',     [FIELD_TRACE_ID]: 'x-b3-traceid' },
      [SOURCE_LEGACY]:   { [FIELD_CORRELATION_ID]: 'correlationid' },
    },
    outbound: {
      [TARGET_HTTP]:  { [FIELD_CORRELATION_ID]: 'X-Correlation-ID', [FIELD_TRACE_ID]: 'X-Trace-ID' },
      [TARGET_KAFKA]: { [FIELD_CORRELATION_ID]: 'correlationId',    [FIELD_TRACE_ID]: 'traceId' },
      [TARGET_S3]:    { [FIELD_CORRELATION_ID]: 'Correlation_ID' },
    },
  },
});
```

The `source` parameter in the middleware tells `extractInboundContext` which inbound mapping to use. A BFF receiving traffic from multiple origins can declare each source separately — each with different wire names mapping to the same conceptual fields. Outbound is identical regardless of source.

### Usage

```typescript
await contextManager.run(async () => {
  contextManager.set(FIELD_CORRELATION_ID, 'req-001');
  contextManager.set(FIELD_TRACE_ID, 'trace-xyz');

  // No arg — uses 'http' target by default
  await fetch('https://service-b/api', {
    headers: contextManager.getPropagationHeaders(),
  });
  // → { 'X-Correlation-ID': 'req-001', 'X-Trace-ID': 'trace-xyz' }

  await kafkaProducer.send({ topic, messages: [{
    headers: contextManager.getPropagationHeaders(TARGET_KAFKA),
    value,
  }]});
  // → { correlationId: 'req-001', traceId: 'trace-xyz' }

  await s3.putObject({
    Metadata: contextManager.getPropagationHeaders(TARGET_S3),
  });
  // → { Correlation_ID: 'req-001' }
});
```

Only fields that have a value in the active context appear in the result. Returns `{}` if called outside a context or when `outbound` is not configured.

**Context accessors**

```typescript
contextManager.get(FIELD_CORRELATION_ID)                // → 'req-001'
contextManager.get(FIELD_TRACE_ID)                      // → 'trace-xyz'
contextManager.getOutboundHeaderName(FIELD_CORRELATION_ID)          // → 'X-Correlation-ID'
contextManager.getOutboundHeaderName(FIELD_CORRELATION_ID, TARGET_KAFKA) // → 'correlationId'
```

**Optional: passthrough custom headers**

Forward arbitrary headers from the inbound request without mapping them to conceptual fields. They are stored with lowercased, hyphen-to-underscore keys (`x_feature_flag`).

```typescript
context: { customHeaders: ['X-Feature-Flag', 'X-AB-Test'] }
```

**Upgrade from rc.1** — `correlationIdHeader` / `transactionIdHeader` and all `getTraceContextHeaders()`, `getCorrelationId()`, `getTransactionId()` methods continue to work unchanged. Migrate at your own pace.

---

## Logging matrix

A declarative contract that defines exactly which context fields appear at each log level. If a field isn't in the matrix for that level, it never appears in the output — lean on `info`, full on `error`.

```typescript
await syntropyLog.init({
  loggingMatrix: {
    default: ['correlationId'],
    info:    ['correlationId', 'userId', 'operation'],
    warn:    ['correlationId', 'userId', 'operation', 'errorCode'],
    error:   ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId', 'orderId'],
    fatal:   ['*'],  // all context fields
  },
});
```

Change which fields are visible per level without restart — security boundary: only field visibility changes; masking and transports stay as set at `init()`.

```typescript
syntropyLog.reconfigureLoggingMatrix({ info: ['correlationId', 'userId'], error: ['*'] });
```

---

## Transports

| Transport | Output | Use case |
|-----------|--------|----------|
| *(default)* | Structured JSON | Production, log aggregators |
| `ClassicConsoleTransport` | Single-line, colored | Development, Spring Boot-style |
| `PrettyConsoleTransport` | Pretty-printed, colored | Development, deep inspection |
| `CompactConsoleTransport` | Compact one-liner, colored | Development, high volume |
| `ColorfulConsoleTransport` | Full-line colored | Live debugging in a POD |
| `AdapterTransport` | Any destination | Databases, HTTP APIs, queues, multiple targets |

Console transports auto-detect TTY — when stdout is not a terminal (CI, pipes, production), they fall back to plain JSON automatically.

### AdapterTransport + UniversalAdapter

The most powerful routing primitive. You provide an `executor` function — sync or async — that receives the clean, already-masked log entry and sends it anywhere. SyntropyLog handles context propagation, masking, level filtering, error isolation, and fanout.

```typescript
import { AdapterTransport, UniversalAdapter, UniversalLogFormatter } from 'syntropylog';

// 1. Map log entry fields to your schema once
const formatter = new UniversalLogFormatter({
  mapping: { level: 'level', message: 'message', correlationId: 'correlationId', payload: 'meta', timestamp: 'timestamp' },
});

// 2. Write one executor — any number of destinations
const dbTransport = new AdapterTransport({
  name: 'db',
  formatter,
  adapter: new UniversalAdapter({
    executor: async (data) => {
      const row = { ...data, timestamp: new Date(data.timestamp as string) };
      // Same object, three destinations
      await Promise.all([
        prisma.systemLog.create({ data: row }),
        getRepository(SystemLog).save(row),
        esClient.index({ index: 'logs', body: row }),
      ]);
    },
  }),
});
```

When the executor is called, the entry is already masked, context-enriched, and formatted. The executor is the only thing you write.

### Per-call transport control

Define a pool with `transportList` and `env`, then override for one call without new logger instances:

```typescript
await syntropyLog.init({
  logger: {
    transportList: { console: new ColorfulConsoleTransport(), db: dbTransport },
    env: { development: ['console'], production: ['console', 'db'] },
    envKey: 'NODE_ENV',
  },
});

log.info('uses env default');
log.override('console').info('only to console');
log.remove('db').add('console').info('default minus db');
```

---

## Hot reconfiguration (per POD)

Change log level, add masking rules, or add a debug transport per POD at runtime — no restart needed.

The only things you can change without restart are:

1. **Log level** — raise to `debug` on a single POD for troubleshooting.
2. **Additive masking rules** — new fields start being redacted from logs.
3. **Transports (debug only)** — add a console transport so a developer can see output clearly inside a POD. Existing transports are not removed. Call `resetTransports()` when done.

```typescript
// Add a debug transport while investigating an error in a POD
syntropyLog.reconfigureTransportsForDebug({
  add: [new ColorfulConsoleTransport({ level: 'error' })],
});
// When done — remove it, restore original state
syntropyLog.resetTransports();
```

The library does not provide an HTTP endpoint. Expose one yourself (e.g. `POST /admin/reconfigure-logging`) and secure it (internal only, authenticated). See the [full example in the current README archive](docs/features-and-examples.md) for an Express handler covering `level`, `loggingMatrix`, `addMaskingRules`, `addTransportForDebug`, and `resetTransports`.

---

## OpenTelemetry integration

SyntropyLog requires no changes to integrate with OpenTelemetry. Define a formatter, write an executor that calls `otelLogger.emit()`, register it as a transport.

```typescript
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { AdapterTransport, UniversalAdapter, UniversalLogFormatter } from 'syntropylog';

const otelFormatter = new UniversalLogFormatter({
  mapping: { body: 'message', severityText: 'level', timestamp: 'timestamp' },
  includeAllIn: 'attributes',
});

const otelTransport = new AdapterTransport({
  name: 'otel',
  formatter: otelFormatter,
  adapter: new UniversalAdapter({
    executor: (data) => {
      const entry = data as { body: string; severityText: string; timestamp: string; attributes?: Record<string, unknown> };
      const ms = new Date(entry.timestamp).getTime();
      logs.getLogger('my-service').emit({
        timestamp:      [Math.floor(ms / 1000), (ms % 1000) * 1_000_000],
        severityNumber: SEVERITY_NUMBER[entry.severityText] ?? SeverityNumber.UNSPECIFIED,
        severityText:   entry.severityText.toUpperCase(),
        body:           entry.body,
        attributes:     entry.attributes ?? {},
      });
    },
  }),
});
```

Per-call routing works the same as any other transport: `.override('otel')`, `.remove('otel')`, `.add('otel')`. Full guide: [docs/opentelemetry-integration.md](docs/opentelemetry-integration.md).

---

## Observability hooks

Optional callbacks to observe pipeline failures without ever throwing:

```typescript
await syntropyLog.init({
  onLogFailure:            (err, entry)   => metrics.increment('log_failures'),
  onTransportError:        (err, context) => alerting.notify('transport', context, err),
  onSerializationFallback: ()             => metrics.increment('serialization_fallback'),
  masking: { onMaskingError: (err)        => metrics.increment('masking_errors') },
});
```

| Hook | When it fires |
|------|--------------|
| `onLogFailure(error, entry)` | Log call fails (serialization or transport) |
| `onTransportError(error, context)` | Transport fails; `context` is `'flush'`, `'shutdown'`, or `'log'` |
| `onSerializationFallback(reason)` | Native addon failed for this call; JS pipeline used |
| `onStepError(step, error)` | Pipeline step failed (e.g. hygiene) |
| `masking.onMaskingError(error)` | Masking failed; never receives the raw payload |

---

## Native addon (Rust)

An optional Rust addon (`syntropylog-native`) does serialize + mask + sanitize in a single pass — no extra CPU on Node.js. It installs automatically on Node ≥ 20 for Linux, macOS, and Windows. No config needed.

```typescript
if (syntropyLog.isNativeAddonInUse()) {
  // Rust pipeline active
}
// Disable: SYNTROPYLOG_NATIVE_DISABLE=1
```

Build from source: [docs/building-native-addon.md](docs/building-native-addon.md).

---

## Performance

```
Simple log                    Complex object + masking
──────────────────────────    ──────────────────────────────────────
SyntropyLog   ~0.5 µs  ①     Pino          ~1.2 µs  (no masking)
Pino          ~0.8 µs        SyntropyLog   ~1.8 µs  ② ✅ masking ON
Winston       ~3.2 µs        Winston       ~4.1 µs  (no masking)
```

> Native addon active, null transport, Node.js 20 — numbers are conservative.

**SyntropyLog with masking fully active is faster than Pino without masking.** The Rust addon handles serialization + masking + sanitization in one pass with no extra GC pressure.

Sustained throughput — from the benchmark report:

| Scenario | logs/sec | µs/log |
|----------|----------|--------|
| Simple log | **~680,000** | ~1.5 |
| With masking (native) | **~400,000** | ~2.5 |
| child() + context + log | **~350,000** | ~2.8 |

See [docs/benchmark-report.md](docs/benchmark-report.md). Run: `pnpm run bench` or `pnpm run bench:memory`.

---

## What SyntropyLog is not

SyntropyLog is a structured logging and context propagation framework. It is not:

- A log aggregation backend (use Elasticsearch, Loki, CloudWatch)
- A distributed tracing system (use OpenTelemetry — see the integration guide)
- A metrics collector (use Prometheus, Datadog)

It is the component that makes every log line correct, consistent, and safe before it reaches any of those systems.

---

## Security

**No network I/O at runtime.** SyntropyLog does not contact any external URLs. The only output is what your transports produce.

**Zero runtime dependencies.** The core package has no `dependencies` in `package.json`. The optional native addon is built from auditable Rust source in the same repository — no opaque pre-compiled binaries.

**socket.dev notes:**
- *Native addon execution* — built from source at `syntropylog-native/`; reproducible via `@napi-rs/cli`. Falls back to JS transparently.
- *Custom masking function* — `customMask` is consumer-supplied configuration, not influenced by external input. If an attacker can modify your SyntropyLog config at runtime, the threat boundary was already crossed.
- *Dynamic require* — all module paths are static string literals; no user input constructs require paths.

Full details: [SECURITY.md](./SECURITY.md).

---

## Examples

The **[syntropylog-examples](https://github.com/Syntropysoft/syntropylog-examples)** repository has 18 runnable examples covering every feature:

| Group | Examples | Topics |
|-------|----------|--------|
| **Fundamentals** | 01–10 | Setup, context, levels, transports, logging matrix, transport pool |
| **Integration** | 11–13 | HTTP correlation (Axios), custom adapters, UniversalAdapter |
| **Testing** | 14–17 | Vitest, Jest, serializers, transport concepts |
| **Benchmark** | 18 | SyntropyLog vs Pino vs Winston (throughput + memory) |

```bash
cd 00-setup-initialization
npm install && npm run dev
```

---

## Documentation

**English (primary)**

- **[Examples repository](https://github.com/Syntropysoft/syntropylog-examples)** — Runnable examples 01–18.
- **[Features and examples](docs/features-and-examples.md)** — Canonical stack list with explanations and code examples.
- **[Transport pool and per-environment routing](examples/TRANSPORT_POOL_AND_ENV.md)** — `transportList`, `env`, override/add/remove.
- **[OpenTelemetry integration](docs/opentelemetry-integration.md)** — Full guide with formatter options, severity table, per-call routing.
- **[Benchmark report (throughput + memory)](docs/benchmark-report.md)** — Run `pnpm run bench` or `pnpm run bench:memory`.
- **[Sensitive key aliases](docs/SENSITIVE_KEY_ALIASES.md)** — `maskEnum` full list and grouped arrays.
- **[Sonar: exception for a specific file](docs/SONAR_FILE_EXCEPTION.md)** — How to exclude your own sensitive words file from Sonar S2068.
- **[Rust addon — build from source](docs/building-native-addon.md)** — macOS, Windows, Linux.
- **[Testing mocks](docs/testing-mocks.md)** — `SyntropyLogMock`, `createTestHelper`, etc.
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — How to contribute.
- **[SECURITY.md](./SECURITY.md)** — Security policy and environment variables.

**Spanish (ES)**

- **[Características y ejemplos](doc-es/caracteristicas-y-ejemplos.md)**
- **[Integración OpenTelemetry](doc-es/integracion-opentelemetry.md)**
- **[Informe de benchmarks](doc-es/benchmark-memory-run.md)**
- **[Addon Rust — compilar desde fuente](doc-es/building-native-addon.es.md)**

---

## Contributing & License

See [CONTRIBUTING.md](./CONTRIBUTING.md). License: **Apache-2.0**.
