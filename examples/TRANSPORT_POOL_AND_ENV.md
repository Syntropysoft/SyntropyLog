# Transport pool and per-environment routing

This document describes how to configure a **named pool of transports** and choose **per environment** which ones are active, and how to **override, add, or remove** destinations for individual log calls.

---

## Recommended form: `transportList` + `env`

Define the transport pool separately from the environment mapping:

- **`transportList`:** `Record<string, Transport>` — all transports by name (the pool).
- **`env`:** `Record<string, string[]>` — for each environment, the list of **names** from the pool that are used as the default set.

The current environment is read from `process.env[logger.envKey ?? 'NODE_ENV']`. If the current env is not in `env`, the default set is empty (define an entry for each environment you use).

### Example (self-contained: everything to console with mocks)

In the example below, `db`, `azure`, and `archivo` are simulated with `AdapterTransport` + `UniversalAdapter` writing to console with a label. In production you replace them with real transports (Azure, DB, file, etc.).

```ts
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

**Priority:** If both `transportList` and `env` are set, this form is used. Otherwise, the legacy `transports` form is used (see below).

---

## Per-call routing: `.override()`, `.add()`, `.remove()`

You can change where **the next log** goes without changing global config:

| Method | Meaning | Example |
|--------|---------|---------|
| **`.override("a", "b")`** | For this log, **only** these transports. | `logger.override("consola").info("only console")` |
| **`.add("x")`** | For this log, default **plus** these. Chainable. | `logger.add("azure").info("also to Azure")` |
| **`.remove("x").remove("z")`** | For this log, default **minus** these. Chainable. | `logger.remove("db").remove("azure").info("debug only")` |

- **Override** replaces the effective set with exactly the names you pass.
- **Add** and **remove** apply on top of the default set. You can chain: `logger.remove("db").add("archivo").info("...")` → default − db + archivo.
- Applies to the **next log call only**; the following call without override/add/remove uses the default again.

### Examples

```ts
logger.override("consola").info("debugging, don't send to DB");
logger.override("consola", "archivo").info("manual backup");
logger.add("azure").info("transaction that also goes to Azure");
logger.remove("db").remove("azure").info("console only");
logger.remove("db").add("archivo").info("audit to file, not DB");
```

---

## Legacy form: `transports` (compatibility)

If you do **not** set both `transportList` and `env`, you can use the classic `transports` option:

- **Array or record** of `Transport` instances, or descriptors `{ transport: Transport, env?: string | string[] }`.
- When `env` is set on a descriptor, that transport is only included when the current environment is in the list.
- Environment is still read from `process.env[logger.envKey ?? 'NODE_ENV']`.

This form remains supported for backward compatibility.

---

## Summary

| Need | Solution |
|------|----------|
| **Pool + env (recommended)** | `logger.transportList` (name → Transport) + `logger.env` (env → names). |
| Per-call: only these destinations | `logger.override("consola", "archivo").info("...")`. |
| Per-call: default + some | `logger.add("azure").info("...")`. |
| Per-call: default − some | `logger.remove("db").remove("azure").info("...")`. |
| Different env variable | `logger.envKey: 'APP_ENV'`. |

**Runnable example:** `TransportPoolExample.ts` in this folder shows the transport pool and override/add/remove in action (all output goes to console with labels). From the repo root, build the project (`npm run build`) then run the example with your preferred runner (e.g. `npx tsx examples/TransportPoolExample.ts`, or run the compiled output if you wire it in your build).
