<p align="center">
  <img src="https://syntropysoft.com/syntropylog-logo.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>The observability framework for Node.js — powered by a native Rust engine.</strong>
  <br />
  Correlation IDs, PII masking, per-level field control and retention — declared <strong>once</strong> and enforced on every log, serialized + masked + sanitized in a single <strong>native Rust pass</strong> (with a transparent pure-JS fallback). <strong>Failsafe by design:</strong> logging can never crash your app — and audit entries can survive backend outages <strong>and process restarts</strong> (opt-in disk spool).
  <br /><br />
  <strong>Zero runtime dependencies</strong> and <strong>backend-agnostic</strong>: one <code>executor</code> function sends entries to Postgres, Elasticsearch, S3, an OTLP collector or anything else — no client libraries in the core. It <strong>composes with OpenTelemetry</strong> rather than replacing it.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml"><img src="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml/badge.svg" alt="CI Status"></a>
  <a href="https://codecov.io/gh/Syntropysoft/SyntropyLog"><img src="https://codecov.io/gh/Syntropysoft/SyntropyLog/branch/main/graph/badge.svg" alt="Test Coverage"></a>
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog?label=version&color=blue" alt="Version"></a>
  <a href="https://socket.dev/npm/package/syntropylog"><img src="https://socket.dev/api/badge/npm/package/syntropylog" alt="Socket Badge"></a>
</p>

---

## At a glance

