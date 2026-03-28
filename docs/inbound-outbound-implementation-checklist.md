# Inbound / Outbound — Implementation Checklist

**Feature:** Multi-source inbound + symmetric outbound context propagation
**Version:** 1.0.0-rc.2
**Strategy:** Additive only — zero breaking changes

---

## Reconnaissance findings

### ContextConfig is defined in TWO places (both need updating)

**1. `src/internal-types.ts` line 98** — used by ContextManager, IContextManager, MockContextManager
```typescript
export type ContextConfig = {
  correlationIdHeader?: string;
  transactionIdHeader?: string;
  [key: string]: ContextValue;   // ← index signature must be removed
};
```

**2. `src/config.schema.ts` line 63** — used by SyntropyLogConfig (root config)
```typescript
export interface ContextConfig {
  correlationIdHeader?: string;
  transactionIdHeader?: string;
  [key: string]: string | undefined;  // ← index signature must be removed
}
```

Both index signatures must go. `inbound?: Record<string, Record<string, string>>`
is not assignable to `string | undefined` — TypeScript will error.

---

### Validator location

`src/config/config.validator.ts` line 128:
```typescript
const validateContext = object({
  correlationIdHeader: optional(isString),
  transactionIdHeader: optional(isString),
});
```
New fields must be added here. The `recordOf(recordOf(isString))` combinator
is already available in the codebase — use it for `inbound` and `outbound`.

---

### ContextManager private fields (current)

`src/context/ContextManager.ts` lines 35–37:
```typescript
private correlationIdHeader = 'x-correlation-id';
private transactionIdHeader = 'x-trace-id';
private loggingMatrix: LoggingMatrix | undefined;
```

New private fields to add:
```typescript
private inbound: Record<string, Record<string, string>> = {};
private outbound: Record<string, Record<string, string>> = {};
private correlationField = 'correlationId';
```

---

### configure() current implementation (ContextManager line 44)

```typescript
public configure(options: ContextConfig): void {
  if (options.correlationIdHeader) {
    this.correlationIdHeader = options.correlationIdHeader;
  }
  if (options.transactionIdHeader) {
    this.transactionIdHeader = options.transactionIdHeader;
  }
}
```
Must also handle `inbound`, `outbound`, `correlationField` — old branches stay.

---

### getTraceContextHeaders() current implementation (ContextManager line 189)

```typescript
public getTraceContextHeaders(): ContextHeaders {
  const headers: ContextHeaders = {};
  const store = this.storage.getStore();
  if (!store) return headers;
  const correlationId = this.getCorrelationId();
  const transactionId = this.getTransactionId();
  if (correlationId) headers[this.getCorrelationIdHeaderName()] = correlationId;
  if (transactionId) headers[this.getTransactionIdHeaderName()] = transactionId;
  return headers;
}
```
Kept as-is. `getPropagationHeaders()` is the new method alongside it.

---

### Node.js header case gotcha

Node.js lowercases ALL incoming HTTP headers. `req.headers['X-Correlation-ID']` → `undefined`.
`extractInboundContext` must normalize wire names to lowercase when reading from the headers object:

```typescript
const value = headers[wireName.toLowerCase()];
```

The developer declares `'X-Correlation-ID'` in config (canonical casing).
Only the inbound lookup uses `.toLowerCase()`. Outbound is unaffected.

---

### MockContextManager — configure() signature difference

`MockContextManager.configure()` takes `options?: ContextConfig` (optional parameter).
`IContextManager.configure()` takes `options: ContextConfig` (required).
Keep both consistent — `options: ContextConfig` required.

---

## New API surface

### `getPropagationHeaders(target?: string): ContextHeaders`
- No arg → uses `outbound['http']`
- With target → uses `outbound[target]`
- Unknown target → returns `{}`
- Only fields with a value in the current context are included
- If `outbound` is empty (legacy config only) → returns `{}`

### `getOutboundHeaderName(field: string, target?: string): string | undefined`
- Returns `outbound[target ?? 'http'][field]`
- Returns `undefined` if not configured

### `extractInboundContext(headers, source, config): Record<string, string>`
- Pure function — no context mutation, no side effects
- Reads `config.context.inbound[source]`
- For each `[field, wireName]` in the source map:
  - Looks up `headers[wireName.toLowerCase()]`
  - If absent AND field === `config.context.correlationField ?? 'correlationId'`: generates UUID
- Returns `{ fieldName: value }`

---

## Implementation checklist

### Phase 1 — Types

