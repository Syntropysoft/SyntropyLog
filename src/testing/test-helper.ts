import {
  createSyntropyLogMock,
  resetSyntropyLogMocks,
} from './SyntropyLogMock';

/**
 * Test helper for SyntropyLog applications
 *
 * This helper provides a simple way to set up tests with SyntropyLog mocks
 * without dealing with initialization/shutdown issues.
 */

export interface TestHelper {
  mockSyntropyLog: any;
  beforeEach: () => void;
  afterEach: () => void;
}

/**
 * Create a test helper for SyntropyLog testing
 *
 * @param spyFn - Optional spy function for framework compatibility (vi.fn, jest.fn, etc.)
 *
 * @example
 * ```typescript
 * // For Vitest
 * const testHelper = createTestHelper(vi.fn);
 *
 * // For Jest
 * const testHelper = createTestHelper(jest.fn);
 *
 * // For Jasmine
 * const testHelper = createTestHelper(jasmine.createSpy);
 *
 * // Without spy (basic functionality only)
 * const testHelper = createTestHelper();
 *
 * describe('MyService', () => {
 *   beforeEach(() => testHelper.beforeEach());
 *   afterEach(() => testHelper.afterEach());
 *
 *   it('should work', () => {
 *     const service = new MyService(testHelper.mockSyntropyLog);
 *     // ... test logic
 *   });
 * });
 * ```
 */
export function createTestHelper(
  spyFn?: (implementation?: any) => any
): TestHelper {
  const mockSyntropyLog = createSyntropyLogMock(spyFn);

  return {
    mockSyntropyLog,
    beforeEach: () => {
      resetSyntropyLogMocks();
    },
    afterEach: () => {
      // Clean up if needed
    },
  };
}

/**
 * Create a service with SyntropyLog mock for testing
 *
 * @param ServiceClass - The service class to instantiate
 * @param mockSyntropyLog - The mock SyntropyLog instance
 * @returns Instance of the service with mock injected
 *
 * @example
 * ```typescript
 * const mockSyntropyLog = createSyntropyLogMock();
 * const userService = createServiceWithMock(UserService, mockSyntropyLog);
 * ```
 */
export function createServiceWithMock<T>(
  ServiceClass: new (syntropyLog?: any) => T,
  mockSyntropyLog: any
): T {
  return new ServiceClass(mockSyntropyLog);
}
