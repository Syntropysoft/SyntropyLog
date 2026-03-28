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

- [ ] **`src/internal-types.ts`**
  - [ ] Remove `[key: string]: ContextValue` index signature from `ContextConfig`
  - [ ] Add `inbound?: Record<string, Record<string, string>>`
  - [ ] Add `outbound?: Record<string, Record<string, string>>`
  - [ ] Add `correlationField?: string`
  - [ ] Add `customHeaders?: string[]`

- [ ] **`src/config.schema.ts`**
  - [ ] Remove `[key: string]: string | undefined` index signature from `ContextConfig`
  - [ ] Add same four fields as above

### Phase 2 — Validation

- [ ] **`src/config/config.validator.ts`**
  - [ ] Add `inbound: optional(recordOf(recordOf(isString)))` to `validateContext`
  - [ ] Add `outbound: optional(recordOf(recordOf(isString)))` to `validateContext`
  - [ ] Add `correlationField: optional(isString)` to `validateContext`
  - [ ] Add `customHeaders: optional(arrayOf(isString))` to `validateContext`

### Phase 3 — Interface

- [ ] **`src/context/IContextManager.ts`**
  - [ ] Add `getPropagationHeaders(target?: string): ContextHeaders`
  - [ ] Add `getOutboundHeaderName(field: string, target?: string): string | undefined`

### Phase 4 — Core implementation

- [ ] **`src/context/ContextManager.ts`**
  - [ ] Add private fields: `inbound`, `outbound`, `correlationField`
  - [ ] Update `configure()` to read `inbound`, `outbound`, `correlationField`
  - [ ] Implement `getPropagationHeaders(target?)`
  - [ ] Implement `getOutboundHeaderName(field, target?)`

### Phase 5 — Mock

- [ ] **`src/context/MockContextManager.ts`**
  - [ ] Add private fields: `inbound`, `outbound`, `correlationField`
  - [ ] Update `configure()` to read new fields
  - [ ] Implement `getPropagationHeaders(target?)`
  - [ ] Implement `getOutboundHeaderName(field, target?)`

### Phase 6 — Helper function

- [ ] **`src/context/extractInboundContext.ts`** ← new file
  - [ ] Pure function signature: `extractInboundContext(headers, source, config): Record<string, string>`
  - [ ] `.toLowerCase()` on wire name when reading headers
  - [ ] Auto-generate UUID for `correlationField` when absent
  - [ ] Return empty object if source not found in inbound map

### Phase 7 — Exports

- [ ] **`src/SyntropyLog.ts`** (or `src/index.ts`)
  - [ ] Export `extractInboundContext`
  - [ ] Verify `getPropagationHeaders` is accessible via `syntropyLog.contextManager`

### Phase 8 — Tests

- [ ] **`tests/context/ContextManager.test.ts`**
  - [ ] `configure()` — accepts new fields without breaking old tests
  - [ ] `getPropagationHeaders()` — no arg uses 'http' target
  - [ ] `getPropagationHeaders('kafka')` — uses kafka target
  - [ ] `getPropagationHeaders('unknown')` — returns `{}`
  - [ ] `getPropagationHeaders()` — only includes fields present in context
  - [ ] `getPropagationHeaders()` — returns `{}` when outside context
  - [ ] `getPropagationHeaders()` — returns `{}` when outbound not configured (legacy mode)
  - [ ] `getOutboundHeaderName(field)` — returns http wire name
  - [ ] `getOutboundHeaderName(field, 'kafka')` — returns kafka wire name
  - [ ] `getOutboundHeaderName(field, 'unknown')` — returns `undefined`
  - [ ] All existing tests still pass (no regressions)

- [ ] **`tests/context/extractInboundContext.test.ts`** ← new file
  - [ ] Extracts fields using inbound map for the given source
  - [ ] Lowercases wire names when reading headers
  - [ ] Auto-generates UUID for correlationField when header absent
  - [ ] Does NOT auto-generate for other fields
  - [ ] Returns `{}` when source not in inbound map
  - [ ] Handles `customHeaders` passthrough (lowercase key)

### Phase 9 — Release

- [ ] All existing tests pass (`npm test`)
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] Bump version to `1.0.0-rc.2` in `package.json`
- [ ] Update CHANGELOG

---

## Invariants — must hold throughout

- `getTraceContextHeaders()` behaviour unchanged
- `getCorrelationId()` behaviour unchanged
- `getCorrelationIdHeaderName()` behaviour unchanged
- `getTransactionId()` / `setTransactionId()` behaviour unchanged
- `configure({ correlationIdHeader: 'X-Foo' })` still works
- `run()`, `get()`, `set()`, `getAll()`, `getFilteredContext()` untouched
- No new runtime dependencies
