# Context Propagation

A "context" is the per-request bag of identifiers and metadata that every log inside that request should carry — correlation ID, transaction ID, tenant ID, user ID, etc. SyntropyLog uses Node's `AsyncLocalStorage` under the hood, so you bind once at the request boundary and every nested log call picks up the same context automatically.

---

## Configure the headers at init

```typescript
await syntropyLog.init({
  context: {
    correlationIdHeader: 'X-Correlation-ID',
    transactionIdHeader: 'X-Transaction-ID',
  },
});
```

These header names are the **single source of truth**. They are used to:

- Read the correlation/transaction ID from incoming requests.
- Propagate them on outgoing HTTP/broker calls (when using a SyntropyLog adapter).
- Resolve `correlationId` / `transactionId` in the [Logging Matrix](logging-matrix.md).

---

## Express middleware

The framework ships a production-grade middleware as `correlationIdMiddleware()` — accepting any of the common ID headers, falling back to W3C `traceparent`, generating one if none arrive, echoing it onto the response, and keeping the AsyncLocalStorage scope alive until the response closes.

```typescript
import express from 'express';
import { syntropyLog, correlationIdMiddleware } from 'syntropylog';

await syntropyLog.init({ /* … */ });

const app = express();
app.use(correlationIdMiddleware());
```

After this, every `logger.info(...)` inside the request carries the same `correlationId` without passing it manually.

### Configuration

All options have sensible defaults; pass any subset to override.

```typescript
import { correlationIdMiddleware, createSyntropyLog } from 'syntropylog';

const tenantLogging = createSyntropyLog();
await tenantLogging.init({ /* … */ });

app.use(correlationIdMiddleware({
  // Target a specific instance instead of the global singleton.
  syntropyLog: tenantLogging,

  // Customize incoming headers (first non-empty wins).
  // Default: ['x-trace-id', 'x-correlation-id', 'x-request-id', 'request-id'].
  incomingHeaders: ['x-acme-trace-id', 'x-correlation-id'],

  // Customize response headers echoed with the resolved ID. Pass [] to skip.
  // Default: ['X-Trace-Id', 'X-Correlation-ID', 'X-Request-ID'].
  responseHeaders: ['X-Acme-Trace-Id'],

  // W3C traceparent fallback (default: true).
  parseTraceparent: true,

  // Custom ID generator (default: `trc_${epoch}_${random9}`).
  generateCorrelationId: () => crypto.randomUUID(),
}));
```

## Fastify hook

Same option surface, same defaults, registered as an `onRequest` hook:

```typescript
import Fastify from 'fastify';
import { syntropyLog, fastifyCorrelationHook } from 'syntropylog';

await syntropyLog.init({ /* … */ });

const app = Fastify();
app.addHook('onRequest', fastifyCorrelationHook());

// Same per-tenant / custom-header configuration applies:
app.addHook('onRequest', fastifyCorrelationHook({
  syntropyLog: tenantLogging,
  incomingHeaders: ['x-acme-trace-id'],
  parseTraceparent: true,
}));
```

The hook uses the `done`-callback form intentionally — calling `done()` synchronously inside the context scope schedules Fastify's next step while the scope is still active, so every subsequent hook, validator, and handler observes the same correlation context.

## Custom integrations

If you're not using Express or Fastify, the same resolver is exported on its own:

```typescript
import { resolveCorrelationId, traceIdFromTraceparent } from 'syntropylog';

// Resolve from any headers record (Koa, Hono, custom server, etc.):
const id = resolveCorrelationId(ctx.request.headers, {
  incomingHeaders: ['x-trace-id', 'x-correlation-id'],
  parseTraceparent: true,
});
```

`resolveCorrelationId` is pure: it walks the headers in order, falls back to `traceparent`, and generates an ID if nothing matches. No side effects, no I/O.

### W3C Trace Context (OpenTelemetry interop)

If your platform team runs an OpenTelemetry collector, incoming requests usually carry a `traceparent` header (RFC 9110). The middleware above extracts the 32-hex trace-id from `traceparent` and uses it as SyntropyLog's correlation ID, so a single trace ID propagates through both your traces and your logs without extra plumbing.

If you need to **propagate** trace context on outgoing HTTP calls, build the `traceparent` value yourself in your HTTP client (or use the OpenTelemetry SDK alongside SyntropyLog) — the framework intentionally stays out of the wire format.

