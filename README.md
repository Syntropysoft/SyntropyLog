# SyntropyLog

<p align="center">
  <img src="https://syntropysoft.com/syntropylog-logo.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>The Declarative Observability Framework for Node.js</strong>
  <br />
  You declare what each log should carry. SyntropyLog handles the rest.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml"><img src="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml/badge.svg" alt="CI Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-95.13%25-brightgreen" alt="Test Coverage"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-v1.0.0--rc.1-blue.svg" alt="Version 1.0.0-rc.1"></a>
  <a href="https://socket.dev/npm/package/syntropylog"><img src="https://socket.dev/api/badge/npm/package/syntropylog" alt="Socket Badge"></a>
</p>

---

## What is SyntropyLog?

Every Node.js team building microservices ends up writing the same boilerplate: correlation ID middleware, masking logic, context propagation, transport routing by environment. It gets copy-pasted, modified slightly, and drifts between services until nobody knows which version is correct.

SyntropyLog is that boilerplate **standardized as a declarative observability framework**.

You declare the intent. The framework executes it consistently — across every service, every request, every environment.

---

### The declarative shift

With Pino or Winston, you **write** logging. With SyntropyLog, you **declare** observability.

| You declare | How | What the framework does |
|-------------|-----|------------------------|
| Which fields appear per log level | `loggingMatrix` | Filters automatically — lean on `info`, full on `error` |
| What data is sensitive | `masking` | Redacts before any transport, always, without exception |
| Where logs go per environment | `transportList + env` | Routes automatically — console in dev, DB + OTel in prod |
| What context each logger carries | `.child({ ... })` | Binds once, present on every log from that instance |
| Request correlation | `contextManager.run()` | Propagates through the entire async chain automatically |

That is the philosophy. Every feature in this library is an expression of it.

### See it all together

This is one log call in a real payment service:

```typescript
syntropyLog.getLogger('payment-service')     // identifies the component in every log
  .child({ provider: 'stripe', currency: 'USD' }) // binds business context once
  .withSource('ChargeProcessor')             // marks the internal module
  .withTransactionId('txn-789')              // tracks across services
  .withMeta({ policy: 'PCI-DSS', years: 7, destination: 's3-cold' }) // executor routing payload
  .audit('Card charged', { amount: 299 });   // always logged, bypasses level filter
```

Behind that single call, the framework:
- Propagates the correlation ID from the current request context (AsyncLocalStorage)
- Applies the logging matrix — only the declared fields for `audit` level appear
- Runs masking — card numbers, tokens, emails redacted before leaving the process
- Sanitizes — control characters stripped, log injection blocked
- Routes to the right transports for the current environment
- Delivers the sanitized payload to your executor, which reads `logEntry.retention` and persists to S3 cold storage

The dev declares intent. The framework executes it — consistently, on every call, in every service.

---

### Built for teams, not individuals

The real cost of observability is not writing the first logger — it's the **fifth microservice** where someone forgets the masking, the **third environment** where the transport config drifts, the **on-call at 3am** where the correlation ID is missing from half the logs.

SyntropyLog solves the team problem: one declaration, consistent behavior everywhere.

---

### Core design

| Concept | What it does |
| :--- | :--- |
| **Native Addon (Rust)** | Single-pass serialize + mask + sanitize at maximum speed. No CPU overhead on Node.js. |
| **Logging Matrix** | Declarative contract: which context fields appear per log level. Only declared fields are processed. |
| **MaskingEngine** | Real-time redaction of sensitive fields before any transport; built-in + custom rules. |
| **Universal Adapter** | One `executor` function → any backend (DB, Elasticsearch, S3, OTel). No vendor lock-in. |

- **Performance:** Rust addon keeps logging lightweight on Node.js CPU.
- **Compliance:** `audit` level + retention policies facilitate SOX, GDPR, PCI-DSS audits.
- **Security:** Masking + sanitization prevent data leakage and log injection.
- **Traceability:** Correlation ID propagates automatically across all services and log levels.

---

## Full picture — what's in the box

Each feature below is something you **declare once** in `init()` or on a logger instance. The framework executes it consistently on every log call, in every service, without repetition. Each item has a **How** section in this README.

