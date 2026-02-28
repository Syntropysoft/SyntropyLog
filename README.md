# SyntropyLog

<p align="center">
  <img src="./assets/beaconLog-2.png" alt="SyntropyLog Logo" width="170"/>
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
  <a href="#"><img src="https://img.shields.io/badge/coverage-85.67%25-brightgreen" alt="Test Coverage"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-v0.8.12-brightgreen.svg" alt="Version 0.8.12"></a>
</p>

---

## 🎯 What is SyntropyLog?

SyntropyLog is a **structured observability framework** for Node.js — built from scratch, designed around flexibility and control.

The core idea is simple: **you declare what your logs should carry, and SyntropyLog makes it happen everywhere, automatically.** No manual plumbing, no scattered configuration, no hidden behavior.

That means:
- A **declarative Logging Matrix** that controls exactly which context fields appear at each log level — lean on `info`, full context on `error`.
- A **fluent logger API** (`withRetention`, `withSource`, `withTransactionId`) that lets you create specialized loggers carrying arbitrary organization-defined metadata.
- A **MaskingEngine** that redacts sensitive fields before they reach any transport — built-in strategies and fully custom rules.
- A **UniversalAdapter** that routes logs to any backend (PostgreSQL, MongoDB, Elasticsearch, S3) via a single `executor` function — no coupling, no lock-in.
- A **SanitizationEngine** that strips control characters from all log output, preventing log injection attacks.

**This is not about performance benchmarks. It's about giving your team full declarative control over observability data — what flows, where it goes, and what it means.**

### Built for regulated industries

SyntropyLog was designed with the constraints of **banking, healthcare, and financial services** in mind:

- **Banking Traceability**: Every financial operation — payment, transfer, authorization — carries a `correlationId` that propagates automatically across every service, database call, and message broker it touches. End-to-end traceability with zero manual plumbing. Regulators call for it; SyntropyLog makes it automatic.
- **GDPR / LGPD**: Automatic PII masking with configurable retention metadata per logger.
- **SOX**: Immutable audit trail via `withRetention` bindings and dedicated transports.
- **PCI-DSS**: Card data never reaches a transport — masked at the engine level before serialization.
- **HIPAA**: Field-level control over what appears in logs at each severity level via the Logging Matrix.

---

## 🚀 Quick Start (60 seconds)

### **1. Install**
```bash
npm install syntropylog
```

### **2. Configure & Initialize**

```typescript
import { syntropyLog } from 'syntropylog';
import { ClassicConsoleTransport } from 'syntropylog/transports';

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
  "firstName": "John", "ipAddress": "192.168.1.1",
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

## 📚 Learn More

SyntropyLog goes deep. Explore our specialized guides:

| | Guide | Description |
| :--- | :--- | :--- |
| 🔧 | [Master Configuration](./docs/configuration.md) | Every option explained: `loggingMatrix`, `serializers`, masking, context. |
| 💾 | [Universal Persistence](./docs/persistence.md) | Map logs to any DB (SQL/NoSQL) with pure JSON, zero dependencies. |
| 🧬 | [Serialization & Formatting](./docs/serialization.md) | Custom serializers, timeouts, and the Silent Observer guard. |
| ⚙️ | [Middleware & Frameworks](./docs/middleware.md) | Integration patterns for Express, NestJS, Fastify, and Koa. |
| 🏢 | [Enterprise Patterns](./docs/enterprise.md) | Scalable architectures, ELK, Kubernetes, and compliance. |
| 🧪 | [Testing Strategy](./docs/testing.md) | Zero-boilerplate mocking with `SyntropyLogMock`. |
| 🎭 | [Core Philosophy](./docs/philosophy.md) | The "Silent Observer" principle and error handling strategy. |
| 📦 | [Examples](https://github.com/Syntropysoft/syntropylog-examples) | Real integrations with Express, Redis, Kafka, and more. |

---

## 🔒 Security & Compliance

| | Dynamically configurable | Immutable |
| :--- | :--- | :--- |
| ✅ **Safe to change** | Logging Matrix, Log Level, additive Masking Fields | — |
| 🔒 **Fixed at init** | — | Transports, core masking config (`maskChar`, `maxDepth`), Redis/HTTP/broker infrastructure |

**Compliance Guarantee**: Sensitive data stays masked regardless of dynamic changes. All security configurations are locked at init — zero risk of accidental PII exposure. **100% Open Source**, no hidden telemetry or tracking.

---

## 🤝 Contributing & License

We love contributors! Check our [Contributing Guide](./CONTRIBUTING.md).
Project licensed under **Apache-2.0**.
