# Getting started — the declarative shift, with a full example

If you have run the [README](../README.md) quick start and want the bigger picture before
reaching for a specific topic doc, start here.

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

## A fuller example

The same start, now with a logging matrix (field control per level), masking, and clean shutdown:

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
| NestJS | In `bootstrap()` before `app.listen()` (see [NestJS](nestjs.md)) |
| Lambda / Serverless | Module-level singleton outside the handler; init once, reused across invocations |

**Where to go next:** run [`01-hello-world`](https://github.com/Syntropysoft/syntropylog-examples/tree/main/01-hello-world) (examples `00`–`21`), or jump to [What's in the box](../README.md#whats-in-the-box).