| # | Feature | What it does |
|---|--------|---------------|
| 1 | **Native addon (Rust)** | Single-pass serialize + mask + sanitize; ANSI strip. Falls back to JS if unavailable. |
| 2 | **Logging Matrix** | Declarative control of which context fields appear per level (lean on `info`, full on `error`). |
| 3 | **Matrix in runtime** | `reconfigureLoggingMatrix()` without restart; only field visibility, not security. |
| 4 | **MaskingEngine** | Redact sensitive fields before any transport; built-in + custom rules. |
| 5 | **SanitizationEngine** | Strip control characters; log injection resistant. |
| 6 | **Serialization pipeline** | Circular refs, depth limit, timeout; logging never blocks the event loop. |
| 7 | **Context / headers** | Correlation ID and transaction ID from config; single source of truth. |
| 8 | **Universal Adapter** | Send logs to any backend (PostgreSQL, MongoDB, Elasticsearch, S3) via one `executor` function. |
| 9 | **Per-call transport control** | `.override()`, `.add()`, `.remove()` for one log call without new logger instances. |
| 10 | **Named loggers + fluent API** | `getLogger(name)`, `child()`, `withMeta()`, `withSource()`, `withTransactionId()` — declare once, carried on every log. |
| 11 | **Audit & metadata routing** | `audit` level (always logged); `withMeta(anyJson)` — arbitrary structured payload, sanitized, routable by executor. |
| 12 | **Lifecycle** | `init()` / `shutdown()`; graceful flush on SIGTERM/SIGINT. |
| 13 | **Observability hooks** | `onLogFailure`, `onTransportError`, `onSerializationFallback`, etc.; `isNativeAddonInUse()`. |
| 14 | **OpenTelemetry integration** | `UniversalAdapter` + `UniversalLogFormatter` → send logs to any OTel collector; no library changes needed. |
| 15 | **Hot reconfiguration (per POD)** | Change log level, add masking rules, or add a debug transport per POD at runtime via your own HTTP endpoint; no restart needed. |

**More detail and examples:** this README (English). See also [docs/features-and-examples.md](docs/features-and-examples.md). [También en español (ES)](doc-es/caracteristicas-y-ejemplos.md).

---

## Quick Start

### Install

```bash
npm install syntropylog
```

Prebuilt native addon (Rust) for Linux, Windows, macOS installs automatically on Node ≥20. If unavailable, the JS pipeline is used transparently.

### Init and first log

**`syntropyLog.init()` returns a `Promise<void>` — just await it.** Until it resolves, `getLogger()` returns a no-op logger that drops all messages.

```typescript
import { syntropyLog } from 'syntropylog';

async function main() {
  await syntropyLog.init({
    logger: { level: 'info', serviceName: 'my-app' },
  });

  if (syntropyLog.isNativeAddonInUse()) {
    console.log('⚡ Native Rust addon active');
  } else {
    console.log('ℹ️  Native addon not active — JS pipeline in use');
    console.log('   → Requires Node ≥ 20, supported platform (Linux/macOS/Windows x64/arm64)');
    console.log('   → To force JS mode intentionally: set SYNTROPYLOG_NATIVE_DISABLE=1');
  }

  const log = syntropyLog.getLogger();
  log.info('Hello, SyntropyLog.');
}
main();
```

### Load config from a file or environment variables

All config is passed to `init()` — the library does not read files or env vars automatically. Map them yourself before calling `init()`:

```typescript
// From environment variables
await syntropyLog.init({
  logger: {
    serviceName: process.env.SERVICE_NAME ?? 'my-app',
    level: (process.env.LOG_LEVEL ?? 'info') as 'info',
    environment: process.env.NODE_ENV ?? 'development',
    transportList: { json: new ConsoleTransport(), pretty: new ClassicConsoleTransport() },
    env: { development: ['pretty'], production: ['json'] },
  },
});

// From a JSON file
import { readFileSync } from 'fs';
import type { SyntropyLogConfig } from 'syntropylog';
const config: SyntropyLogConfig = JSON.parse(readFileSync('./syntropylog.config.json', 'utf-8'));
await syntropyLog.init({ ...config, logger: { ...config.logger, transports: [new ConsoleTransport()] } });
```

