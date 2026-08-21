# Migrating from Pino

A practical, no-marketing guide for teams already running Pino who want to evaluate SyntropyLog. The goal here is **what changes** and **how to make the change small** — not why one is "better".

If you're hitting one of these specifically — compliance reviews that require auditable log shape per level, retention-policy-based routing, masking that's not "best effort", or audit logs you legally can't lose — SyntropyLog was built for that. If you're not, Pino is a great fit and there's no reason to switch.

---

## Mental model — what stays, what changes

| Concept | Pino | SyntropyLog |
|---|---|---|
| Logger creation | `pino()` returns a logger | `syntropyLog.getLogger()` returns an `ILogger` (after `init()` resolved) |
| Child loggers | `parent.child({ k: v })` | `parent.child({ k: v })` — same |
| Levels | `info`, `warn`, `error`, `fatal`, `trace`, `debug` | Same, plus `audit` (always emitted, bypasses minimum level) |
| Argument order | `logger.info({ obj }, 'msg')` | `logger.info({ obj }, 'msg')` — same |
| Async context | None built-in (Pino has nothing) | First-class via `contextManager` + `AsyncLocalStorage` |
| Sensitive-data masking | `redact` option, string-paths | Declarative rule set; default rules + custom; never throws |
| Transports | Worker thread streams | One `executor` function → any backend ([docs/transports.md](transports.md)) |
| What appears at each level | Up to the caller | Declarative `loggingMatrix` whitelist ([docs/logging-matrix.md](logging-matrix.md)) |
| Compliance metadata | DIY | `withRetention('SOX_AUDIT_TRAIL')` + registry ([docs/fluent-api.md](fluent-api.md)) |

The two pieces of code below produce equivalent output for the **default** case. Everything else this doc shows is "what you can also do once you've switched".

---

## Side-by-side: the minimal app

**Pino:**

```typescript
import pino from 'pino';

const logger = pino({ name: 'my-app', level: 'info' });

logger.info({ userId: 123 }, 'User signed in');
```

**SyntropyLog:**

```typescript
import { syntropyLog } from 'syntropylog';

await syntropyLog.init({
  logger: { serviceName: 'my-app', level: 'info' },
});

const logger = syntropyLog.getLogger();
logger.info({ userId: 123 }, 'User signed in');
```

The one new thing is `await init()` at startup. After that the call sites read identically.

---

## Side-by-side: correlation in a request

**Pino** (most teams thread `correlationId` manually or pair Pino with a separate `cls-hooked` / `als-context` library):

```typescript
import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage<{ correlationId: string }>();
const base = pino({ name: 'my-app' });

app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] ?? crypto.randomUUID();
  als.run({ correlationId }, () => next());
});

// At log sites, you have to read the store yourself:
app.get('/me', (req, res) => {
  const { correlationId } = als.getStore() ?? {};
  base.child({ correlationId }).info('GET /me');
});
```

**SyntropyLog** (one middleware, every log inside the request scope already carries the ID):

```typescript
import { syntropyLog, correlationIdMiddleware } from 'syntropylog';

await syntropyLog.init({
  logger: { serviceName: 'my-app' },
  loggingMatrix: { default: ['correlationId'] },
});

app.use(correlationIdMiddleware());

app.get('/me', (req, res) => {
  syntropyLog.getLogger().info('GET /me');   // correlationId is attached
});
```

The middleware handles multi-header resolution (`x-trace-id` / `x-correlation-id` / `x-request-id` / W3C `traceparent`), echoes the ID onto the response, and keeps the AsyncLocalStorage scope alive until the response closes. See [docs/context.md](context.md).

For Fastify, swap `correlationIdMiddleware()` for `fastifyCorrelationHook()` mounted as an `onRequest` hook.

---

## Side-by-side: redaction → masking

**Pino:**

```typescript
import pino from 'pino';

const logger = pino({
  redact: {
    paths: ['req.headers.authorization', '*.password', 'user.email'],
    censor: '[REDACTED]',
  },
});
```

