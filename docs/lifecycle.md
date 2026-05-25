# Lifecycle & Observability Hooks

SyntropyLog runs a small state machine: `INITIALIZING → READY → SHUTTING_DOWN → SHUTDOWN`. The public API is two methods plus a set of optional hooks.

---

## `init` and `shutdown`

`init()` returns a `Promise<void>` that resolves when the framework is fully ready. Until it resolves, `getLogger()` returns a no-op logger that drops messages.

```typescript
import { syntropyLog } from 'syntropylog';

await syntropyLog.init({
  logger: { level: 'info', serviceName: 'my-app' },
});

const log = syntropyLog.getLogger();
log.info('Hello, SyntropyLog.');
```

`shutdown()` flushes in-flight logs and closes transports. Wire it to your process signals:

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

---

## Where to call `init` per framework

| Framework            | Call site                                                       |
|----------------------|-----------------------------------------------------------------|
| Express / Fastify    | Before `app.listen()` in the server entry                       |
| NestJS               | `AppModule.onModuleInit()` or before `app.listen()` in `bootstrap()` |
| Lambda / Serverless  | Module-level lazy singleton (outside the handler), `await`-ed inside |

---

## Observability hooks

Logging never throws. Anything that goes wrong inside the pipeline surfaces through these optional callbacks — wire them to your metrics or alerting.

```typescript
await syntropyLog.init({
  logger: { /* … */ },
  onLogFailure:           (err, entry) => metrics.increment('log_failures'),
  onTransportError:       (err, ctx)   => alerting.notify('transport', ctx, err),
  onSerializationFallback: (reason)    => metrics.increment('serialization_fallback'),
  onStepError:            (step, err)  => metrics.increment(`step_error_${step}`),
  masking: {
    onMaskingError: (err) => metrics.increment('masking_errors'),
  },
});
```

| Hook                             | When it fires                                                 |
|----------------------------------|----------------------------------------------------------------|
| `onLogFailure(error, entry)`     | A log call fails (serialization or transport)                  |
| `onTransportError(error, ctx)`   | Transport fails; `ctx` is `'flush'`, `'shutdown'`, or `'log'`  |
| `onSerializationFallback(reason)`| Native addon failed for this call; JS pipeline used            |
| `onStepError(step, error)`       | A pipeline step failed (hygiene, sanitization, masking)        |
| `masking.onMaskingError(error)`  | Masking failed (e.g. regex timeout); never receives raw payload |

---

## Detecting the native addon at runtime

```typescript
if (syntropyLog.isNativeAddonInUse()) {
  // Rust pipeline is active for this process
}
```

See [native-addon.md](native-addon.md).

---

## Serialization pipeline — keeping logging non-blocking

The serializer is the part of the pipeline that turns the metadata object into something a transport can write. It has three guards designed so that **a misbehaving log call cannot block the event loop or crash the process**:

| Guard | What it does | How to tune |
|-------|--------------|-------------|
| **Circular reference detection** | Replaces re-encountered objects with a `[Circular]` marker so `JSON.stringify` never throws | Always on |
| **Depth limit** | Replaces nodes deeper than the limit with `[MAX_DEPTH_REACHED]` | Default `10`; configurable via the serializer options |
| **Timeout** | Aborts serialization that takes too long and emits a safe subset; the `onSerializationFallback` hook fires | `logger.serializerTimeoutMs` (default 5000 ms; 50–100 ms is enough for most apps) |

```typescript
await syntropyLog.init({
  logger: {
    serviceName: 'my-app',
    serializerTimeoutMs: 100,   // abort serialization after 100ms
  },
  onSerializationFallback: (reason) => metrics.increment('serialization_fallback'),
});
```

The Rust native addon performs serialization in a single pass with masking and sanitization. When the addon cannot process a specific entry, the JS pipeline runs for that call only — see [native-addon.md](native-addon.md).

---

## Internal lifecycle events (advanced)

The singleton emits `ready`, `error`, `shutting_down`, `shutdown`, and `transports_drained` events. These are **internal coordination signals**, not part of the public contract — prefer `await init()` and `await shutdown()` in application code.

They exist as an escape hatch for cases where you need to observe lifecycle transitions from a module that doesn't own the `init()` call (e.g. a plugin that needs to wait for readiness without holding the original promise). If you reach for them in application code, you're probably introducing a race condition the `await` would have prevented.

### Legacy event-and-promise pattern

Some existing production codebases combine `init()` with the `'ready'` / `'error'` events defensively:

```typescript
function initSyntropyLogAsync(): Promise<void> {
  return new Promise((resolve, reject) => {
    syntropyLog.once('ready', () => resolve());
    syntropyLog.once('error', (err) => reject(err));
    syntropyLog.init(config).catch(reject);
  });
}
```

This is **functionally equivalent** to `await syntropyLog.init(config)` — the promise resolves at the same point the `'ready'` event fires, and rejects on the same condition `'error'` fires. The dual pattern is redundant. Keep it only while migrating older code; new code should use `await init()` directly.
