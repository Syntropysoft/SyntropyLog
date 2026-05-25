# Transports

A transport is anything that receives a structured log entry and writes it somewhere — stdout, a database, an object store, a log aggregator. SyntropyLog ships with console transports for development and a **Universal Adapter** for everything else, so you write a single `executor` function per backend.

---

## Universal Adapter — log to any backend

```typescript
import { AdapterTransport, UniversalAdapter } from 'syntropylog';

const dbTransport = new AdapterTransport({
  name: 'db',
  adapter: new UniversalAdapter({
    executor: async (logEntry) => {
      await prisma.systemLog.create({
        data: {
          level:         logEntry.level,
          message:       logEntry.message,
          serviceName:   logEntry.serviceName,
          correlationId: logEntry.correlationId,
          payload:       logEntry.meta,
          timestamp:     new Date(logEntry.timestamp),
        },
      });
    },
  }),
});
```

The `executor` signature is `(data: unknown) => Promise<void> | void` — the entry is **statically typed as `unknown`**, so cast or validate inside your function. At runtime the entry has already been masked, sanitized, and matrix-filtered, and contains:

| Field           | Type at runtime               | Origin                                       |
|-----------------|-------------------------------|----------------------------------------------|
| `level`         | `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal' \| 'audit'` | always present |
| `message`       | `string`                      | always present                               |
| `timestamp`     | `string` (ISO 8601)           | always present                               |
| `serviceName`   | `string`                      | from `logger.serviceName` config             |
| `correlationId` | `string \| undefined`         | from `ContextManager` (if mounted)           |
| `transactionId` | `string \| undefined`         | from `withTransactionId(...)` or context     |
| `source`        | `string \| undefined`         | from `withSource(...)`                       |
| `retention`     | `unknown`                     | from `withRetention(...)`                    |
| (any other key) | `unknown`                     | from `child({...})`, context, or log call    |

A minimal typed wrapper:

```typescript
import type { LogEntry } from 'syntropylog';

executor: async (data) => {
  const entry = data as LogEntry;  // index signature is open, fields above are present at runtime
  await db.insert({ level: entry.level, message: entry.message, ts: entry.timestamp });
}
```

> **Silent Observer.** If `executor` throws, SyntropyLog reports through `onTransportError` (see [lifecycle.md](lifecycle.md)) and continues. Logging never crashes the app.

---

## Transport pool & per-environment routing

Declare a pool of named transports and pick which ones are active per environment. No code branches for "is this prod".

```typescript
await syntropyLog.init({
  logger: {
    envKey: 'NODE_ENV',
    serviceName: 'my-app',
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
```

---

## Per-call transport control

`override`, `add`, and `remove` change the transport set for a **single** log call — no new logger instance required.

```typescript
const log = syntropyLog.getLogger('app');

log.info('uses env default');
log.override('consola').info('only to console');
log.remove('db').add('azure').info('default minus db, plus azure');
```

| Method               | Effect on the next log call only            |
|----------------------|----------------------------------------------|
| `.override(...names)` | Send to exactly these transports             |
| `.add(...names)`      | Add these to the current set                 |
| `.remove(...names)`   | Drop these from the current set              |

See [examples/TRANSPORT_POOL_AND_ENV.md](../examples/TRANSPORT_POOL_AND_ENV.md) and the runnable [TransportPoolExample.ts](../examples/TransportPoolExample.ts).

---

## Console transports

Default output is plain JSON to stdout. For colored, human-readable output in development, pick one:

| Transport                  | Style                            |
|----------------------------|----------------------------------|
| *(default)*                | Plain JSON                       |
| `ClassicConsoleTransport`  | Single-line, colored             |
| `PrettyConsoleTransport`   | Pretty-printed, colored          |
| `CompactConsoleTransport`  | Compact one-liner, colored       |
| `ColorfulConsoleTransport` | Full-line colored                |

```typescript
import { ClassicConsoleTransport } from 'syntropylog';

syntropyLog.init({
  logger: {
    level: 'info',
    serviceName: 'my-app',
    transports: [new ClassicConsoleTransport()],
  },
});
```

- ANSI is built-in (no `chalk` dependency).
- Colors are disabled automatically when `stdout` is not a TTY or when `NO_COLOR` is set.