**SyntropyLog:**

```typescript
import { syntropyLog, MaskingStrategy } from 'syntropylog';

await syntropyLog.init({
  logger: { serviceName: 'my-app' },
  masking: {
    enableDefaultRules: true,   // password, email, token, card, SSN, phone stay on
    rules: [
      { pattern: /myCustomKey/i, strategy: MaskingStrategy.PASSWORD },
    ],
  },
});
```

Differences worth knowing:

- Masking runs **before** any transport, on a deep walk — you don't have to enumerate paths.
- Explosive custom rule patterns (nested unbounded quantifiers) are **rejected at init** with a `TypeError` — V8 cannot interrupt a running regex, so the defense is static, not a runtime timeout.
- If masking fails, the framework does not throw — the entry is dropped from the failed transport but logging keeps working. Failures surface via `onMaskingError` and the `failures.masking` counter in `getStats()`.

See [docs/masking.md](masking.md).

---

## Side-by-side: levels and what they carry

**Pino:** the call site decides what fields to log. There's no declarative contract; reviewing what an `info` log can contain means reading every `logger.info(...)` site.

**SyntropyLog:** the `loggingMatrix` is the contract. Different levels can carry different subsets of context; the rest is filtered out at emit time, not at the transport.

```typescript
import { syntropyLog, defineMatrix } from 'syntropylog';

const loggingMatrix = defineMatrix(
  ['correlationId', 'userId', 'tenantId', 'operation', 'errorCode'] as const,
  {
    default: ['correlationId'],
    info:    ['correlationId', 'userId', 'operation'],
    error:   ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId'],
    fatal:   ['*'],
  },
);

await syntropyLog.init({
  logger: { serviceName: 'my-app' },
  loggingMatrix,
});
```

`defineMatrix` is the typed builder — typos in the per-level arrays become compile errors. See [docs/logging-matrix.md](logging-matrix.md).

---

## Side-by-side: shipping logs somewhere other than stdout

**Pino** uses transport processes (`pino.transport({ target: 'pino-pretty', ... })`) running in worker threads.

**SyntropyLog** uses the **Universal Adapter** — a single `executor` function that you write, given the (already-masked, already-matrix-filtered) entry:

```typescript
import { AdapterTransport, UniversalAdapter } from 'syntropylog';

const dbTransport = new AdapterTransport({
  name: 'db',
  adapter: new UniversalAdapter({
    executor: async (entry: any) => {
      await prisma.systemLog.create({ data: { ... } });
    },
  }),
});

await syntropyLog.init({
  logger: {
    serviceName: 'my-app',
    transports: [dbTransport],
  },
});
```

You can mix multiple transports, route per-call with `.override()` / `.add()` / `.remove()`, and pin per-environment defaults (`transportList` + `env`). See [docs/transports.md](transports.md).

---

## Side-by-side: graceful shutdown

**Pino** uses `process.on('SIGTERM', ...)` plus `pino.final(logger)` or the transport's own drain.

**SyntropyLog:**

```typescript
process.on('SIGTERM', async () => {
  await syntropyLog.shutdown();    // waits for in-flight logs and transport drain
  process.exit(0);
});
process.on('SIGINT', async () => {
  await syntropyLog.shutdown();
  process.exit(0);
});
```

`shutdown()` flushes the pipeline and closes transports in order. See [docs/lifecycle.md](lifecycle.md).

---

## Gotchas when switching

- **`await init()` is required before `getLogger()`.** Pino is sync; SyntropyLog has a real init phase (it builds the masking engine, validates config, wires transports). Forgetting to await it gives you a no-op logger that silently drops messages.

- **Per-instance vs singleton.** `syntropyLog` is the singleton. For tests, multi-tenant, or any "two SyntropyLogs in one process" case, use `createSyntropyLog()` instead — it produces an `ISyntropyLog` instance that shares no state with the singleton. See [docs/lifecycle.md](lifecycle.md).

