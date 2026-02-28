# Testing Guide

SyntropyLog is designed to make testing easier by removing the need for complex connection management and boilerplate in your unit tests.

## Zero Boilerplate Testing

Use the built-in testing helper to inject mocks into your services without needing to initialize or shutdown actual connections.

```typescript
import { createTestHelper } from 'syntropylog/testing';
const testHelper = createTestHelper();

describe('MyService', () => {
  beforeEach(() => {
    testHelper.beforeEach(); // Resets all mocks automatically
  });

  it('works', () => {
    const service = new MyService(testHelper.mockSyntropyLog);
    // ...
  });
});
```

## Benefits
- **No Connection Boilerplate**: No need for `init()` or `shutdown()` in your test files.
- **Lightning Fast**: All operations run in-memory using highly optimized mocks.
- **Assertion Ready**: Easily verify that your services are logging the correct information and using Redis/HTTP resources as expected.
