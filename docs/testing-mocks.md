# Testing: Mocks and Public API

This document clarifies what to use when testing code that depends on SyntropyLog and how the mocks are organized.

---

## Public Testing API (Recommended)

**Entry point:** `syntropylog/testing` or `syntropylog/testing/mock`.

**Use:** **SyntropyLogMock** — factory and helpers to replace the singleton and services in tests.

| Export | Usage |
|--------|-------|
| `createSyntropyLogMock(spyFn?)` | Creates a mock of the SyntropyLog facade with getLogger, getSerializer, etc. |
| `createMockLogger()` | Mock logger with spyable methods (info, warn, error, …). |
| `createMockContextManager()` | Mock context manager. |
| `createMockSerializationManager()` | Mock serialization manager. |
| `getMockLogger()` / `getMockContextManager()` / `getMockSerializationManager()` | Access to current mock instances (test singleton). |
| `resetSyntropyLogMocks()` | Resets mocks; call in `beforeEach` for a clean state. |
| `createTestHelper(spyFn?)` | Helper that combines `createSyntropyLogMock` and `resetSyntropyLogMocks` in beforeEach. |
| `createServiceWithMock(ServiceClass, spyFn?)` | Creates a service instance injecting the SyntropyLog mock. |

**Example:**

```ts
import {
  createSyntropyLogMock,
  resetSyntropyLogMocks,
  getMockLogger,
} from 'syntropylog/testing';

beforeEach(() => {
  resetSyntropyLogMocks();
  createSyntropyLogMock();
});

it('should log when service runs', () => {
  const logger = getMockLogger();
  // ... run code that uses syntropyLog.getLogger('x') ...
  expect(logger.info).toHaveBeenCalledWith('expected message');
});
```

---

## MockSyntropyLog (class, internal use — prefer SyntropyLogMock)

The codebase also contains **MockSyntropyLog** (class in `src/testing/MockSyntropyLog.ts`). It is a **test-framework-agnostic** mock: it has no dependency on Vitest/Jest, only on the facade interface.

- **Not exported** from `syntropylog/testing` (the public index only exports SyntropyLogMock and the test-helper helpers).
- **Internal / deprecated for new tests:** for new tests, use **SyntropyLogMock** and `createSyntropyLogMock()` from `syntropylog/testing`. MockSyntropyLog is kept for tests that already use it or for cases requiring a mock with no runner dependency.
- Used in `tests/testing/MockSyntropyLog.test.ts` to test the class itself.
- If you need a mock with no Vitest dependency, you can import it from the source path (`src/testing/MockSyntropyLog`); for most tests, use **SyntropyLogMock** and `createSyntropyLogMock()`.

---

## Summary

| Need | Use |
|------|-----|
| Mock SyntropyLog in tests (Vitest/Jest, etc.) | **SyntropyLogMock**: `createSyntropyLogMock()`, `resetSyntropyLogMocks()`, `getMockLogger()`, etc. from `syntropylog/testing`. |
| Setup helper (beforeEach + mock) | `createTestHelper` and/or `createServiceWithMock` from `syntropylog/testing`. |
| Mock with no test runner dependency | `MockSyntropyLog` class from `src/testing/MockSyntropyLog` (internal or advanced use). |

The **recommended public API** is **SyntropyLogMock**; the **createTestHelper** to use is the one from `test-helper.ts`, exported in `syntropylog/testing`.