> Transports are class instances — they cannot be JSON-serialized. Define them in code and merge with the loaded config.

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

## Examples

The **[syntropylog-examples](https://github.com/Syntropysoft/syntropylog-examples)** repository has 18 runnable examples covering every feature in this README:

| Group | Examples | Topics |
|-------|----------|--------|
| **Fundamentals** | 01–10 | Setup, context, levels, transports, logging matrix, transport pool |
| **Integration** | 11–13 | HTTP correlation (Axios), custom adapters, UniversalAdapter |
| **Testing** | 14–17 | Vitest, Jest, serializers, transport concepts |
| **Benchmark** | 18 | SyntropyLog vs Pino vs Winston (throughput + memory) |

```bash
# Run any example
cd 00-setup-initialization
npm install && npm run dev
```

---

## Console transports

**What:** You declare which console style you want — plain JSON (default) or one of the colored variants for development. Colors use built-in ANSI; no chalk. Disabled automatically when stdout is not a TTY or `NO_COLOR` is set.

| Transport | Style | Typical use |
|-----------|--------|-------------|
| *(default)* | Plain JSON | Production, log aggregators |
| `ClassicConsoleTransport` | Single-line, colored | Development, Spring Boot–style |
| `PrettyConsoleTransport` | Pretty-printed, colored | Development, deep inspection |
| `CompactConsoleTransport` | Compact one-liner, colored | Development, high volume |
| `ColorfulConsoleTransport` | Full-line colored | Live debugging in a POD |

**How:**

```typescript
import { ClassicConsoleTransport } from 'syntropylog';
await syntropyLog.init({
  logger: {
    level: 'info',
    serviceName: 'my-app',
    transports: [new ClassicConsoleTransport()],
  },
});
```

---

## 1. Native addon (Rust)

**What:** Optional Rust addon does serialize + mask + sanitize in one pass. Used automatically when available; no config. Disable with `SYNTROPYLOG_NATIVE_DISABLE=1` (e.g. debugging).

**How:** Nothing to configure. Check at runtime:

```typescript
if (syntropyLog.isNativeAddonInUse()) {
  // Rust pipeline active
}
```

To build the native addon from source, see [docs/building-native-addon.md](docs/building-native-addon.md).

---

## 2. Logging Matrix

**What:** A JSON contract that defines exactly which context fields appear at each log level. If a field isn't in the matrix for that level, it never appears in the output.

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

## 3. Matrix in runtime

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

### Spread default rules and add your own

You can use the default rules and add more in one go: pass `getDefaultMaskingRules({ maskChar: '*', preserveLength: true })` and spread your custom rules. Set `enableDefaultRules: false` when you provide the full list yourself.

```typescript
import { getDefaultMaskingRules, MaskingStrategy } from 'syntropylog';

masking: {
  enableDefaultRules: false,
  maskChar: '*',
  rules: [
    ...getDefaultMaskingRules({ maskChar: '*' }),
    { pattern: /myCustomKey|internalSecret/i, strategy: MaskingStrategy.PASSWORD },
  ],
}
```

### Sensitive key aliases: use `maskEnum`

The library exports a **single object `maskEnum`** with all sensitive key aliases and grouped arrays. Import it once and pick or spread what you need—no string literals (Sonar-safe), and no listing every constant.

```typescript
import { maskEnum, MaskingStrategy, getDefaultMaskingRules } from 'syntropylog';

masking: {
  enableDefaultRules: false,
  maskChar: '*',
  rules: [
    ...getDefaultMaskingRules({ maskChar: '*' }),
    // One pattern for all token-like keys (access_token, refresh_token, api_key, jwt, …)
    { pattern: new RegExp(maskEnum.MASK_KEYS_TOKEN.join('|'), 'i'), strategy: MaskingStrategy.TOKEN },
    // Or pick a few
    { pattern: new RegExp([maskEnum.MASK_KEY_ACCESS_TOKEN, maskEnum.MASK_KEY_REFRESH_TOKEN].join('|'), 'i'), strategy: MaskingStrategy.TOKEN },
  ],
}
```

`maskEnum` includes every `MASK_KEY_*` (e.g. `MASK_KEY_PWD`, `MASK_KEY_ACCESS_TOKEN`) plus `MASK_KEYS_PASSWORD`, `MASK_KEYS_TOKEN`, and `MASK_KEYS_ALL`. Full list and alternatives: [docs/SENSITIVE_KEY_ALIASES.md](docs/SENSITIVE_KEY_ALIASES.md).

### Sonar exception for a file with your own words

If you have a file in your project where you define **your own** sensitive words or aliases (e.g. `mySensitiveKeys.ts`), Sonar may report secrets (e.g. S2068) there. You can add an exception so that file does not block the deploy:

- **Exclude the file from analysis:** in your `sonar-project.properties`, add it to `sonar.exclusions` (e.g. `sonar.exclusions=**/mySensitiveKeys.ts`).
- **Or ignore only rule S2068 on that file:** use `sonar.issue.ignore.multicriteria` with `ruleKey=typescript:S2068` and `resourceKey` set to that file's path.

Full steps and examples: [docs/SONAR_FILE_EXCEPTION.md](docs/SONAR_FILE_EXCEPTION.md).

| Strategy | Example output |
|----------|----------------|
| PASSWORD | `********` |
| EMAIL | `j***@example.com` |
| TOKEN | `eyJh...a1B9c` |
| CREDIT_CARD | `****-****-****-1234` |

If masking fails, the pipeline does not throw (Silent Observer). Custom rules: use ReDoS-safe regex; keys longer than 256 chars are skipped.

---

## 5. SanitizationEngine

**What:** Strips control characters and ANSI from string values before any transport writes. Reduces log injection risk.

**How:** No configuration; it runs inside the pipeline. Together with the Logging Matrix (whitelist), it forms the safety boundary for log content.

---

## 6. Serialization pipeline (resilience)

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

## 8. Universal Adapter — log to any backend

**What:** Send each log to PostgreSQL, MongoDB, Elasticsearch, S3, etc. by implementing a single `executor`. No vendor lock-in. You define **once** how the log entry maps to your schema; the executor only receives that mapped object and persists it (ORM, raw client, HTTP). If `executor` throws, SyntropyLog logs the error and continues (Silent Observer).

**How:** Use `AdapterTransport` + `UniversalAdapter` + `UniversalLogFormatter`. Three steps:

---

### 1. Define the mapping (outside the executor)

Define how each log entry field maps to your persistence shape. One place, no repetition in code. Use `UniversalLogFormatter` with a `mapping` object: keys = your schema (e.g. DB columns), values = path in the log entry.

| Log entry path | Meaning |
|----------------|--------|
| `level` | Log level |
| `message` | Message string |
| `serviceName` | From init config |
| `correlationId` | From context |
| `timestamp` | ISO string |
| `meta` | Merged metadata (use as payload/JSON column) |

Example: map to a table with columns `level`, `message`, `serviceName`, `correlationId`, `payload`, `timestamp`.

```typescript
import { UniversalLogFormatter } from 'syntropylog';

const logToDbMapping = {
  level:         'level',
  message:       'message',
  serviceName:   'serviceName',
  correlationId: 'correlationId',
  payload:       'meta',
  timestamp:     'timestamp',
};

const formatter = new UniversalLogFormatter({ mapping: logToDbMapping });
```

The formatter turns every log entry into an object with exactly those keys. Change the mapping here when your schema changes; the executor stays the same.

---

### 2. The object the executor receives

When you attach this formatter to the transport, the `executor` receives **that mapped object** (not the raw log entry). So the executor only sees something like `{ level, message, serviceName, correlationId, payload, timestamp }`. Your only job in the executor is to **persist** that object.

---

### 3. Sending that object to your backend

One mapping produces one object shape. You can send **that same object** to as many backends as you want in a single executor: same `data`, different destinations (e.g. Prisma, TypeORM, Mongoose, Elasticsearch, S3). No field list — the shape comes from the mapping.

**Example: one mapped object → three destinations**

```typescript
import { AdapterTransport, UniversalAdapter } from 'syntropylog';
import { prisma } from './prisma';
import { getRepository } from 'typeorm';
import { SystemLog as TypeOrmSystemLog } from './entities/SystemLog';
import { SystemLogModel } from './models/SystemLog';

const dbTransport = new AdapterTransport({
  name: 'db',
  formatter,
  adapter: new UniversalAdapter({
    executor: async (data) => {
      const row = {
        ...data,
        timestamp: new Date(data.timestamp as string),
      };
      // Same object, three destinations (e.g. Postgres + TypeORM DB + MongoDB)
      await Promise.all([
        prisma.systemLog.create({ data: row }),
        getRepository(TypeOrmSystemLog).save(row),
        SystemLogModel.create(row),
      ]);
    },
  }),
});
```

Use one transport and one executor; add or remove destinations in that same block. Use this transport in your `init()` (e.g. in `logger.transports` or `logger.transportList` + `logger.env`).

---

## 9. Per-call transport control

**What:** For a single log call you can send only to specific transports (`.override()`), add destinations (`.add()`), or remove one (`.remove()`), without creating new logger instances.

**How:** Define a transport pool with `transportList` and `env`, then use the fluent methods on the next call only:

```typescript
await syntropyLog.init({
  logger: {
    envKey: 'NODE_ENV',
    serviceName: 'my-app',
    serializerTimeoutMs: 100,
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

## 10. Named loggers, child loggers, and fluent API

### Named loggers — one per component

`getLogger(name)` returns a cached logger instance identified by name. The name appears as the `service` field in every log it emits. Create as many as you need — one per service, module, or concern:

```typescript
const authLog    = syntropyLog.getLogger('auth');
const orderLog   = syntropyLog.getLogger('order-service');
const paymentLog = syntropyLog.getLogger('payment');

authLog.info('User logged in', { userId: 'u-42' });
// → service: "auth"

orderLog.info('Order created', { orderId: 'ord-99' });
// → service: "order-service"
```

Each logger is independent — different name in the output, same transport pipeline underneath.

### `child()` — bind context once, carry it everywhere

`child(bindings)` returns a new logger that inherits everything from the parent and adds fixed key-value pairs to every log it emits. No need to repeat the same fields on every call:

```typescript
function processOrder(orderId: string, userId: string) {
  // Bind orderId + userId once for the whole function scope
  const log = syntropyLog.getLogger('order-service')
    .child({ orderId, userId });

  log.info('Processing started');           // orderId + userId included automatically
  log.info('Inventory checked');            // same
  log.info('Payment requested');            // same
  log.warn('Retry attempt', { attempt: 2 }); // orderId + userId + attempt
}
```

### Full composition — combine all builders

The builders chain fluently and each returns a new `ILogger`:

```typescript
const paymentLog = syntropyLog.getLogger('payment-service')
  .child({ provider: 'stripe', region: 'us-east-1' })
  .withSource('ChargeProcessor')
  .withTransactionId('txn-789')
  .withRetention({ policy: 'PCI-DSS', years: 7 });

// Every log from this instance carries all of the above automatically
paymentLog.audit('Card charged', { amount: 299, currency: 'USD' });
paymentLog.error('Charge failed', { code: 'card_declined' });
```

| Builder | Binds to every log | Notes |
|---------|-------------------|-------|
| `getLogger('name')` | `service: 'name'` | cached per name |
| `child({ k: v })` | arbitrary key-value pairs | foundation of all builders |
| `withSource('X')` | `source: 'X'` | module / component name |
| `withTransactionId('id')` | `transactionId: 'id'` | cross-service trace |
| `withMeta({ ... })` | `retention: { ... }` | any JSON — sanitized, routable by executor |

---

## 11. Audit and metadata routing

**What:** The `audit` level is always logged regardless of the configured level — it bypasses the level filter entirely. `withMeta(anyJson)` attaches an arbitrary structured payload that travels sanitized to every transport. The executor receives it as `logEntry.retention` and can route or persist based on its contents.

The payload is yours to define — it carries whatever your domain needs:

```typescript
// Compliance routing
log.withMeta({ policy: 'GDPR_ARTICLE_17', years: 7 })
   .audit({ userId: 123, action: 'data-export' }, 'GDPR export');

// Business context for the executor
log.withMeta({ tenant: 'acme-corp', billingTier: 'enterprise', region: 'eu-west' })
   .info('Invoice generated', { invoiceId: 'inv-001' });

// Custom routing hint
log.withMeta({ destination: 's3-cold-storage', compress: true, encrypt: true })
   .audit('Archive batch complete', { records: 50000 });
```

Your `executor` reads `logEntry.retention` and decides: which table, which bucket, which downstream system. SyntropyLog doesn't interpret the payload — it just carries it, sanitized, to wherever you tell it to go.

> `withRetention()` is kept for backward compatibility and delegates to `withMeta()`.

---

## 12. Lifecycle — init / shutdown

**What:** `init()` returns a `Promise<void>` — await it before calling `getLogger()`. `shutdown()` flushes in-flight logs and closes resources; hook it to SIGTERM/SIGINT so you don't lose logs on exit.

**How:** Init is shown in Quick Start. Shutdown:

```typescript
process.on('SIGTERM', async () => {
  await syntropyLog.shutdown();
  process.exit(0);
});
```

---

## 13. Observability hooks

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

## 14. OpenTelemetry integration

**What:** SyntropyLog requires no changes to integrate with OpenTelemetry. Define a formatter, write an executor that calls `otelLogger.emit()`, register it as a transport, and you're done.

**How:**

```typescript
import { syntropyLog, AdapterTransport, UniversalAdapter, UniversalLogFormatter } from 'syntropylog';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

// 1. Formatter — maps SyntropyLog fields to OTel shape
const otelFormatter = new UniversalLogFormatter({
  mapping: { body: 'message', severityText: 'level', timestamp: 'timestamp' },
  includeAllIn: 'attributes',
});

// 2. Severity table
const SEVERITY_NUMBER: Record<string, number> = {
  trace: 1, debug: 5, info: 9, audit: 9, warn: 13, error: 17, fatal: 21, silent: 0,
};

// 3. Executor — the bridge to OTel
function buildOtelExecutor(scopeName: string) {
  return function executor(data: unknown): void {
    const entry = data as { body: string; severityText: string; timestamp: string; attributes?: Record<string, unknown> };
    const otelLogger = logs.getLogger(scopeName);
    const ms = new Date(entry.timestamp).getTime();
    const attrs = entry.attributes ?? {};
    otelLogger.emit({
      timestamp:      [Math.floor(ms / 1000), (ms % 1000) * 1_000_000],
      severityNumber: SEVERITY_NUMBER[entry.severityText] ?? SeverityNumber.UNSPECIFIED,
      severityText:   entry.severityText.toUpperCase(),
      body:           entry.body,
      attributes:     attrs,
      traceId:        typeof attrs.traceId    === 'string' ? attrs.traceId    : undefined,
      spanId:         typeof attrs.spanId     === 'string' ? attrs.spanId     : undefined,
      traceFlags:     typeof attrs.traceFlags === 'number' ? attrs.traceFlags : 1,
    });
  };
}

// 4. Transport
const otelTransport = new AdapterTransport({
  name:      'otel',
  adapter:   new UniversalAdapter({ executor: buildOtelExecutor('my-service') }),
  formatter: otelFormatter,
});

// 5. Init
await syntropyLog.init({
  logger: {
    serviceName: 'my-service',
    level: 'info',
    transportList: { otel: otelTransport },
  },
  loggingMatrix: {
    info:  ['correlationId', 'traceId', 'spanId'],
    error: ['*'],
    audit: ['*'],
  },
});

// 6. Graceful shutdown
process.on('SIGTERM', async () => { await syntropyLog.shutdown(); process.exit(0); });
process.on('SIGINT',  async () => { await syntropyLog.shutdown(); process.exit(0); });

const log = syntropyLog.getLogger();
log.info({ traceId: 'abc123', spanId: 'def456' }, 'Payment processed');
```

Per-call routing works the same as any other transport: `.override('otel')`, `.remove('otel')`, `.add('otel')`.

For the full guide (formatter options, severity table, middleware injection, per-call routing): [docs/opentelemetry-integration.md](docs/opentelemetry-integration.md). [También en español](doc-es/integracion-opentelemetry.md).

---

## 15. Reconfiguration in runtime (hot)

**The only things you can reconfigure without restart are:**

1. **Log level** — e.g. raise to `debug` on a single POD for troubleshooting.
2. **Add masking rules** — add new rules so additional fields are redacted from logs.
3. **Transports (debug only)** — **only add** a console transport for developer clarity when someone has to review an error inside a POD. Existing transports are not removed; you add one (e.g. ColorfulConsoleTransport) so the developer sees output clearly. Only library console transports (Console, Pretty, Compact, Colorful, Classic); no AdapterTransport or custom. Call `resetTransports()` to remove the added one(s).

**Transports in hot (per POD — add one for visual debug; existing stay):**

```typescript
import { syntropyLog, ColorfulConsoleTransport } from 'syntropylog';

// When a developer needs to review an error inside a POD: add a console transport (existing transports stay)
syntropyLog.reconfigureTransportsForDebug({
  add: [new ColorfulConsoleTransport({ level: 'error' })],
});
// Later: remove the added transport(s)
syntropyLog.resetTransports();
```

Philosophy: only add console transports for visual help when debugging in a POD; existing transports are not removed. If you pass any other transport, the call throws.

**The library does not provide an HTTP endpoint.** Your backend should expose one (e.g. `POST /admin/reconfigure-logging`) so that, per POD or per service, you can apply the reconfigurations above. Supported body fields: `level`, `loggingMatrix`, `addTransportForDebug`, `addMaskingRules`, and **`resetTransports`** (set to `true` when done debugging to restore original transports and avoid extra logger overhead). Example with Express:

```typescript
import express from 'express';
import { syntropyLog, ColorfulConsoleTransport, MaskingStrategy } from 'syntropylog';

const app = express();
app.use(express.json());

// Your endpoint: reconfigure everything that can be changed in hot
app.post('/admin/reconfigure-logging', (req, res) => {
  try {
    const { level, loggingMatrix, addTransportForDebug, addMaskingRules, resetTransports } = req.body ?? {};

    if (level) {
      const logger = syntropyLog.getLogger();
      logger.setLevel(level);
    }
    if (loggingMatrix) syntropyLog.reconfigureLoggingMatrix(loggingMatrix);
    if (addTransportForDebug === true) {
      syntropyLog.reconfigureTransportsForDebug({ add: [new ColorfulConsoleTransport({ level: 'error' })] });
    }
    // Restore original transports when done debugging; avoids extra logger overhead
    if (resetTransports === true) syntropyLog.resetTransports();
    if (Array.isArray(addMaskingRules)) {
      const masker = syntropyLog.getMasker();
      for (const r of addMaskingRules) {
        masker.addRule({ pattern: new RegExp(r.pattern, 'i'), strategy: r.strategy });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
```

Secure this route (e.g. auth, internal only). When debugging in a POD is finished, send `resetTransports: true` so the added console transport is removed and everything is left as it was, avoiding extra logger overhead. Core masking config (`maskChar`, `maxDepth`), and the rest stay as set at `init()`.

---

## Security & Compliance

**Network & URLs:** This package does not contact any external URLs or IPs at runtime. The only network I/O is what you configure (e.g. your `executor` sending logs to your PostgreSQL, Elasticsearch, or API). URLs in this README and in `package.json` are documentation and metadata only (badges, repository links); they are not used for outbound connections.

**Environment variables:** The main package does not read any. The optional native addon (`syntropylog-native`) reads only `PATH` on Linux to locate the `ldd` binary for musl/glibc detection. No credentials or other env vars are read. See [SECURITY.md](./SECURITY.md) for the full list.

**Dynamic require:** The package does not use dynamic `require(variable)` or user-controlled paths. Module paths are static string literals (e.g. `require('syntropylog-native')`, `require('./index.js')`). The native addon loader chooses one of several fixed `.node` paths based on platform/arch; no user input is used to build require paths.

**Filesystem access:** The package only reads the files described below; it does not scan or read arbitrary paths.

- **Native addon loader** (`syntropylog-native`): Reads only (1) the presence of native `.node` binaries inside the package's own directory (`__dirname`) to choose the correct build for the current OS/arch, and (2) on Linux only, the system `ldd` binary (e.g. `/usr/bin/ldd`) to detect musl vs glibc. No user or application files are read.
Configuration is passed to `init()` only; the package does not load config from files.

| Dynamically configurable | Fixed at init |
|--------------------------|---------------|
| Log level, additive masking rules, transports (debug: add console only for visual help in a POD; existing stay; `resetTransports()` to remove added) | Core masking config (`maskChar`, `maxDepth`), Redis/HTTP/broker |

---

## Documentation

**English (primary)**

- **This README** — Full picture, Quick Start, and a "How" section per feature (above).
- **[Examples repository](https://github.com/Syntropysoft/syntropylog-examples)** — Runnable examples 01–18: setup, context, transports, HTTP correlation, testing, benchmark.
- **[Transport pool and per-environment routing](examples/TRANSPORT_POOL_AND_ENV.md)** — `transportList`, `env`, override/add/remove; runnable [TransportPoolExample.ts](examples/TransportPoolExample.ts).
- **[Features and examples](docs/features-and-examples.md)** — Canonical stack list with explanations and code examples; aligned with the benchmark report.
- **[Benchmark report (throughput + memory)](docs/benchmark-report.md)** — Run `pnpm run bench` or `pnpm run bench:memory` from repo root.
- **[Benchmark memory run](docs/benchmark-memory-run.md)** — Detailed memory figures; compare native vs JS: `pnpm run bench` vs `SYNTROPYLOG_NATIVE_DISABLE=1 pnpm run bench`.
- **[Sensitive key aliases](docs/SENSITIVE_KEY_ALIASES.md)** — Recommended use of `maskEnum` (single object, declarative); full list of `MASK_KEY_*` and grouped arrays.
- **[Sonar: exception for a specific file](docs/SONAR_FILE_EXCEPTION.md)** — How to add a Sonar exception when you have your own file with sensitive words or aliases (so it does not block deploy).
- **[OpenTelemetry integration](docs/opentelemetry-integration.md)** — How to send logs to OTel using `UniversalAdapter` + `UniversalLogFormatter`; no library changes needed.
- **[Rust addon — build from source](docs/building-native-addon.md)** — Build instructions for macOS, Windows, Linux.
- **[Improvement plan & roadmap](docs/code-improvement-analysis-and-plan.md)** — Backlog and phased plan.
- **[Rust implementation plan](docs/rust-implementation-plan.md)** — Native addon checklist; links to [rust-pipeline-optimization.md](docs/rust-pipeline-optimization.md).
- **[Testing mocks](docs/testing-mocks.md)** — Public testing API: `SyntropyLogMock`, `createTestHelper`, etc.
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — How to contribute.
- **[SECURITY.md](./SECURITY.md)** — Security policy and environment variables.

**Spanish (ES)**

- **[Características y ejemplos](doc-es/caracteristicas-y-ejemplos.md)** — Lista canónica del stack con explicaciones y ejemplos de código.
- **[Informe de benchmarks (throughput + memoria)](doc-es/benchmark-memory-run.md)** — `pnpm run bench` o `pnpm run bench:memory` desde la raíz del repo.
- **[Addon Rust — compilar desde fuente](doc-es/building-native-addon.es.md)**.
- **[Plan de mejoras y roadmap](doc-es/code-improvement-analysis-and-plan.md)** — Backlog y plan por fases.
- **[Plan de implementación Rust](doc-es/rust-implementation-plan.md)** — Checklist del addon nativo.
- **[Integración OpenTelemetry](doc-es/integracion-opentelemetry.md)** — Cómo enviar logs a OTel con `UniversalAdapter` + `UniversalLogFormatter`.

---

## Contributing & License

See [CONTRIBUTING.md](./CONTRIBUTING.md). License: **Apache-2.0**.
