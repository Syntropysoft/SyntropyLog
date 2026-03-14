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
  <a href="#"><img src="https://img.shields.io/badge/status-v0.10.0-brightgreen.svg" alt="Version 0.10.0"></a>
  <a href="https://socket.dev/npm/package/syntropylog"><img src="https://socket.dev/api/badge/npm/package/syntropylog" alt="Socket Badge"></a>
</p>

---

## 🎯 What is SyntropyLog?

SyntropyLog is a **structured observability framework** for Node.js — built from scratch, designed around flexibility and control.

The core idea is simple: **you declare what your logs should carry, and SyntropyLog makes it happen everywhere, automatically.** No manual plumbing, no scattered configuration, no hidden behavior.

That means:
- A **declarative Logging Matrix** that controls exactly which context fields appear at each log level — lean on `info`, full context on `error`.
- A **fluent logger API** (`withRetention`, `withSource`, `withTransactionId`) that lets you create specialized loggers carrying arbitrary organization-defined metadata.
- **Add, remove, or override transports on demand** — per log call you can send only to specific transports (`.override()`), add extra destinations (`.add()`), or drop one (`.remove()`), without creating new logger instances.
- A **MaskingEngine** that redacts sensitive fields before they reach any transport — built-in strategies and fully custom rules.
- An **Intelligent Serialization Pipeline** that automatically detects and neutralizes circular references, limits object depth, and enforces execution timeouts — making logs immune to application crashes.
- A **UniversalAdapter** that routes logs to any backend (PostgreSQL, MongoDB, Elasticsearch, S3) via a single `executor` function — no coupling, no lock-in.
- A **SanitizationEngine** that strips control characters from all log output, preventing log injection attacks.
- **Lightning Speed**: Optimized core pipeline delivering **~1,000,000 ops/s** even with full masking and context.

**This is not just another logger. It's about giving your team full declarative control over observability data with industry-leading performance and reliability.**

### Built for regulated industries

SyntropyLog was designed with the constraints of **banking, healthcare, and financial services** in mind:

- **HIPAA**: Field-level control over what appears in logs at each severity level via the Logging Matrix.
- **SOX**: Immutable audit trail via `withRetention` bindings and dedicated transports.

### Tree-shaking friendly

We ship with `sideEffects: false` and ESM so bundlers (Vite, Rollup, webpack, esbuild) can tree-shake unused code. What ends up in your app is only what you import.

---

## 🛡️ Why SyntropyLog? (The Resilience Factor)

Traditional loggers (and even modern ones) share a common weakness: **serialization is a blocking operation**. If you log a massive, deeply nested, or circular object, the Node.js Event Loop stops. Your API stops responding. Your service might even crash with a `TypeError`.

SyntropyLog v0.10.0 introduces the **Log Resilience Engine**, making your application immune to "Death by Log":

1.  **Event Loop Protection**: Every serialization step is wrapped in a mandatory timeout (default: **50ms**). If serialization takes too long, it is aborted via `Promise.race`, and a safe subset of the data is logged instead. Your app keeps running.
2.  **Circular Reference Immunity**: Built-in hygiene automatically detects and neutralizes circular references. No more `TypeError: Converting circular structure to JSON`.
3.  **Configurable Safety Limits**: Every object is protected by a double-guard:
    - `serializationMaxDepth` (default: **10**): Automatically truncates objects deeper than this to prevent Stack Overflow.
    - `serializationMaxBreadth` (default: **100**): Limits arrays and object keys to prevent Event Loop blockage on massive structures.
4.  **Silent Observer**: Logging should never throw. Our pipeline catches and reports its own failures inside the log message itself, ensuring 100% reliability.
5.  **Lightning Pipeline**: Consolidation of serialization, masking, and sanitization into a single recursive pass, reaching Pino-level efficiency with Enterprise-level security.

> [!WARNING]
> **Pathological Object Protection**: When an object exceeds the configured Depth or Breadth, it will be automatically truncated (e.g., `[Max Depth reached]` or `[Truncated 500 items]`). This is a feature, not a bug — it ensures your application survives even when buggy code tries to log half the database!

---

## 📊 Performance Benchmarks

Tested with **2,000,000 logs** on Node.js 20+ (Nulled I/O).