| | |
|---|---|
| **Runtime** | Node.js **>= 22** · ESM + CJS · TypeScript types included |
| **Install** | `npm install syntropylog` — **zero runtime dependencies**. The Rust addon is an *optional* dependency; without it the pure-JS pipeline runs, with identical output |
| **HTTP frameworks** | Express (`correlationIdMiddleware`), Fastify (`fastifyCorrelationHook`), NestJS (`syntropylog/nestjs`). For anything else — Koa, Hono, a bare server — the resolver is framework-agnostic |
| **Destinations** | Any. You write a one-function `executor`; the framework stays independent of client-library versions |
| **Propagation** | One correlation-id across processes. Per-target wire-name maps (`outbound: { http, kafka, … }`) + `getPropagationHeaders(target)`, so services need not agree on header names |
| **Interop** | Composes with OpenTelemetry: W3C `traceparent` understood on the way in, OTLP export on the way out |
| **Testing** | `syntropylog/testing` — `SpyTransport`, mocks and helpers, so assertions run without a live backend |
| **Self-observability** | `getStats()` — failure counters, fallbacks, uptime, native-addon state |
| **Bundle** | `sideEffects: false`, tree-shakeable |
| **Other runtimes** | Same model, built idiomatically per platform: **.NET** → [sl4n](https://www.nuget.org/packages/sl4n/) on `Microsoft.Extensions.Logging` · **Python** → [slpy](https://pypi.org/project/slpy-log/) on `contextvars`/asyncio, with its own optional Rust masking engine |
| **License** | Apache-2.0 |

---

## Install

```bash
npm install syntropylog
```

```typescript
import { syntropyLog } from 'syntropylog';

// Configure once — this is all you need.
await syntropyLog.init({ logger: { serviceName: 'payments' } });

// Log an object. Sensitive fields are masked before any transport sees them.
syntropyLog.getLogger().info({ email: 'real@x.com', password: 'hunter2' }, 'payment ok');
```

```json
{"email":"r***@x.com","level":"info","message":"payment ok","password":"[REDACTED]","service":"payments","timestamp":"2026-06-14T13:11:48.060+00:00"}
```

That is default behavior, not magic — and it is identical under the native Rust engine and the
pure-JS fallback. Everything below is what you can then declare: which fields each level emits,
where logs go, how context crosses services, what retention class an audit record carries.

> **Masking is by field name.** A field whose *key* matches a rule is masked. Anything without a
> known key — array elements, or text you concatenate into the message — passes through untouched.
> Pass sensitive data as keyed fields (`log.info({ email }, 'msg')`), not as message text. Masking
> enforces your rules on keyed fields; it cannot find PII you hide in prose.

New in this release: [CHANGELOG.md](CHANGELOG.md). Bigger picture and a full example:
[docs/getting-started.md](docs/getting-started.md).

---

## Where it sits next to Pino, Winston and OpenTelemetry

Pino and Winston are fast **loggers**; OpenTelemetry is the **transport and instrumentation
standard** for telemetry. Neither governs the *content* of a log — which fields get masked, what
context each level may emit, what retention class an audit event carries, how correlation crosses
HTTP and a broker. That governance layer is what SyntropyLog is, and it **composes** with the other
two: its logs can flow out through OTel, and the correlation middleware understands `traceparent`.

Choose Pino + OTel alone when PII, audit and retention are thin requirements you can afford to
hand-roll. Choose SyntropyLog when they are first-class — and keep OTel for traces either way.

Feature-by-feature comparison, benchmark method and a migration path:
[docs/migration-from-pino.md](docs/migration-from-pino.md) ·
[docs/opentelemetry-integration.md](docs/opentelemetry-integration.md)

---
---

## Five things a logger doesn't do

This is where SyntropyLog earns its place. Each one is a mechanism, not a feature bullet — and each
carries a subtlety that only shows up in production.

### 1. One correlation-id that survives a broker and a language boundary

Inside a process, context rides `AsyncLocalStorage`, so it reaches every log in scope without being
threaded through function signatures. Across processes it travels through **wire-name maps you
declare per target**:

```typescript
// { contextField: wireName } per target — the same id, named per the convention of each hop
context: {
  outbound: {
    http:  { correlationId: 'x-correlation-id', tenantId: 'x-tenant-id' },
    kafka: { correlationId: 'correlationId',    tenantId: 'tenantId'    },
  },
}

contextManager.getPropagationHeaders('kafka')  // → { correlationId: '…', tenantId: '…' }
```

The point is that services **do not have to agree on header names**. Each declares its own, and the
maps translate — which is what makes the id survive a hop into a system you do not control. Inbound,
`correlationIdMiddleware` / `fastifyCorrelationHook` accept a configurable list of headers plus W3C
`traceparent`.

Example [`22-distributed-orders-kafka`](https://github.com/Syntropysoft/syntropylog-examples/tree/main/22-distributed-orders-kafka)
threads **one** id through Express → NestJS → Kafka → a Python service → a worker: seven services,
a message broker and a language boundary, with the card number and CVV masked the whole way.
→ [context.md](docs/context.md)

### 2. Field control that is a whitelist, not a convention

The **Logging Matrix** declares, per level, which context fields may be emitted. A field absent from
that level's list *never reaches a transport* — it is not filtered downstream, it is not there.
`error` can take `['*']` while `info` takes `['correlationId']`, so a debug field cannot leak into
production logs because somebody forgot to remove it. → [logging-matrix.md](docs/logging-matrix.md)

### 3. Masking that one sink is allowed to opt out of

Masking runs **once**, before the transport loop, so every sink receives the same obfuscated entry.
That is right for consoles and APMs and wrong for exactly one: the audit journal, where `2*****9`
proves nothing. `masking.exemptTransports` names the sinks that get the truth — declared in *your*
config, never by a transport about itself, and an unknown name fails loud at `init()` rather than
silently masking the one sink that had to hold evidence. With the native engine on, the masked and
the unmasked rendering come out of a **single** parse (`fastSerializeFromJsonDual`), so an app with
no exempt transport pays nothing for the feature existing.

Two things worth knowing before writing a rule: masking is keyed on the **field name**, and
`masking.regexTimeoutMs` is **inert** — V8 cannot interrupt a running regex, so explosive patterns
are rejected statically at `init()` instead of being timed out at runtime. The library says so
instead of implying a guarantee it cannot keep. → [masking.md](docs/masking.md)

### 4. Retention as a bridge, not a payload

Retention is *decided* per record — only the application can tell a payment authorization from a
health check — and *enforced* per container: an index, a stream, a bucket. Those two facts live in
different places, and the log entry is the bridge.

`withRetention('OPERACIONES')` puts the **class name** on the entry: always a string, because every
mechanism downstream (a Loki label matcher, a Datadog index filter, sink routing) matches on a
low-cardinality string, and a field that is a string on some entries and an object on others is a
mapping conflict at ingest. Alongside it travels `retentionUntil`, the end of the mandatory window,
materialized so a sweep is a range scan instead of a policy interpretation.

An in-process consumer needs nothing else: it resolves the name at write time with
`getRetentionPolicy(name)` against the same frozen registry (`getRetentionPolicies()` lists it). A
consumer **out of process** — a shipper reading JSON, with no registry to resolve against — can have
the full rules travel on the entry with `retention: { emitRules: true, version: 'E6-1' }`; off by
default, and the version stamp is what lets a persisted record say which revision it was filed under.

The details are the point: `retentionUntil` is **not an expiry** — reaching it ends the obligation,
it does not authorize deletion. A leap-day record lands on 1-Mar, kept one day longer, never one day
short, because ending a window early is the failure an auditor punishes. And a policy without whole
`years` gets `null` rather than a guessed date in a compliance column.
→ [compliance.md](docs/compliance.md) · [DESIGN-retention-bridge.md](docs/DESIGN-retention-bridge.md)

### 5. Logging that cannot take your process down

A transport that throws, a serializer that exceeds its timeout, a circular reference, a native addon
that fails to load — none of them reach your call site. Failures surface through hooks
(`onLogFailure`, `onTransportError`, `onStepError`, `onSerializationFallback`) and through
`getStats()` counters, so a silent degradation is still observable.

For audit entries that must not be lost, `DurableAdapterTransport` adds buffer, exponential-backoff
retry and a dead-letter queue — and with an opt-in `persistPath`, survives process restarts.

The Rust addon belongs to this same contract by *not* being part of it: it is a performance
optimization, never a behavioral one. Output is identical to the JS pipeline, which is what runs on
any platform without a prebuilt binary. → [lifecycle.md](docs/lifecycle.md) ·
[native-addon.md](docs/native-addon.md)

---

## What SyntropyLog is not

It is a structured-logging and context-propagation framework. It is **not** a log aggregation backend (use Elasticsearch / Loki / CloudWatch), a distributed-tracing system (use OpenTelemetry — see the integration guide), or a metrics collector (use Prometheus / Datadog). It is the component that makes every log line **correct, consistent, and safe before it reaches any of those systems**.

---

## Security & supply chain

- **No network I/O at runtime.** The framework contacts no external URLs; the only output is what your transports produce.
- **Zero runtime dependencies** (`dependencies: {}`). The optional native addon is built from auditable Rust source in the same repo — no opaque prebuilt binaries; transparent JS fallback.
- **No environment sniffing** — configuration is passed to `init()`; the package reads no env vars on its own.
- **Hardened pipeline:** prototype-pollution guard (`__proto__`/`constructor`/`prototype` stripped at every depth), ReDoS-safe masking (explosive patterns rejected at init — no runtime timeout is possible in JS, so none is claimed), Silent Observer (logging never throws).
- **Supply chain:** all devDeps pinned to exact versions, `pnpm.overrides` verified, NPM provenance signing on publish; `pnpm audit` reports 0 vulnerabilities.

Full details: [SECURITY.md](./SECURITY.md).

---

## What's in the box

| Feature | One-liner | Docs |
|---|---|---|
| **Logging Matrix** | Whitelist of context fields per level; `defineMatrix()` for typed keys | [logging-matrix.md](docs/logging-matrix.md) |
| **MaskingEngine** | Redact PII before transport; `getDefaultMaskingRules`, `maskEnum`, ReDoS-safe; `exemptTransports` gives one sink the unmasked truth | [masking.md](docs/masking.md) |
| **Universal Adapter** | One `executor` → any backend; framework stays agnostic | [transports.md](docs/transports.md) |
| **DurableAdapterTransport** | Buffer + backoff retry + DLQ; delivery guarantees for retention-tagged audit entries; opt-in `persistPath` disk spool survives restarts | [compliance.md](docs/compliance.md) |
| **Transport pool & per-env routing** | `transportList` + `env`; per-call `override`/`add`/`remove` | [transports.md](docs/transports.md) |
| **Fluent API** | `child`, `withSource`, `withTransactionId`, `withMeta`, `withRetention`; `defineRetentionPolicies()` registry | [fluent-api.md](docs/fluent-api.md) |
| **Context propagation** | Correlation + transaction IDs via `AsyncLocalStorage`; inbound/outbound wire-name translation | [context.md](docs/context.md) |
| **Express / Fastify** | `correlationIdMiddleware()` / `fastifyCorrelationHook()` — multi-header + W3C `traceparent` + response echo | [context.md](docs/context.md) |
| **NestJS module** | `syntropylog/nestjs`: `SyntropyLogModule`, `SyntropyNestLoggerService`, `@InjectLogger()` | [nestjs.md](docs/nestjs.md) |
| **Retention bridge** | Always-on `audit` level; `withRetention('NAME')` puts the class name + `retentionUntil` on the entry; `getRetentionPolicy` / `getRetentionUntil` for write paths without a logger | [DESIGN-retention-bridge.md](docs/DESIGN-retention-bridge.md) |
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

- **[Getting started](docs/getting-started.md)** — the declarative shift, side by side, with a full example
- **[Logging Matrix](docs/logging-matrix.md)** · **[Compliance routing](docs/compliance.md)** · **[Masking](docs/masking.md)** · **[Transports](docs/transports.md)** · **[Context](docs/context.md)** · **[Fluent API](docs/fluent-api.md)** · **[Lifecycle & hooks](docs/lifecycle.md)** · **[Runtime reconfiguration](docs/runtime-reconfiguration.md)** · **[Testing & mocks](docs/testing-mocks.md)** · **[NestJS](docs/nestjs.md)**
- **[Native addon (Rust)](docs/native-addon.md)** · **[Building it from source](docs/building-native-addon.md)** · **[OpenTelemetry](docs/opentelemetry-integration.md)** · **[Stability & compatibility](docs/stability.md)**
- **[Migrating from Pino](docs/migration-from-pino.md)** — practical side-by-side
- **[Benchmark report (throughput + memory)](docs/benchmark-report.md)** — SyntropyLog vs Pino vs Winston, three machines
- **[Examples repository](https://github.com/Syntropysoft/syntropylog-examples)** — 23 runnable examples (`00`–`22`): fundamentals (`00`–`09`), integration (`10`–`12`), testing (`13`–`16`), benchmark (`17`), compliance & observability (`18` durable transport, `19` retention policies, `20` getStats, `21` correlation middleware)
- **[`22-distributed-orders-kafka`](https://github.com/Syntropysoft/syntropylog-examples/tree/main/22-distributed-orders-kafka)** — the end-to-end one: seven services, Express + NestJS + a Python service + a worker, HTTP **and** Kafka, one correlation-id and one distributed trace across all of it, with a live dashboard. Also the example that surfaced the bugs in [KNOWN-ISSUES.md](KNOWN-ISSUES.md) — a single-process demo never exercises these paths
- **[sl4n — SyntropyLog for .NET](https://www.nuget.org/packages/sl4n/)** — the same declarative model (Logging Matrix, field-name masking, retention, durable delivery) built on `Microsoft.Extensions.Logging` for .NET 8+
- **[slpy — SyntropyLog for Python](https://pypi.org/project/slpy-log/)** — the same declarative model on `contextvars`/asyncio for Python 3.7+, with FastAPI middleware and its own optional Rust masking engine (`pip install slpy-log`)
- **[Documentación en Español](doc-es/caracteristicas-y-ejemplos.md)**

```bash
cd 00-setup-initialization && npm install && npm run dev
```

---

## Contributing & License

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md). License: **Apache-2.0**.
