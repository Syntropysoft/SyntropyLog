import { randomUUID } from 'crypto';

/**
 * Mock implementation of SyntropyLog for testing
 *
 * This mock provides a complete simulation of SyntropyLog functionality
 * without depending on the actual framework state, making tests more reliable
 * and avoiding initialization/shutdown issues.
 *
 * Similar to BeaconRedisMock, this is designed to be flexible and configurable
 * for different testing scenarios.
 */

export interface MockLogger {
  info: (message: string, metadata?: any) => void;
  warn: (message: string, metadata?: any) => void;
  error: (message: string, metadata?: any) => void;
  debug: (message: string, metadata?: any) => void;
  trace: (message: string, metadata?: any) => void;
  fatal: (message: string, metadata?: any) => void;
  withSource: (source: string) => MockLogger;
}

export interface MockContextManager {
  run: <T>(fn: () => Promise<T> | T) => Promise<T>;
  set: (key: string, value: any) => void;
  get: (key: string) => any;
  getCorrelationIdHeaderName: () => string;
  getTransactionIdHeaderName: () => string;
}

export interface MockSyntropyLog {
  init: (config?: any) => Promise<void>;
  shutdown: () => Promise<void>;
  getLogger: (serviceName?: string) => MockLogger;
  getContextManager: () => MockContextManager;
  getHttpManager: () => any;
  getBrokerManager: () => any;
  getSerializationManager: () => any;
}

/**
 * Create a mock logger instance
 */
export function createMockLogger(): MockLogger {
  const logs: Array<{ level: string; message: string; metadata?: any }> = [];

  return {
    info: (message: string, metadata?: any) => {
      logs.push({ level: 'info', message, metadata });
    },
    warn: (message: string, metadata?: any) => {
      logs.push({ level: 'warn', message, metadata });
    },
    error: (message: string, metadata?: any) => {
      logs.push({ level: 'error', message, metadata });
    },
    debug: (message: string, metadata?: any) => {
      logs.push({ level: 'debug', message, metadata });
    },
    trace: (message: string, metadata?: any) => {
      logs.push({ level: 'trace', message, metadata });
    },
    fatal: (message: string, metadata?: any) => {
      logs.push({ level: 'fatal', message, metadata });
    },
    withSource: (source: string) => {
      return createMockLogger(); // Return new instance with source context
    },
  };
}

/**
 * Create a mock context manager instance
 */
export function createMockContextManager(): MockContextManager {
  const context: Record<string, any> = {};

  return {
    run: async <T>(fn: () => Promise<T> | T): Promise<T> => {
      // Simulate context execution
      const correlationId = randomUUID();
      const transactionId = randomUUID();

      // Set default context values
      context['x-correlation-id'] = correlationId;
      context['x-transaction-id'] = transactionId;
      context['x-correlation-id-test'] = correlationId;

      // Execute the function with context
      return await fn();
    },
    set: (key: string, value: any) => {
      context[key] = value;
    },
    get: (key: string) => {
      return context[key] || null;
    },
    getCorrelationIdHeaderName: () => 'x-correlation-id',
    getTransactionIdHeaderName: () => 'x-transaction-id',
  };
}

/**
 * Create a mock HTTP manager instance
 */
export function createMockHttpManager() {
  return {
    createClient: () => ({
      get: async () => ({ data: {} }),
      post: async () => ({ data: {} }),
      put: async () => ({ data: {} }),
      delete: async () => ({ data: {} }),
    }),
  };
}

/**
 * Create a mock broker manager instance
 */
export function createMockBrokerManager() {
  return {
    createClient: () => ({
      publish: async () => undefined,
      subscribe: async () => undefined,
    }),
  };
}

/**
 * Create a mock serialization manager instance
 */
export function createMockSerializationManager() {
  return {
    serialize: async () => '{}',
    deserialize: async () => ({}),
  };
}

// Global mock instances
let mockLogger: MockLogger;
let mockContextManager: MockContextManager;
let mockHttpManager: any;
let mockBrokerManager: any;
let mockSerializationManager: any;

/**
 * Get or create mock logger instance
 */
export function getMockLogger(): MockLogger {
  if (!mockLogger) {
    mockLogger = createMockLogger();
  }
  return mockLogger;
}

/**
 * Get or create mock context manager instance
 */
export function getMockContextManager(): MockContextManager {
  if (!mockContextManager) {
    mockContextManager = createMockContextManager();
  }
  return mockContextManager;
}

/**
 * Get or create mock HTTP manager instance
 */
export function getMockHttpManager() {
  if (!mockHttpManager) {
    mockHttpManager = createMockHttpManager();
  }
  return mockHttpManager;
}

/**
 * Get or create mock broker manager instance
 */
export function getMockBrokerManager() {
  if (!mockBrokerManager) {
    mockBrokerManager = createMockBrokerManager();
  }
  return mockBrokerManager;
}

/**
 * Get or create mock serialization manager instance
 */
export function getMockSerializationManager() {
  if (!mockSerializationManager) {
    mockSerializationManager = createMockSerializationManager();
  }
  return mockSerializationManager;
}

/**
 * Create a complete mock of SyntropyLog
 *
 * @param spyFn - Optional spy function for framework compatibility (vi.fn, jest.fn, etc.)
 */
export function createSyntropyLogMock(
  spyFn?: (implementation?: any) => any
): MockSyntropyLog {
  const createMock = (implementation?: any) => {
    if (spyFn) {
      return spyFn(implementation);
    }
    // Fallback to simple function if no spy provided
    return implementation || (() => undefined);
  };

  return {
    init: createMock(async () => undefined),
    shutdown: createMock(async () => undefined),
    getLogger: createMock(() => getMockLogger()),
    getContextManager: createMock(() => getMockContextManager()),
    getHttpManager: createMock(() => getMockHttpManager()),
    getBrokerManager: createMock(() => getMockBrokerManager()),
    getSerializationManager: createMock(() => getMockSerializationManager()),
  };
}

/**
 * Reset all mock instances
 */
export function resetSyntropyLogMocks() {
  mockLogger = undefined as any;
  mockContextManager = undefined as any;
  mockHttpManager = undefined as any;
  mockBrokerManager = undefined as any;
  mockSerializationManager = undefined as any;
}