- [x] **`src/internal-types.ts`**
  - [x] Remove `[key: string]: ContextValue` index signature from `ContextConfig`
  - [x] Add `inbound?: Record<string, Record<string, string>>`
  - [x] Add `outbound?: Record<string, Record<string, string>>`
  - [x] Add `correlationField?: string`
  - [x] Add `customHeaders?: string[]`

- [x] **`src/config.schema.ts`**
  - [x] Remove `[key: string]: string | undefined` index signature from `ContextConfig`
  - [x] Add same four fields as above

### Phase 2 — Validation

- [x] **`src/config/config.validator.ts`**
  - [x] Add `inbound: optional(recordOf(recordOf(isString)))` to `validateContext`
  - [x] Add `outbound: optional(recordOf(recordOf(isString)))` to `validateContext`
  - [x] Add `correlationField: optional(isString)` to `validateContext`
  - [x] Add `customHeaders: optional(arrayOf(isString))` to `validateContext`

### Phase 3 — Interface

- [x] **`src/context/IContextManager.ts`**
  - [x] Add `getPropagationHeaders(target?: string): ContextHeaders`
  - [x] Add `getOutboundHeaderName(field: string, target?: string): string | undefined`

### Phase 4 — Core implementation

- [x] **`src/context/ContextManager.ts`**
  - [x] Add private fields: `inbound`, `outbound`, `correlationField`
  - [x] Update `configure()` to read `inbound`, `outbound`, `correlationField`
  - [x] Implement `getPropagationHeaders(target?)`
  - [x] Implement `getOutboundHeaderName(field, target?)`

### Phase 5 — Mock

- [x] **`src/context/MockContextManager.ts`**
  - [x] Add private fields: `inbound`, `outbound`, `correlationField`
  - [x] Update `configure()` to read new fields
  - [x] Implement `getPropagationHeaders(target?)`
  - [x] Implement `getOutboundHeaderName(field, target?)`

### Phase 6 — Helper function

- [x] **`src/context/extractInboundContext.ts`** ← new file
  - [x] Pure function signature: `extractInboundContext(headers, source, config): Record<string, string>`
  - [x] `.toLowerCase()` on wire name when reading headers
  - [x] Auto-generate UUID for `correlationField` when absent
  - [x] Return empty object if source not found in inbound map

### Phase 7 — Exports

- [x] **`src/SyntropyLog.ts`** (or `src/index.ts`)
  - [x] Export `extractInboundContext`
  - [x] Verify `getPropagationHeaders` is accessible via `syntropyLog.contextManager`

### Phase 8 — Tests

- [x] **`tests/context/ContextManager.test.ts`**
  - [x] `configure()` — accepts new fields without breaking old tests
  - [x] `getPropagationHeaders()` — no arg uses 'http' target
  - [x] `getPropagationHeaders('kafka')` — uses kafka target
  - [x] `getPropagationHeaders('unknown')` — returns `{}`
  - [x] `getPropagationHeaders()` — only includes fields present in context
  - [x] `getPropagationHeaders()` — returns `{}` when outside context
  - [x] `getPropagationHeaders()` — returns `{}` when outbound not configured (legacy mode)
  - [x] `getOutboundHeaderName(field)` — returns http wire name
  - [x] `getOutboundHeaderName(field, 'kafka')` — returns kafka wire name
  - [x] `getOutboundHeaderName(field, 'unknown')` — returns `undefined`
  - [x] All existing tests still pass (no regressions)

- [x] **`tests/context/extractInboundContext.test.ts`** ← new file
  - [x] Extracts fields using inbound map for the given source
  - [x] Lowercases wire names when reading headers
  - [x] Auto-generates UUID for correlationField when header absent
  - [x] Does NOT auto-generate for other fields
  - [x] Returns `{}` when source not in inbound map
  - [x] Handles `customHeaders` passthrough (lowercase key)

### Phase 9 — Release

- [x] All existing tests pass (`npm test`)
- [x] TypeScript compiles without errors (`npm run build`)
- [x] Bump version to `1.0.0-rc.2` in `package.json`
- [x] Update CHANGELOG

---

## Invariants — must hold throughout

- `getTraceContextHeaders()` behaviour unchanged
- `getCorrelationId()` behaviour unchanged
- `getCorrelationIdHeaderName()` behaviour unchanged
- `getTransactionId()` / `setTransactionId()` behaviour unchanged
- `configure({ correlationIdHeader: 'X-Foo' })` still works
- `run()`, `get()`, `set()`, `getAll()`, `getFilteredContext()` untouched
- No new runtime dependencies
