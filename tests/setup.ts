import { beforeAll, vi } from 'vitest';

// Mock regex-test globally to avoid spawning child processes during tests
vi.mock('regex-test', () => {
  return {
    default: class MockRegexTest {
      constructor() {}
      test(regex: RegExp, input: string) {
        return Promise.resolve(regex.test(input));
      }
      cleanWorker() {}
    },
  };
});

beforeAll(() => {
  // Increase max listeners for tests to avoid noise from multiple initializations
  // This is necessary because SyntropyLog is a singleton that gets reset/re-initialized
  // multiple times during tests, which can accumulate listeners on global objects like process.
  // In production, only one instance exists, so this is not a memory leak.
  process.setMaxListeners(30);
});