| Library | Throughput | Avg Latency | Notes |
| :--- | :--- | :--- | :--- |
| **Pino** | ~4.1M ops/s | 0.24 µs | Fastest, no masking by default |
| **SyntropyLog v0.10.1** | **~980k ops/s** | **1.02 µs** | **Secure-by-default (Masking + Context)** |
| **Console.log** | ~1.2M ops/s | 0.83 µs | Baseline Node.js performance |
| **Winston** | ~175k ops/s | 5.70 µs | Traditional legacy logger |

> SyntropyLog is **5.5x faster than Winston** and only ~20% slower than pure console while providing deep-object masking and context management.

To compare native addon vs JS-only pipeline: run `pnpm run bench` (with addon) and `SYNTROPYLOG_NATIVE_DISABLE=1 pnpm run bench` (JS only). The benchmark reports "native addon (Rust): yes/no" at startup.

---

## 🚀 Quick Start (60 seconds)

### **1. Install**
```bash
npm install syntropylog
```

For the best performance, the package includes **prebuilt native addon binaries (Rust)** for Linux, Windows, and macOS; they install automatically on supported platforms. If the addon is unavailable (e.g. unsupported Node version or platform), the framework falls back to the JS pipeline transparently.

### **Available Console Transports**

By default, SyntropyLog outputs **lightweight plain JSON to the console — automatically, with no configuration needed**. No imports, no setup, no extra dependencies.

If you want **colored, human-readable output** for development, use one of the pretty console transports. Colours use **built-in ANSI codes** (no chalk or extra dependency). When stdout is a TTY you get colours; when piping or in CI, or if `NO_COLOR` is set, the same format is shown in plain text.

| Transport | Style | Recommended for |
| :--- | :--- | :--- |
| *(default)* | Plain JSON | Production / log aggregators |
| `ClassicConsoleTransport` | Structured single-line, colored | Development |
| `PrettyConsoleTransport` | Human-readable pretty, colored | Development / debugging |
| `CompactConsoleTransport` | Compact one-liner, colored | Development |
| `ColorfulConsoleTransport` | Full-line colored | Development |

```typescript
// Default — no import needed, works out of the box
syntropyLog.init({ logger: { level: 'info', serviceName: 'my-app' } });

// Pretty + colors (built-in ANSI; no extra deps)
import { ClassicConsoleTransport } from 'syntropylog';

syntropyLog.init({
  logger: {
    level: 'info',
    serviceName: 'my-app',
    transports: [new ClassicConsoleTransport()],
  },
});
```

### **Transport pool and per-environment routing**

You can define a **named pool of transports** (`transportList`) and choose **per environment** which ones are active (`env`). For a single log call you can override, add, or remove destinations with `.override()`, `.add()`, and `.remove()`.

```typescript
import { syntropyLog, ColorfulConsoleTransport, AdapterTransport, UniversalAdapter } from 'syntropylog';

const mockToConsole = (label: string) =>
  new AdapterTransport({
    name: label,
    adapter: new UniversalAdapter({
      executor: (data) => console.log(`[${label}]`, JSON.stringify(data)),
    }),
  });

await syntropyLog.init({
  logger: {
    envKey: 'NODE_ENV',
    transportList: {
      consola: new ColorfulConsoleTransport({ name: 'consola' }),
      db: mockToConsole('db'),
      azure: mockToConsole('azure'),
      archivo: mockToConsole('archivo'),
    },
    env: {
      development: ['consola'],
      staging: ['consola', 'archivo', 'azure'],
      production: ['consola', 'db', 'azure'],
    },
  },
  redis: { instances: [] },
});

const log = syntropyLog.getLogger('app');
log.info('default according to env');
log.override('consola').info('only to console');
log.remove('db').add('archivo').info('default minus db, plus file');
```

**Full guide and runnable example:** see [examples/TRANSPORT_POOL_AND_ENV.md](examples/TRANSPORT_POOL_AND_ENV.md) and run `examples/TransportPoolExample.ts` to see it in action.

---

```typescript
import { syntropyLog } from 'syntropylog';
import { ClassicConsoleTransport } from 'syntropylog';

const config = {
  logger: {
    level: 'info',
    serviceName: 'ecommerce-app',
    transports: [new ClassicConsoleTransport()],
  },
  context: {
    correlationIdHeader: 'X-Correlation-ID', // defines the header name used everywhere
  },
};

// Always wait for the 'ready' event — see the Critical section below
async function initializeSyntropyLog() {
  return new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', (err) => reject(err));
    syntropyLog.init(config);
  });
}

await initializeSyntropyLog();

// Safe to use from here on
const logger = syntropyLog.getLogger();
logger.info('System is clean and ready.');
```

