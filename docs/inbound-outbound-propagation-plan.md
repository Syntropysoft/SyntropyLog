# Inbound / Outbound Context Propagation — Design Plan

**Status:** Shipped. This is the design record, not the current state — it says "Target version
1.1.0" because that is when it was written. User-facing documentation is
[context.md § Propagating across processes](context.md#propagating-across-processes).
**Target version:** 1.1.0 (additive — no breaking changes)
**Reference implementation:** [slpy v0.3.2 (Python)](https://github.com/Syntropysoft/syntropylog.py)

---

## Problem statement

The current API hardcodes two context fields — `correlationIdHeader` and `transactionIdHeader` — and
provides one `getTraceContextHeaders()` method that returns both. This creates three limitations:

1. **Fixed field names.** Any service that uses different fields (tenant ID, session ID, request ID, etc.)
   has to work around the API or store them manually without participating in propagation.

2. **Single inbound source.** A BFF or API gateway that receives traffic from multiple origins
   (a frontend app, a partner API, an internal legacy system) cannot declare that each source uses
   different header names for the same conceptual fields. There is one global configuration — not
   one per source.

3. **No per-target outbound mapping.** `getTraceContextHeaders()` returns the same key names
   regardless of destination. A call to Kafka needs `correlationId`, a call to S3 needs
   `Correlation_ID`, a call to Azure needs `CorrelationID`. Today the developer must build
   that mapping manually for every outbound call.

The Python counterpart (slpy) solved all three with a symmetric `inbound`/`outbound` config structure.
This document plans the equivalent for SyntropyLog.

---

## Core design

The key insight: `inbound` and `outbound` have identical shape. One is keyed by **source**, the
other by **destination**. The internal context is the translation layer between them. Application
code never sees wire names.

```
inbound['frontend']   internal context   outbound['http']       outbound['kafka']
──────────────────    ────────────────   ─────────────────      ─────────────────
X-Correlation-ID  ->  correlationId  ->  X-Correlation-ID   /   correlationId
X-Trace-ID        ->  traceId        ->  X-Trace-ID         /   traceId

inbound['partner']    internal context   outbound['http']       outbound['kafka']
──────────────────    ────────────────   ─────────────────      ─────────────────
x-request-id      ->  correlationId  ->  X-Correlation-ID   /   correlationId
x-b3-traceid      ->  traceId        ->  X-Trace-ID         /   traceId
```

---

## Compatibility strategy

The new feature is **purely additive**. Nothing is removed. Nothing is renamed.

The two config styles coexist in `ContextConfig`:

| Config present | Behaviour |
|----------------|-----------|
| Only `correlationIdHeader` / `transactionIdHeader` | Existing behaviour, unchanged |
| Only `inbound` / `outbound` | New behaviour |
| Both | New behaviour takes priority for `getPropagationHeaders()`; old methods still work via their own fields |

The existing methods — `getCorrelationId()`, `getCorrelationIdHeaderName()`,
`getTransactionId()`, `getTransactionIdHeaderName()`, `setCorrelationId()`,
`setTransactionId()`, `getTraceContextHeaders()` — are **kept as-is**. They are not
deprecated in this version. Deprecation (with `@deprecated` JSDoc) can happen in a
future minor release once adoption of the new API is confirmed.

This means developers who adopted 1.0.0 see zero change. Developers on 1.1.0 can
migrate at their own pace — or not at all.

---

## New TypeScript config types

```typescript
// fields.ts — developer defines their own constants
const FIELD_CORRELATION = 'correlationId';
const FIELD_TRACE       = 'traceId';
const FIELD_TENANT      = 'tenantId';

const SOURCE_FRONTEND = 'frontend';
const SOURCE_PARTNER  = 'partner';
const SOURCE_LEGACY   = 'legacy';

const TARGET_HTTP  = 'http';    // default — used by getPropagationHeaders() with no arg
const TARGET_KAFKA = 'kafka';
const TARGET_S3    = 's3';
const TARGET_AZURE = 'azure';
```

```typescript
// Updated config schema — old fields kept, new fields added
export interface ContextConfig {
  // ── Existing fields (kept, unchanged) ──────────────────────────────────
  /** @legacy Use inbound/outbound for multi-source and multi-target support. */
  correlationIdHeader?: string;
  /** @legacy Use inbound/outbound for multi-source and multi-target support. */
  transactionIdHeader?: string;

  // ── New fields ──────────────────────────────────────────────────────────
  /**
   * Per-source inbound header mappings.
   * Each key is a source name; each value maps conceptual field → wire header name.
   *
   * @example
   * inbound: {
   *   [SOURCE_FRONTEND]: { [FIELD_CORRELATION]: 'X-Correlation-ID' },
   *   [SOURCE_PARTNER]:  { [FIELD_CORRELATION]: 'x-request-id' },
   * }
   */
  inbound?: Record<string, Record<string, string>>;

  /**
   * Per-target outbound header mappings.
   * Each key is a target name; each value maps conceptual field → wire name for that target.
   * Use 'http' as the key for the default HTTP target (getPropagationHeaders() with no arg).
   *
   * @example
   * outbound: {
   *   [TARGET_HTTP]:  { [FIELD_CORRELATION]: 'X-Correlation-ID' },
   *   [TARGET_KAFKA]: { [FIELD_CORRELATION]: 'correlationId' },
   *   [TARGET_S3]:    { [FIELD_CORRELATION]: 'Correlation_ID' },
   * }
   */
  outbound?: Record<string, Record<string, string>>;

  /**
   * Custom headers to extract from inbound requests and propagate as-is,
   * without mapping to conceptual field names.
   * The header name lowercased and with '-' replaced by '_' becomes the context key.
   *
   * @example
   * customHeaders: ['X-Tenant-ID', 'X-Feature-Flag']
   */
  customHeaders?: string[];
}
```

---

## Full init() example

```typescript
import syntropyLog from 'syntropylog';

const FIELD_CORRELATION = 'correlationId';
const FIELD_TRACE       = 'traceId';
const FIELD_TENANT      = 'tenantId';

const SOURCE_FRONTEND = 'frontend';
const SOURCE_PARTNER  = 'partner';

const TARGET_HTTP  = 'http';
const TARGET_KAFKA = 'kafka';
const TARGET_S3    = 's3';

await syntropyLog.init({
  logger: { level: 'info' },
  context: {
    inbound: {
      [SOURCE_FRONTEND]: {
        [FIELD_CORRELATION]: 'X-Correlation-ID',
        [FIELD_TRACE]:       'X-Trace-ID',
        [FIELD_TENANT]:      'X-Tenant-ID',
      },
      [SOURCE_PARTNER]: {
        [FIELD_CORRELATION]: 'x-request-id',
        [FIELD_TRACE]:       'x-b3-traceid',
      },
    },
    outbound: {
      [TARGET_HTTP]: {
        [FIELD_CORRELATION]: 'X-Correlation-ID',
        [FIELD_TRACE]:       'X-Trace-ID',
        [FIELD_TENANT]:      'X-Tenant-ID',
      },
      [TARGET_KAFKA]: {
        [FIELD_CORRELATION]: 'correlationId',
        [FIELD_TRACE]:       'traceId',
      },
      [TARGET_S3]: {
        [FIELD_CORRELATION]: 'Correlation_ID',
      },
    },
  },
});
```

---

## New IContextManager API

### Existing methods — unchanged

All existing methods are kept with identical signatures and behaviour:

| Method | Status |
|--------|--------|
| `configure(options)` | Unchanged — now also accepts `inbound`/`outbound` keys |
| `getCorrelationId()` | Kept |
| `getCorrelationIdHeaderName()` | Kept |
| `setCorrelationId(id)` | Kept |
| `getTransactionId()` | Kept |
| `getTransactionIdHeaderName()` | Kept |
| `setTransactionId(id)` | Kept |
| `getTraceContextHeaders()` | Kept |
| `run(fn)` | Kept |
| `get(key)` | Kept |
| `set(key, value)` | Kept |
| `getAll()` | Kept |
| `getFilteredContext(level)` | Kept |

### New methods

```typescript
interface IContextManager {
  // ... existing methods kept (run, get, set, getAll, getFilteredContext) ...

  /**
   * Returns a dict of {wireName: value} for the given target, ready to pass to
   * any outbound call. Only fields that have a value in the current context are included.
   *
   * With no argument — uses the 'http' target (outbound['http']).
   * With a target name — uses outbound[target].
   * Unknown target — returns {}.
   *
   * @example
   * await axios.get(url, { headers: contextManager.getPropagationHeaders() });
   * await kafkaProducer.send({ headers: contextManager.getPropagationHeaders(TARGET_KAFKA) });
   * await s3.putObject({ Metadata: contextManager.getPropagationHeaders(TARGET_S3) });
   */
  getPropagationHeaders(target?: string): Record<string, string>;

  /**
   * Returns the configured outbound wire name for a conceptual field.
   * Defaults to the 'http' target if no target is given.
   *
   * @example
   * contextManager.getOutboundHeaderName(FIELD_CORRELATION)         // -> 'X-Correlation-ID'
   * contextManager.getOutboundHeaderName(FIELD_CORRELATION, 'kafka') // -> 'correlationId'
   */
  getOutboundHeaderName(field: string, target?: string): string | undefined;

  /**
   * Reads any field from the current context by its conceptual name.
   * Already exists as get(key) — this documents the primary use pattern.
   *
   * @example
   * contextManager.get(FIELD_CORRELATION)  // -> 'req-001'
   * contextManager.get(FIELD_TENANT)       // -> 'acme'
   * contextManager.get('unknown')          // -> undefined
   */
  get<T = string>(key: string): T | undefined;
}
```

---

## Node.js gotcha — header case normalization

**Node.js lowercases all incoming HTTP headers.** When `req.headers` is a plain
`Record<string, string>`, every key has already been lowercased by the runtime:

```typescript
// Developer declares in config:
{ [FIELD_CORRELATION]: 'X-Correlation-ID' }

// Node delivers:
req.headers = { 'x-correlation-id': 'req-001' }  // ← already lowercased

// This lookup FAILS:
req.headers['X-Correlation-ID']   // -> undefined

// This works:
req.headers['x-correlation-id']   // -> 'req-001'
```

`extractInboundContext` must normalize the configured wire name to lowercase before looking it
up in the headers object:

```typescript
const value = headers[wireName.toLowerCase()];
```

The developer still declares the wire name in its canonical casing (`'X-Correlation-ID'`) —
that is the name that will appear in the response header and in `getPropagationHeaders()`.
Only the **inbound lookup** uses `.toLowerCase()`. Outbound is unaffected.

**Why this does not affect Python:** Starlette's `Headers` object is case-insensitive by design
(`request.headers.get('X-Correlation-ID')` and `request.headers.get('x-correlation-id')` are
identical). Node.js gives you a plain object — no such guarantee.

---

## Middleware pattern — inbound extraction

No built-in middleware is added (framework-agnostic philosophy stays). The pattern changes from:

```typescript
// BEFORE (current)
app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    const correlationId = req.headers['x-correlation-id'] as string
      ?? contextManager.getCorrelationId(); // auto-generate
    contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
    next();
  });
});
```

To a helper that uses the configured inbound map:

```typescript
// AFTER — framework provides a helper
import { extractInboundContext } from 'syntropylog';

app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    const fields = extractInboundContext(req.headers, SOURCE_FRONTEND);
    for (const [field, value] of Object.entries(fields)) {
      contextManager.set(field, value);
    }
    // Reflect propagation fields back in the response
    const responseHeaders = contextManager.getPropagationHeaders();
    for (const [header, value] of Object.entries(responseHeaders)) {
      res.setHeader(header, value);
    }
    next();
  });
});
```

`extractInboundContext(headers, source)` reads the inbound map for the given source, extracts
the matching header values from `headers`, auto-generates `correlationId` if it maps to a header
that is absent, and returns `{ fieldName: value }`. This is a pure function — no context mutation.

The developer can also do it inline without the helper:

```typescript
app.use(async (req, res, next) => {
  await contextManager.run(async () => {
    const inboundMap = syntropyLog.getInboundMap(SOURCE_FRONTEND);
    for (const [field, headerName] of Object.entries(inboundMap)) {
      const value = req.headers[headerName.toLowerCase()] as string
        ?? (field === FIELD_CORRELATION ? crypto.randomUUID() : undefined);
      if (value) contextManager.set(field, value);
    }
    next();
  });
});
```

---

## Auto-generation rule

`correlationId` (or whatever field maps to the correlation header) is **the only field that is
auto-generated** when absent from an inbound request. This matches the Python behaviour.

The framework needs to know which field is the correlation field. Options:

**Option A — Implicit:** The first field declared in the inbound map for a source is the
correlation field. Fragile.

**Option B — Explicit config key (recommended):**
```typescript
context: {
  correlationField: FIELD_CORRELATION,  // 'correlationId' — auto-generated when absent
  inbound: { ... },
  outbound: { ... },
}
```
Default: `'correlationId'`.

This is the minimal framework opinion: one string constant for which field gets auto-generated.

---

## What is new (additive only)

| Addition | Description |
|----------|-------------|
| `context.inbound` | New optional config key — per-source header mappings |
| `context.outbound` | New optional config key — per-target header mappings |
| `context.correlationField` | New optional config key — which field gets auto-generated (default: `'correlationId'`) |
| `context.customHeaders` | New optional config key — passthrough headers |
| `getPropagationHeaders(target?)` | New method — returns `{wireName: value}` for the given target |
| `getOutboundHeaderName(field, target?)` | New method — returns the configured outbound wire name |
| `extractInboundContext(headers, source)` | New exported helper function — pure, no context mutation |

**Nothing is removed. Nothing is renamed. No existing call site breaks.**

---

## Files that need changing

### Source files
| File | Change |
|------|--------|
| `src/config.schema.ts` | Add `inbound`, `outbound`, `correlationField`, `customHeaders` to `ContextConfig` |
| `src/config/config.validator.ts` | Add validation rules for new optional keys (old keys untouched) |
| `src/context/IContextManager.ts` | Add `getPropagationHeaders`, `getOutboundHeaderName` (no removals) |
| `src/context/ContextManager.ts` | Add inbound/outbound map fields and implement new methods |
| `src/context/MockContextManager.ts` | Add stubs for new methods |
| `src/SyntropyLog.ts` | Export `extractInboundContext` helper |

### Test files
| File | Change |
|------|--------|
| `tests/context/ContextManager.test.ts` | Rewrite configure/header/propagation suites |
| `tests/SyntropyLog.test.ts` | Update init config examples |

### Documentation
| File | Change |
|------|--------|
| `README.md` | Rewrite "Context" section with new inbound/outbound pattern |
| `docs/features-and-examples.md` | Update middleware examples |
| `docs/opentelemetry-integration.md` | Update `getTraceContextHeaders()` → `getPropagationHeaders()` |

---

## README section to write

The new README section replaces the current "Context — correlation ID and transaction ID" section.
Key points to communicate:

1. **Conceptual field names vs wire names** — the diagram showing inbound → internal → outbound
2. **Constants pattern** — `FIELD_*`, `SOURCE_*`, `TARGET_*` as a naming convention, not framework feature
3. **Symmetric config** — `inbound` and `outbound` have identical shape
4. **`getPropagationHeaders(target?)`** — the single outbound method, `'http'` default
5. **`contextManager.get(FIELD)`** — read any context field
6. **Middleware pattern** — updated example using the new config
7. **Auto-generation** — `correlationField` gets a UUID if absent on inbound

---

## What does NOT change

- `AsyncLocalStorage` as the context engine — stays
- `contextManager.run(fn)` — stays, that is the scope boundary
- `contextManager.get(key)` / `contextManager.set(key, value)` — stays
- `contextManager.getAll()` — stays
- `getFilteredContext(level)` + logging matrix — stays
- Framework-agnostic philosophy — no built-in Express/Fastify middleware
- `customHeaders` — stays (passthrough headers)
- Silent observer — errors in propagation never throw

---

## Upgrade guide (for README — optional, not required)

```typescript
// BEFORE
await syntropyLog.init({
  context: {
    correlationIdHeader: 'X-Correlation-ID',
    transactionIdHeader: 'X-Trace-ID',
  },
});

const correlationId = contextManager.getCorrelationId();
const headers = contextManager.getTraceContextHeaders();
// -> { 'X-Correlation-ID': 'req-001', 'X-Trace-ID': 'trace-xyz' }

// AFTER
const FIELD_CORRELATION = 'correlationId';
const FIELD_TRACE       = 'traceId';
const TARGET_HTTP       = 'http';

await syntropyLog.init({
  context: {
    correlationField: FIELD_CORRELATION,
    inbound: {
      default: {
        [FIELD_CORRELATION]: 'X-Correlation-ID',
        [FIELD_TRACE]:       'X-Trace-ID',
      },
    },
    outbound: {
      [TARGET_HTTP]: {
        [FIELD_CORRELATION]: 'X-Correlation-ID',
        [FIELD_TRACE]:       'X-Trace-ID',
      },
    },
  },
});

const correlationId = contextManager.get(FIELD_CORRELATION);
const headers = contextManager.getPropagationHeaders();
// -> { 'X-Correlation-ID': 'req-001', 'X-Trace-ID': 'trace-xyz' }
```

---

## Implementation order

1. Update `config.schema.ts` — new types
2. Update `config.validator.ts` — validation rules
3. Update `IContextManager.ts` — new interface
4. Update `ContextManager.ts` — core implementation
5. Update `MockContextManager.ts` — test mirror
6. Update `SyntropyLog.ts` — wire new config into lifecycle
7. Update all tests
8. Update README
9. Update `docs/features-and-examples.md`
10. Bump version to 1.0.0-rc.2, update CHANGELOG
