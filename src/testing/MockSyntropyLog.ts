/**
 * MockSyntropyLog - Framework Agnostic Mock
 * 
 * This mock provides a testing-agnostic version of SyntropyLog
 * that can be used with both Vitest and Jest without conflicts.
 */

export interface IMockLogger {
  info: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  trace: (...args: any[]) => void;
}

export interface IMockContextManager {
  getCorrelationId: () => string;
  getTransactionId: () => string;
  getCorrelationIdHeaderName: () => string;
  setCorrelationId: (id: string) => void;
  setTransactionId: (id: string) => void;
  set: (key: string, value: any) => void;
  clear: () => void;
  run: <T>(fn: () => Promise<T> | T) => Promise<T>;
}

export interface IMockSyntropyLog {
  getLogger: (name?: string) => IMockLogger;
  getContextManager: () => IMockContextManager;
  init: (config?: any) => Promise<void>;
  shutdown: () => Promise<void>;
  reset: () => void;
}

/**
 * Creates a mock function that works with both Vitest and Jest
 */
function createMockFn<T = any>(implementation?: (...args: any[]) => T) {
  const mockFn = (...args: any[]) => {
    if (implementation) {
      return implementation(...args);
    }
    return undefined;
  };
  
  // Add mock properties for compatibility
  (mockFn as any).mockClear = () => {};
  (mockFn as any).mockReset = () => {};
  (mockFn as any).mockImplementation = (impl: (...args: any[]) => T) => {
    return createMockFn(impl);
  };
  (mockFn as any).mockReturnValue = (value: T) => {
    return createMockFn(() => value);
  };
  
  return mockFn;
}

export class MockSyntropyLog implements IMockSyntropyLog {
  private logger: IMockLogger;
  private contextManager: IMockContextManager;

  constructor() {
    this.logger = {
      info: createMockFn(),
      error: createMockFn(),
      warn: createMockFn(),
      debug: createMockFn(),
      trace: createMockFn()
    };

    this.contextManager = {
      getCorrelationId: createMockFn(() => 'mock-correlation-id') as any,
      getTransactionId: createMockFn(() => 'mock-transaction-id') as any,
      getCorrelationIdHeaderName: createMockFn(() => 'x-correlation-id') as any,
      setCorrelationId: createMockFn(),
      setTransactionId: createMockFn(),
      set: createMockFn(),
      clear: createMockFn(),
      run: createMockFn(async (fn: () => Promise<any> | any) => {
        return await fn();
      }) as any
    };
  }

  getLogger(name?: string): IMockLogger {
    return this.logger;
  }

  getContextManager(): IMockContextManager {
    return this.contextManager;
  }

  init(config?: any): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  reset(): void {
    // Clear all mock functions
    Object.values(this.logger).forEach(fn => {
      if (typeof fn === 'function' && (fn as any).mockClear) {
        (fn as any).mockClear();
      }
    });

    Object.values(this.contextManager).forEach(fn => {
      if (typeof fn === 'function' && (fn as any).mockClear) {
        (fn as any).mockClear();
      }
    });
  }
}

/**
 * Creates a test helper that works with any testing framework
 */
export function createTestHelper() {
  const mockSyntropyLog = new MockSyntropyLog();

  return {
    mockSyntropyLog,
    beforeEach: () => {
      mockSyntropyLog.reset();
    }
  };
} 