### **Optional error and fallback hooks**

You can pass optional callbacks in the config for observability (logging never throws; these hooks let you observe failures):

| Hook | When it is called |
|------|--------------------|
| `onLogFailure?(error, entry)` | When a log call fails (serialization or transport error). |
| `onTransportError?(error, context)` | When a transport fails (flush, shutdown, or log write). `context` is `'flush'`, `'shutdown'`, or `'log'`. |
| `onSerializationFallback?(reason)` | When the native addon is used but fails for a call and the framework falls back to the JS pipeline. |
| `onStepError?(step, error)` | When a pipeline step fails (e.g. hygiene). |
| `masking.onMaskingError?(error)` | When masking fails (e.g. timeout); never receives raw payload. |

Use `onSerializationFallback` to detect when the native addon failed for a given call and the JS pipeline was used instead (e.g. for metrics or alerting). You can also call `syntropyLog.isNativeAddonInUse()` at runtime to check if the Rust addon is loaded.

Example: `syntropyLog.init({ onLogFailure: (err) => metrics.increment('log_failures'), ... });`

### **3. Graceful Shutdown (Essential)**
```typescript
async function gracefulShutdown() {
  await syntropyLog.shutdown();
}

process.on('SIGTERM', async () => { await gracefulShutdown(); process.exit(0); });
process.on('SIGINT',  async () => { await gracefulShutdown(); process.exit(0); });
```

---

## ⚠️ Critical: Await Initialization Before Use

> **SyntropyLog MUST be fully initialized before any call to `getLogger()`, `getRedis()`, or any other resource.** Calling these methods before initialization completes will silently produce a no-op logger that **drops all messages**.

### Why this matters

`syntropyLog.init()` bootstraps the internal pipeline, connects managed resources (Redis, brokers), and wires up serialization and masking layers asynchronously. Until the `ready` event fires, there is no active logger.

### ❌ Anti-pattern — fire-and-forget init

```typescript
syntropyLog.init(config); // ← not awaited

const logger = syntropyLog.getLogger();
logger.info('This message is silently dropped.'); // ← init not complete yet
```

### ✅ Correct pattern — event-based initialization

```typescript
async function initializeSyntropyLog() {
  return new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());  // ← wait for this
    syntropyLog.on('error', (err) => reject(err));
    syntropyLog.init(config);
  });
}

await initializeSyntropyLog(); // ← nothing runs before this resolves
const logger = syntropyLog.getLogger();
logger.info('System initialized and ready.');
```

### Framework entry points

| Framework | Bootstrap location |
| :--- | :--- |
| **Express / Fastify** | Call `await initializeSyntropyLog()` before `app.listen()` in `server.ts` / `main.ts` |
| **NestJS** | Inside `AppModule.onModuleInit()` or in `bootstrap()` before `app.listen()` |
| **Lambda / Serverless** | Module-level block (outside the handler), using a lazy singleton pattern |

---

## 🔗 Context: Automatic Correlation ID Propagation

> Context management is powered by Node.js `AsyncLocalStorage`. Context is **not global** — it only exists inside `contextManager.run()` blocks. In production, SyntropyLog's adapters create it automatically for every request.

### How it works

The `correlationIdHeader` you set in `context` config is the **single source of truth** — it's the header name read from incoming requests and propagated to all outgoing calls and logs.

```typescript
// Defined once in init()
context: {
  correlationIdHeader: 'X-Correlation-ID',
}
```

### The Context Wrapper

```typescript
// ❌ WITHOUT context — no correlationId in logs
logger.info('User logged in');

// ✅ WITH context — correlationId flows automatically to every log
await contextManager.run(async () => {
  logger.info('User logged in'); // correlationId attached automatically
});
```

### 🔮 The Magic Middleware (2 Lines of Code)

Add this **once** to your Express/Fastify app and never think about Correlation IDs again:

```typescript
app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    // 🎯 MAGIC: Just 2 lines!
    const correlationId = contextManager.getCorrelationId();             // Detects incoming or generates new
    contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId); // Sets in context

    next();
  });
});
```

Why this is marvelous:

- **Intelligent Detection**: `getCorrelationId()` uses the existing ID from the incoming request or generates a new one
- **Automatic Configuration**: `getCorrelationIdHeaderName()` reads your `context.correlationIdHeader` config — change it once, updated everywhere
- **Automatic Propagation**: Once set, it propagates to all logs and operations