- **`fatal` does NOT exit the process.** Pino's default config doesn't either, but some teams add `pino.final()` flows that do. In SyntropyLog you decide — register a handler for the `fatal` log if you need exit-on-fatal behavior.

- **Transports are written, not configured.** Where Pino takes `target: 'pino-pretty'`, SyntropyLog takes a `Transport` instance you constructed. The trade-off: more lines for the simple cases, full control for the non-simple ones.

---

## Category comparison — what the framework does for you

Pino and Winston are excellent, fast **loggers**. SyntropyLog is a different category — an **observability pipeline** that does *in the framework* what a logger leaves to you, and runs the heavy work in a native engine:

| | Pino / Winston | SyntropyLog |
|---|---|---|
| **Category** | logger | observability pipeline (matrix → masking → sanitization → serialization → routing) |
| **PII masking** | Pino: `redact` paths in JS (fast-redact); Winston: bring your own | built in, by field name, in a **native Rust pass** (declarative `MaskSpec`) |
| **Correlation IDs** | you thread them, per service | automatic via `AsyncLocalStorage`, declared once |
| **Per-level field control** | manual | declarative **Logging Matrix** |
| **Retention / audit routing** | DIY | first-class — `withRetention('NAME')` puts the retention class and its window on the entry, plus a delivery-guaranteed durable transport (optionally restart-surviving) |
| **If logging throws** | can bubble into your code | **Silent Observer** — logging never throws, can't crash your app |
| **Engine** | JS | native **Rust** (serialize + mask + sanitize in one pass), transparent JS fallback |

**On speed — honestly:** the only apples-to-apples comparison is *minimal logging* (plain JSON, no masking), and there SyntropyLog is competitive — fastest on M2, competitive on x64 (CI-noisy). Above that they aren't comparable: Pino/Winston don't mask, correlate or filter, so their numbers are a no-masking reference, not a race. Decomposition shows most of the full-pipeline cost is the Rust engine doing the actual masking work — the framework layer itself is nearly free. Numbers, machines and method: [benchmark report](benchmark-report.md).

### And "Pino + OpenTelemetry"?

Different layers — **they compose, they don't compete.** Pino is the logger; OpenTelemetry is the transport and instrumentation *standard* for telemetry (traces, metrics, logs). Neither governs the **content** of a log: which fields get masked, what context each level may emit, what retention an audit event carries, how correlation crosses HTTP and a message broker. That governance layer is what SyntropyLog is — the part you would otherwise hand-roll on top of Pino, in every service. SyntropyLog is **not an APM** and does not replace traces or metrics; its logs can flow *out through* OTel (a formatter + executor, with per-call routing — [opentelemetry-integration.md](opentelemetry-integration.md)), and the correlation middleware understands `traceparent`, so it sits comfortably next to OTel tracing.

Rule of thumb: choose Pino + OTel alone when PII, audit and retention are thin requirements you can afford to hand-roll. Choose SyntropyLog when they are first-class — and keep OTel for traces either way.

---

## What Pino does that SyntropyLog does NOT

- **Streaming transports in worker threads.** Pino's headline performance number comes from offloading transport work to a worker. SyntropyLog stays in-process. If your bottleneck is log throughput in a CPU-bound system, measure carefully before switching.

- **The `pino-pretty` CLI ecosystem.** SyntropyLog has built-in console transports (`Classic`, `Pretty`, `Compact`, `Colorful`) but they're library-only — not a CLI you pipe into.

- **Lots of years of community plugins.** Pino has a deep ecosystem (request loggers per framework, GELF transports, etc.). SyntropyLog ships the framework-agnostic resolver plus Express + Fastify adapters today; everything else you build yourself or wait for the ecosystem to mature.

If those are load-bearing for you, stay on Pino. The decision should be driven by what your system actually needs, not by a feature comparison.
