# Runtime Reconfiguration

Some logging decisions need to change **after** the process has started — typically when an operator needs more visibility on a specific POD without redeploying. SyntropyLog exposes a deliberately narrow surface for this, designed around one principle:

> **Runtime reconfiguration can widen visibility for debugging, but it cannot widen the security boundary.**

Masking rules can only be **added**, never removed or relaxed. Transports can only be **added** in debug mode (console transports only), never replaced. The Logging Matrix can be re-set, but it only controls field visibility — never masking or transport routing.

---

## What you can change at runtime

| Surface                       | API                                              | Notes                                                |
|-------------------------------|--------------------------------------------------|------------------------------------------------------|
| Log level                     | `logger.setLevel('debug')`                       | Per-logger                                           |
| Logging Matrix                | `syntropyLog.reconfigureLoggingMatrix(matrix)`   | Replaces the matrix; see [logging-matrix.md](logging-matrix.md) |
| Masking rules (additive)      | `syntropyLog.getMasker().addRule({ … })`         | Cannot remove or weaken existing rules               |
| Debug console transport       | `syntropyLog.reconfigureTransportsForDebug({ add: [...] })` | **Only built-in console transports**; existing transports stay |
| Reset added debug transports  | `syntropyLog.resetTransports()`                  | Removes only what `reconfigureTransportsForDebug` added |

## What stays fixed at `init`

- `maskChar`, `preserveLength`, `maxDepth`, `regexTimeoutMs`.
- `AdapterTransport` and custom transports.
- Header names, context configuration.
- Native addon enable/disable.

---

## Adding a debug console transport on a POD

A developer needs to read errors directly inside a POD. Add a colored console transport for visual clarity; existing transports keep running.

```typescript
import { syntropyLog, ColorfulConsoleTransport } from 'syntropylog';

syntropyLog.reconfigureTransportsForDebug({
  add: [new ColorfulConsoleTransport({ level: 'error' })],
});

// When done debugging — restore the original transport set:
syntropyLog.resetTransports();
```

If you pass anything other than a built-in console transport (Console, Pretty, Compact, Colorful, Classic) the call throws. This is intentional: runtime is not the place to widen your delivery topology.

---

## Adding masking rules for incident response

A leak is discovered in production and a new field needs immediate redaction across all PODs:

```typescript
import { MaskingStrategy } from 'syntropylog';

const masker = syntropyLog.getMasker();
masker.addRule({
  pattern: /newlyDiscoveredSensitiveField/i,
  strategy: MaskingStrategy.PASSWORD,
});
```

This is **additive only** — once a rule is added, it cannot be removed or relaxed at runtime. To remove the rule you must redeploy.

---

## Exposing reconfiguration over HTTP — your responsibility

SyntropyLog does **not** ship an HTTP endpoint for runtime reconfiguration. The framework gives you the primitives; your application decides how (and whether) to expose them.

If you build an endpoint, it must be:

- **Authenticated** with the same controls as your most privileged admin actions.
- **Network-restricted** — internal mesh only, never public.
- **Audited** — every reconfiguration call should itself emit an `audit` log entry.
- **Rate-limited** — reconfiguration is not a hot path.

Below is a reference Express handler covering all four reconfigurable surfaces. Treat it as a starting point, not a copy-paste.

```typescript
import express from 'express';
import {
  syntropyLog,
  ColorfulConsoleTransport,
  MaskingStrategy,
} from 'syntropylog';

const app = express();
app.use(express.json());

// PROTECT THIS ROUTE: auth + internal-network only + rate limit + audit.
app.post('/admin/reconfigure-logging', requireAdmin, (req, res) => {
  try {
    const {
      level,
      loggingMatrix,
      addTransportForDebug,
      addMaskingRules,
      resetTransports,
    } = req.body ?? {};

    if (level) {
      syntropyLog.getLogger().setLevel(level);
    }
    if (loggingMatrix) {
      syntropyLog.reconfigureLoggingMatrix(loggingMatrix);
    }
    if (addTransportForDebug === true) {
      syntropyLog.reconfigureTransportsForDebug({
        add: [new ColorfulConsoleTransport({ level: 'error' })],
      });
    }
    if (resetTransports === true) {
      syntropyLog.resetTransports();
    }
    if (Array.isArray(addMaskingRules)) {
      const masker = syntropyLog.getMasker();
      for (const r of addMaskingRules) {
        masker.addRule({
          pattern: new RegExp(r.pattern, 'i'),
          strategy: r.strategy as MaskingStrategy,
        });
      }
    }

    // Emit an audit record of the reconfiguration itself:
    syntropyLog
      .getLogger()
      .withRetention({ policy: 'CONFIG_CHANGE', years: 2 })
      .audit({ operator: req.user.id, body: req.body }, 'logging reconfigured');

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
```

When debugging is finished, send `{ "resetTransports": true }` to remove the added console transport so you stop paying for extra logger overhead.