### In Real Applications

In production, context is created automatically by SyntropyLog's built-in adapters (no manual `run()` needed):

- HTTP middleware (Express, Fastify, Koa)
- Message queue handlers (Kafka, RabbitMQ)
- Background job processors / API gateways

| Scenario | Pattern |
| :--- | :--- |
| **Examples & quick tests** | Wrap logging in `contextManager.run()` manually |
| **Production apps** | Use SyntropyLog's HTTP/broker adapters — context is automatic |

---

## 🎯 What Your Logs Look Like

The **Logging Matrix** lets you control exactly how much data appears per log level — lean on success, rich on failure:

**INFO (success path)** — minimal cost:
```
12:56:00 [INFO] (ecommerce-app): User request processed { status: 'completed', duration: '150ms' }
{ "userId": 123, "operation": "user-login" }
```

**ERROR (failure path)** — full context for debugging:
```
12:56:00 [ERROR] (ecommerce-app): User request processed { status: 'completed', duration: '150ms' }
{
  "userId": 123, "email": "user@example.com", "password": "***MASKED***",
  "firstName": "John", "ipAddress": "127.0.0.1",
  "sessionId": "sess-789", "requestId": "req-456"
}
```

> Same log call, different information per level. Success logs are lean and cheap; error logs have all the context you need to debug — with sensitive fields always masked.

---

## 📋 Logging Matrix — Declarative Field Control

The **Logging Matrix** is a JSON contract that defines *exactly* which context fields appear in each log level. It's lightweight, powerful, and provides a strong security guarantee: **if a field isn't in the matrix, it can't appear in the log output — no matter what's in the context.**

### Why this matters

Without it, any field stored in the `AsyncLocalStorage` context would flow into every log. With it, you have an explicit whitelist per level:

```typescript
await syntropyLog.init({
  logger: { ... },
  context: { ... },
  loggingMatrix: {
    // Always include these in every level (unless overridden below)
    default: ['correlationId'],

    // info: lean — just what you need to understand the happy path
    info:  ['correlationId', 'userId', 'operation'],

    // warn: a bit more context to understand what triggered the warning
    warn:  ['correlationId', 'userId', 'operation', 'errorCode'],

    // error/fatal: everything — full context to debug the failure
    error: ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId', 'orderId'],
    fatal: ['*'], // wildcard: include ALL context fields
  },
});
```

Available named fields mapped by the engine:

| Matrix key | Context key(s) it resolves |
| :--- | :--- |
| `correlationId` | `x-correlation-id`, `correlationId` |
| `transactionId` | `x-trace-id`, `transactionId` |
| `userId` | `userId` |
| `tenantId` | `tenantId` |
| `operation` | `operation` |
| `errorCode` | `errorCode` |
| `orderId` | `orderId` |
| `paymentId` | `paymentId` |
| `eventType` | `eventType` |
| `*` | All context fields (wildcard for `debug`/`fatal`) |

### 🔒 Injection Safety

The `SanitizationEngine` runs **before** any transport writes a log entry. It strips ANSI escape codes and control characters from every string value — making log injection attacks against terminal or SIEM viewers impossible.

Two-layer protection:
1. **Logging Matrix** — whitelist filter: only declared fields pass through
2. **SanitizationEngine** — strips control characters from string values before output

### Dynamic reconfiguration

The matrix can be updated at runtime **without restarting** your application. Useful for temporarily increasing verbosity in production:

```typescript
const { contextManager } = syntropyLog;

// Temporarily enable full context for debug investigation
contextManager.reconfigureLoggingMatrix({
  default: ['correlationId'],
  info:    ['correlationId', 'userId', 'operation'],
  error:   ['*'], // full context on errors
});

// Later, restore original config
contextManager.reconfigureLoggingMatrix(originalMatrix);
```

> **Security boundary**: `reconfigureLoggingMatrix()` only changes *which* context fields are visible — it cannot alter masking rules, transports, or any security configuration set at `init()` time.

---

## 🛡️ Data Masking

SyntropyLog ships with a **MaskingEngine** that automatically redacts sensitive fields in every log — before they ever reach a transport or database.

### Built-in strategies (enabled by default)