To **export logs** to an OTLP collector (so traces and logs land in the same backend correlated by `traceId`), see [opentelemetry-integration.md](opentelemetry-integration.md) — it covers the formatter, severity mapping, and the executor that emits `LogRecord` via `@opentelemetry/api-logs`.

---

## NestJS

The framework ships a NestJS sub-package — `syntropylog/nestjs` — that provides three things:

- **`SyntropyLogModule`** — global Nest module wired to a SyntropyLog instance (singleton by default, override via `forRoot({ syntropyLog })`).
- **`SyntropyNestLoggerService`** — `LoggerService` implementation that routes Nest's internal logs and every `new Logger('Foo').log(...)` call through SyntropyLog.
- **`@InjectLogger()`** — parameter decorator that injects an `ILogger` pre-bound with the consumer's class name as `source` (uses Nest's `INQUIRER` + `Scope.TRANSIENT`).

`@nestjs/common`, `@nestjs/core`, `reflect-metadata`, and `rxjs` are declared as **optional peer dependencies** — install them only if you import from `syntropylog/nestjs`.

### Setup

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { syntropyLog, correlationIdMiddleware } from 'syntropylog';
import {
  SyntropyLogModule,
  SyntropyNestLoggerService,
} from 'syntropylog/nestjs';
import { AppModule } from './app.module';

async function bootstrap() {
  await syntropyLog.init({ /* … */ });

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: new SyntropyNestLoggerService(syntropyLog),
  });

  // Express middleware (Nest routes through Express by default).
  // Mount this BEFORE any controllers so guards/pipes observe the context.
  app.use(correlationIdMiddleware());

  await app.listen(3000);
}
```

The application module:

```typescript
// src/app.module.ts
@Module({
  imports: [SyntropyLogModule.forRoot()],
  controllers: [/* … */],
  providers: [/* … */],
})
export class AppModule {}
```

For multi-tenant apps, pass a factory-produced instance into `forRoot({ syntropyLog })` and into `SyntropyNestLoggerService(syntropyLog)`.

### Using `@InjectLogger()` in services

Each `@InjectLogger()` injection returns a fresh `ILogger` pre-bound with `.withSource(ConsumerClassName)`. The source name is read from NestJS's `INQUIRER` at injection time — no decorator argument required.

```typescript
import { Injectable } from '@nestjs/common';
import type { ILogger } from 'syntropylog';
import { InjectLogger } from 'syntropylog/nestjs';

@Injectable()
export class PaymentService {
  constructor(@InjectLogger() private readonly log: ILogger) {}

  async charge(amount: number, userId: string) {
    this.log.info({ amount, userId }, 'Charging card');
    // → entry includes source: 'PaymentService' automatically.
  }
}
```

If you need a custom source name (e.g. a service whose class name doesn't match the desired log source), inject SyntropyLog itself and bind manually:

```typescript
import { Inject } from '@nestjs/common';
import {
  SYNTROPYLOG_INSTANCE_TOKEN,
} from 'syntropylog/nestjs';
import type { ISyntropyLog } from 'syntropylog';

@Injectable()
export class PaymentService {
  private readonly log;
  constructor(@Inject(SYNTROPYLOG_INSTANCE_TOKEN) sl: ISyntropyLog) {
    this.log = sl.getLogger('payments').withSource('Stripe');
  }
}
```

> `bufferLogs: true` ensures startup logs are buffered until your custom logger is wired.

---

## Lambda / Serverless

Wrap the handler body in `contextManager.run`. The cold-start initialization stays at module scope.

```typescript
import { syntropyLog } from 'syntropylog';

const initialized = syntropyLog.init({ /* … */ });

export async function handler(event: APIGatewayEvent) {
  await initialized;
  const { contextManager } = syntropyLog;

  return contextManager.run(async () => {
    const cid = event.headers['x-correlation-id'] ?? contextManager.getCorrelationId();
    contextManager.set(contextManager.getCorrelationIdHeaderName(), cid);

    // … handler logic
  });
}
```

---

## Setting custom context fields

Any field you put in the context is eligible for the [Logging Matrix](logging-matrix.md). The matrix decides which levels surface which fields; the context is the source of truth.

```typescript
contextManager.set('tenantId', 'acme');
contextManager.set('userId', 123);
contextManager.set('operation', 'payment.charge');

logger.info('starting charge');
// fields appear only if the matrix whitelists them for `info`
```

---

## Reading the filtered context

For framework adapters or debugging, you can ask "what would the matrix expose at this level right now?":

```typescript
const visible = syntropyLog.getFilteredContext('info');
```
