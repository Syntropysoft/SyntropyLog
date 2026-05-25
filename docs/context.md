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

## Express / Fastify middleware

A production-grade middleware does five things: accept any of the common ID headers, fall back to W3C `traceparent`, generate one if none arrive, echo it back on the response, and keep the AsyncLocalStorage scope alive until the response is closed.

```typescript
import { syntropyLog } from 'syntropylog';

const HEADERS = ['x-trace-id', 'x-correlation-id', 'x-request-id', 'request-id'] as const;

/** W3C Trace Context: `{version}-{trace-id}-{parent-id}-{flags}` → returns the 32-hex trace-id or null. */
function traceIdFromTraceparent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i.exec(value.trim());
  if (!m || /^0{32}$/.test(m[1])) return null;
  return m[1].toLowerCase();
}

function resolveCorrelationId(req: import('express').Request): string {
  const fromHeader = HEADERS.find((h) => req.headers[h]);
  if (fromHeader) return req.headers[fromHeader] as string;

  const tp = req.headers.traceparent;
  const fromTraceparent = traceIdFromTraceparent(Array.isArray(tp) ? tp[0] : tp);
  if (fromTraceparent) return fromTraceparent;

  return `trc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

app.use(async (req, res, next) => {
  const { contextManager } = syntropyLog;

  await contextManager.run(async () => {
    const correlationId = resolveCorrelationId(req);

    contextManager.setCorrelationId(correlationId);

    // Echo on response so clients can trace the call end-to-end
    res.setHeader('X-Trace-Id', correlationId);
    res.setHeader('X-Correlation-ID', correlationId);
    res.setHeader('X-Request-ID', correlationId);

    // Keep the AsyncLocalStorage scope alive until the response is finished or closed
    await new Promise<void>((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      next();
    });
  });
});
```

After this, every `logger.info(...)` inside the request carries the same `correlationId` without passing it manually.

### W3C Trace Context (OpenTelemetry interop)

If your platform team runs an OpenTelemetry collector, incoming requests usually carry a `traceparent` header (RFC 9110). The middleware above extracts the 32-hex trace-id from `traceparent` and uses it as SyntropyLog's correlation ID, so a single trace ID propagates through both your traces and your logs without extra plumbing.

If you need to **propagate** trace context on outgoing HTTP calls, build the `traceparent` value yourself in your HTTP client (or use the OpenTelemetry SDK alongside SyntropyLog) — the framework intentionally stays out of the wire format.

To **export logs** to an OTLP collector (so traces and logs land in the same backend correlated by `traceId`), see [opentelemetry-integration.md](opentelemetry-integration.md) — it covers the formatter, severity mapping, and the executor that emits `LogRecord` via `@opentelemetry/api-logs`.

---

## NestJS

NestJS routes through Express by default, so **use the same middleware pattern via `app.use(...)` in `bootstrap()` — not a NestJS `Interceptor`**. An interceptor runs *after* guards and pipes have already executed, which is too late for context to be available everywhere.

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { syntropyLog } from 'syntropylog';

async function bootstrap() {
  await syntropyLog.init({ /* … */ });

  const app = await NestFactory.create(AppModule);
  const { contextManager } = syntropyLog;

  // AsyncLocalStorage scope wraps the whole request, including guards and pipes
  app.use((req, res, next) => {
    contextManager.run(async () => {
      const cid =
        (req.headers[contextManager.getCorrelationIdHeaderName().toLowerCase()] as string) ??
        contextManager.getCorrelationId();
      contextManager.set(contextManager.getCorrelationIdHeaderName(), cid);

      // Wait until response is finished/closed before releasing the context
      await new Promise<void>((resolve) => {
        res.once('finish', resolve);
        res.once('close', resolve);
        next();
      });
    });
  });

  await app.listen(3000);
}
```

> **Tip — replace NestJS's built-in Logger with SyntropyLog.** Implement `LoggerService` once and pass it to `NestFactory.create`. Every `new Logger('Foo').log(...)` call in the codebase then routes through SyntropyLog without any other change.
>
> ```typescript
> import { LoggerService } from '@nestjs/common';
> import { syntropyLog } from 'syntropylog';
>
> class SyntropyNestLoggerService implements LoggerService {
>   private log = syntropyLog.getLogger('nest');
>   log(message: unknown, ctx?: string) { this.log.info({ nestContext: ctx }, String(message)); }
>   error(message: unknown, ctx?: string) { this.log.error({ nestContext: ctx }, String(message)); }
>   warn(message: unknown, ctx?: string) { this.log.warn({ nestContext: ctx }, String(message)); }
>   debug(message: unknown, ctx?: string) { this.log.debug({ nestContext: ctx }, String(message)); }
>   verbose(message: unknown, ctx?: string) { this.log.trace({ nestContext: ctx }, String(message)); }
>   fatal(message: unknown, ctx?: string) { this.log.fatal({ nestContext: ctx }, String(message)); }
> }
>
> const app = await NestFactory.create(AppModule, {
>   bufferLogs: true,
>   logger: new SyntropyNestLoggerService(),
> });
> ```
>
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