| Strategy | Matched field names (regex) | Example output |
| :--- | :--- | :--- |
| `PASSWORD` | `password`, `pass`, `pwd`, `secret` | `********` |
| `EMAIL` | `email` | `j***@example.com` |
| `TOKEN` | `token`, `api_key`, `auth_token`, `jwt`, `bearer` | `eyJh...a1B9c` |
| `CREDIT_CARD` | `credit_card`, `card_number`, `payment_number` | `****-****-****-1234` |
| `SSN` | `ssn`, `social_security`, `security_number` | `***-**-6789` |
| `PHONE` | `phone`, `phone_number`, `mobile_number` | `***-***-4567` |

### Configuration in `init()`

```typescript
import { MaskingStrategy } from 'syntropylog';

await syntropyLog.init({
  logger: { ... },
  context: { ... },
  masking: {
    // Default rules are ON — set to false to start from scratch
    enableDefaultRules: true,

    // Global mask character
    maskChar: '*',

    // Preserve original field length by default
    preserveLength: true,

    // Add your own rules on top of the defaults
    rules: [
      {
        // Mask any field whose name contains 'cuit' or 'cuil'
        pattern: /cuit|cuil/i,
        strategy: MaskingStrategy.CUSTOM,
        customMask: (value) => value.replace(/\d(?=\d{4})/g, '*'), // keep last 4 digits
      },
      {
        // Mask internal API keys
        pattern: /internal_key|service_secret/i,
        strategy: MaskingStrategy.TOKEN,
      },
    ],
  },
});
```

> **Silent Observer guarantee**: if the masking engine fails for any reason, it returns the original object and the application keeps running — it never throws.

**Performance**: Built-in rules use synchronous regex matching (safe, known patterns). Custom rules use the same synchronous engine for maximum speed.

> ⚠️ **Security Warning (Custom Rules)**
> Node.js regular expressions execute synchronously on the main thread. To prevent Event Loop blocking, SyntropyLog automatically skips evaluating any JSON keys longer than 256 characters. However, when writing **Custom Masking Rules**, it is your responsibility to write optimized, ReDoS-safe regular expressions. A catastrophic backtracking pattern in a custom rule could temporarily freeze your application if triggered by a specifically crafted payload.

---

## 💾 Universal Persistence — Log to Any Database

The `UniversalAdapter` lets you send structured logs to **any storage backend** (PostgreSQL, MongoDB, Elasticsearch, S3, etc.) by providing a single `executor` function. No coupling to any ORM or driver.

```typescript
import { UniversalAdapter } from 'syntropylog';
import { prisma } from './db'; // your Prisma client, Mongoose model, pg pool, etc.

const dbTransport = new UniversalAdapter({
  executor: async (logEntry) => {
    // logEntry is the fully-formed, masked log object
    await prisma.systemLog.create({
      data: {
        level:       logEntry.level,
        message:     logEntry.message,
        service:     logEntry.serviceName,
        correlationId: logEntry.correlationId,
        payload:     logEntry.meta,   // JSON column
        timestamp:   new Date(logEntry.timestamp),
      },
    });
  },
});

await syntropyLog.init({
  logger: {
    serviceName: 'ecommerce-app',
    transports: [new ClassicConsoleTransport(), dbTransport], // ← add alongside console
  },
  ...
});
```

### How the executor receives data

The `executor` receives a single structured object — already masked and serialized — with these fields:

| Field | Type | Description |
| :--- | :--- | :--- |
| `level` | `string` | Log level: `info`, `error`, etc. |
| `message` | `string` | The log message |
| `serviceName` | `string` | From your config |
| `correlationId` | `string` | From the active context |
| `timestamp` | `number` | Unix timestamp |
| `meta` | `object` | Any extra fields passed to the log call — already masked |

> **Silent Observer**: if your `executor` throws, SyntropyLog logs the error to console and continues — your app never crashes because of a log transport failure.

### 🔗 Fluent Logger API — Specialized Loggers

The `ILogger` interface provides **fluent builders** that create new, immutable child loggers with specific bindings attached. Every log call from that logger will carry those bindings automatically — no passing parameters around.

| Builder | What it binds | Typical use |
| :--- | :--- | :--- |
| `withSource('ModuleName')` | `source: 'ModuleName'` | Tag logs by module or component |
| `withTransactionId('txn-123')` | `transactionId: 'txn-123'` | Track a business transaction ID |
| `withRetention({ ...anyJson })` | `retention: { ...anyJson }` | Attach org-defined metadata to route logs |
| `child({ key: value })` | Any key-value pairs | General-purpose bindings |

All builders return a **new logger** — the original is never mutated.

#### `withRetention()` — Your JSON, Your Rules

`withRetention()` accepts **any JSON** object. SyntropyLog deep-clones it and attaches it as a `retention` field in every log entry — without reading or interpreting its contents. The meaning belongs entirely to your organization.

```typescript
const logger = syntropyLog.getLogger();

// Each logger carries the metadata your team defined
const complianceLogger = logger.withRetention({
  policy:    'GDPR_ARTICLE_17',
  years:     7,
  immutable: true,
  region:    'eu-west-1',
});

const auditLogger = logger.withRetention({
  policy: 'SOX_AUDIT_TRAIL',
  years:  5,
});

const debugLogger = logger.withRetention({
  policy: 'EPHEMERAL',
  days:   7,
  tier:   'hot',
});

// Combine with other fluent builders
const paymentAuditLogger = logger
  .withSource('PaymentService')
  .withRetention({ policy: 'PCI_DSS', years: 5 });
```

Use them anywhere in your application — the binding is already in every log:

```typescript
// In PaymentService.ts
complianceLogger.info({ userId: 123, action: 'data-export' }, 'GDPR event');

// In AuthModule.ts — completely independent, same pattern
auditLogger.warn({ userId: 456, action: 'login-failed' }, 'Security event');
```

Each entry arrives at the transport with `retention` ready to be acted upon:

```json
{
  "level":         "info",
  "message":       "GDPR event",
  "correlationId": "uuid-...",
  "source":        "PaymentService",
  "retention":     { "policy": "GDPR_ARTICLE_17", "years": 7, "immutable": true },
  "userId":        123,
  "action":        "data-export"
}
```

Your executor routes it — SyntropyLog has no opinion on the content:

```typescript
const dbTransport = new UniversalAdapter({
  executor: async (logEntry) => {
    const policy = logEntry.retention?.policy;

    const destination =
      policy === 'GDPR_ARTICLE_17' || policy === 'SOX_AUDIT_TRAIL' ? 'audit_logs'
      : policy === 'PCI_DSS'                                        ? 'payment_audit_logs'
      : policy === 'EPHEMERAL'                                      ? 'debug_logs'
      :                                                               'system_logs';

    await db[destination].insert(logEntry);
  },
});
```

> **The JSON is yours.** Field names, values, and interpretation belong entirely to your organization. `withRetention()` is just the mechanism to bind it once and have it travel with every log — automatically, safely, immutably.

---

## ✨ Key Capabilities

| Feature | Description |
| :--- | :--- |
| **Instance Management** | Register shared resources once, use them everywhere with confidence. |
| **Correlation Tracking** | Trace requests across multiple services and DBs automatically. |
| **Silent Observer** | If logging fails, your application keeps running perfectly. |
| **Universal Persistence** | Map logs to ANY database (SQL/NoSQL) with pure JSON mapping. |

---

---

---

## 🔒 Security & Compliance

| | Dynamically configurable | Immutable |
| :--- | :--- | :--- |
| ✅ **Safe to change** | Logging Matrix, Log Level, additive Masking Fields | — |
| 🔒 **Fixed at init** | — | Transports, core masking config (`maskChar`, `maxDepth`), Redis/HTTP/broker infrastructure |

---

## 📚 Documentation

- **[Improvement plan & roadmap](docs/code-improvement-analysis-and-plan.md)** — Code analysis, prioritized backlog, and phased work plan.
- **[Rust addon implementation plan](doc-es/rust-implementation-plan.md)** (ES) — Phased checklist to maximize use of the native addon (“Formula 1” path); links to [rust-pipeline-optimization.md](doc-es/rust-pipeline-optimization.md) for details.
- **Benchmarks** — Summary in the [Performance Benchmarks](#-performance-benchmarks) section above; run `pnpm run bench` or `pnpm run bench:memory` from the repo root. [Benchmark run report (throughput + memory + high-demand stack)](docs/benchmark-memory-run.md) (EN) · [Informe de ejecución (ES)](doc-es/benchmark-memory-run.md). With the optional Rust addon built (`cd syntropylog-native && pnpm run build`), the benchmark reports native addon usage.

---

## 🤝 Contributing & License

We love contributors! Check our [Contributing Guide](./CONTRIBUTING.md).
Project licensed under **Apache-2.0**.
