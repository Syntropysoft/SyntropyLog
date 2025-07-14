import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZodError, ZodIssueCode } from 'zod';

// Mock dependencies BEFORE importing the module under test

// Use `vi.hoisted` to create variables that are available inside `vi.mock` factories.
// This solves the ReferenceError because the factory is hoisted along with the mocks.
const {
  mockGetLogger,
  mockFlushAllTransports,
  mockGetRedisInstance,
  mockRedisShutdown,
  mockGetHttpInstance,
  mockHttpShutdown,
  mockGetBrokerInstance,
  mockBrokerShutdown,
  mockSanitizeConfig,
  mockCheckPeerDependencies,
  mockConfigParse,
} = vi.hoisted(() => ({
  mockGetLogger: vi.fn(),
  mockFlushAllTransports: vi.fn().mockResolvedValue(undefined),
  mockGetRedisInstance: vi.fn(),
  mockRedisShutdown: vi.fn().mockResolvedValue(undefined),
  mockGetHttpInstance: vi.fn(),
  mockHttpShutdown: vi.fn().mockResolvedValue(undefined),
  mockGetBrokerInstance: vi.fn(),
  mockBrokerShutdown: vi.fn().mockResolvedValue(undefined),
  mockSanitizeConfig: vi.fn((config) => config),
  mockCheckPeerDependencies: vi.fn(),
  mockConfigParse: vi.fn(),
}));

const { mockGetAllFromContext, MockContextManager } = vi.hoisted(() => {
  const mockGetAll = vi.fn();
  return {
    mockGetAllFromContext: mockGetAll,
    MockContextManager: vi.fn(() => ({
      getAll: mockGetAll,
      configure: vi.fn(),
    })),
  };
});

vi.mock('../src/logger/LoggerFactory', () => ({
  LoggerFactory: vi.fn().mockImplementation(() => ({
    getLogger: mockGetLogger,
    flushAllTransports: mockFlushAllTransports,
  })),
}));

vi.mock('../src/redis/RedisManager', () => ({
  RedisManager: vi.fn().mockImplementation(() => ({
    getInstance: mockGetRedisInstance,
    shutdown: mockRedisShutdown,
  })),
}));

vi.mock('../src/http/HttpManager', () => ({
  HttpManager: vi.fn().mockImplementation(() => ({
    getInstance: mockGetHttpInstance,
    shutdown: mockHttpShutdown,
  })),
}));

vi.mock('../src/brokers/BrokerManager', () => ({
  BrokerManager: vi.fn().mockImplementation(() => ({
    getInstance: mockGetBrokerInstance,
    shutdown: mockBrokerShutdown,
  })),
}));

vi.mock('../src/context/ContextManager', () => ({
  ContextManager: MockContextManager,
}));

vi.mock('../src/utils/sanitizeConfig', () => ({
  sanitizeConfig: mockSanitizeConfig,
}));

vi.mock('../src/utils/dependencyCheck', () => ({
  checkPeerDependencies: mockCheckPeerDependencies,
}));

vi.mock('../src/config.schema', () => ({
  syntropyLogConfigSchema: {
    parse: mockConfigParse,
  },
}));

// Now import the module to be tested
import { SyntropyLog } from '../src/SyntropyLog';
import { syntropyLogConfigSchema } from '../src/config.schema';

// Helper to reset the singleton instance for test isolation
function resetSyntropyLogSingleton() {
  (SyntropyLog as any).instance = undefined;
}

describe('SyntropyLog', () => {
  let syntropyLog: SyntropyLog;
  const validConfig = { logger: { level: 'info' } };

  beforeEach(() => {
    vi.clearAllMocks();
    resetSyntropyLogSingleton();
    syntropyLog = SyntropyLog.getInstance();

    // Default mock implementations for happy paths
    // The default mock for parse should be a pass-through to allow testing different configs.
    mockConfigParse.mockImplementation((config) => config);

    mockGetLogger.mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      // Add missing log methods to the mock to support all log levels
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls to getInstance()', () => {
      const instance1 = SyntropyLog.getInstance();
      const instance2 = SyntropyLog.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Initialization (init)', () => {
    it('should initialize successfully with a valid configuration', async () => {
      await syntropyLog.init(validConfig as any);

      expect(syntropyLogConfigSchema.parse).toHaveBeenCalledWith(validConfig);
      expect(mockSanitizeConfig).toHaveBeenCalledWith(validConfig);
      expect(mockGetLogger).toHaveBeenCalledWith('syntropylog-main');
      expect((syntropyLog as any)._isInitialized).toBe(true);
    });

    it('should throw and log an error if config validation fails', async () => {
      const validationError = new ZodError([
        {
          code: ZodIssueCode.invalid_type,
          path: ['logger', 'level'],
          expected: 'string',
          received: 'number',
          message: 'Invalid type',
        },
      ]);
      mockConfigParse.mockImplementation(() => {
        throw validationError;
      });
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(syntropyLog.init({} as any)).rejects.toThrow(
        validationError
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SyntropyLog] Configuration validation failed:',
        validationError.errors
      );
      expect((syntropyLog as any)._isInitialized).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('should warn and return if already initialized', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      await syntropyLog.init(validConfig as any);
      // Reset mock call counts to test the second call in isolation
      vi.clearAllMocks();

      await syntropyLog.init(validConfig as any);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[SyntropyLog] Warning: Framework has already been initialized. Ignoring subsequent init() call.'
      );
      // Ensure no re-initialization logic was run
      expect(syntropyLogConfigSchema.parse).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Accessors', () => {
    const uninitializedError =
      'SyntropyLog has not been initialized. Call init() before accessing clients or loggers.';

    it.each([
      ['getLogger', () => syntropyLog.getLogger('test')],
      ['getRedis', () => syntropyLog.getRedis('test')],
      ['getHttp', () => syntropyLog.getHttp('test')],
      ['getBroker', () => syntropyLog.getBroker('test')],
      ['getContextManager', () => syntropyLog.getContextManager()],
    ])('%s should throw if not initialized', (name, accessorCall) => {
      expect(accessorCall).toThrow(uninitializedError);
    });

    it('should return instances after initialization', async () => {
      await syntropyLog.init(validConfig as any);

      syntropyLog.getLogger('my-logger');
      expect(mockGetLogger).toHaveBeenCalledWith('my-logger');

      syntropyLog.getRedis('my-redis');
      expect(mockGetRedisInstance).toHaveBeenCalledWith('my-redis');

      syntropyLog.getHttp('my-http');
      expect(mockGetHttpInstance).toHaveBeenCalledWith('my-http');

      syntropyLog.getBroker('my-broker');
      expect(mockGetBrokerInstance).toHaveBeenCalledWith('my-broker');

      const contextManager = syntropyLog.getContextManager();
      expect(contextManager).toBeDefined();
    });
  });

  describe('getFilteredContext', () => {
    const fullContext = {
      correlationId: 'test-corr-id',
      transactionId: 'test-trans-id',
      userId: 123,
      sensitiveData: 'secret',
    };

    beforeEach(() => {
      // For these tests, we need to reset the singleton state before each run
      // to ensure we can test different `init` configurations.
      syntropyLog._resetForTesting();
      // We also need to mock the value returned by the (mocked) ContextManager.
      mockGetAllFromContext.mockReturnValue(fullContext);
    });

    it('should return the full context if loggingMatrix is not defined', async () => {
      // This test relies on the default init from beforeEach which has no matrix.
      await syntropyLog.init({ logger: {} });
      const result = syntropyLog.getFilteredContext('info');
      expect(result).toEqual(fullContext);
    });

    it('should return an empty object if no rules apply', async () => {
      await syntropyLog.init({
        loggingMatrix: { error: ['*'] }, // No 'default' or 'info' rule
      });
      const result = syntropyLog.getFilteredContext('info');
      expect(result).toEqual({});
    });

    it('should use the default rule if no level-specific rule exists', async () => {
      await syntropyLog.init({
        loggingMatrix: { default: ['correlationId', 'userId'] },
      });
      const result = syntropyLog.getFilteredContext('info');
      expect(result).toEqual({
        correlationId: 'test-corr-id',
        userId: 123,
      });
    });

    it('should use the level-specific rule over the default rule', async () => {
      await syntropyLog.init({
        loggingMatrix: {
          default: ['correlationId'],
          error: ['correlationId', 'transactionId'],
        },
      });
      const result = syntropyLog.getFilteredContext('error');
      expect(result).toEqual({
        correlationId: 'test-corr-id',
        transactionId: 'test-trans-id',
      });
    });

    it('should return the full context for wildcard rule', async () => {
      await syntropyLog.init({
        loggingMatrix: {
          default: ['correlationId'],
          warn: ['*'],
        },
      });
      const result = syntropyLog.getFilteredContext('warn');
      expect(result).toEqual(fullContext);
    });

    it('should ignore non-existent fields in the rule', async () => {
      await syntropyLog.init({
        loggingMatrix: {
          default: ['correlationId', 'nonExistentField'],
        },
      });
      const result = syntropyLog.getFilteredContext('debug');
      expect(result).toEqual({
        correlationId: 'test-corr-id',
      });
    });
  });

  describe('Shutdown', () => {
    it('should not do anything if not initialized', async () => {
      await syntropyLog.shutdown();
      expect(mockGetLogger).not.toHaveBeenCalled();
    });

    it('should call shutdown on managers and flush transports', async () => {
      await syntropyLog.init(validConfig as any);
      await syntropyLog.shutdown();

      expect(mockRedisShutdown).toHaveBeenCalled();
      expect(mockHttpShutdown).toHaveBeenCalled();
      expect(mockBrokerShutdown).toHaveBeenCalled();
      expect(mockFlushAllTransports).toHaveBeenCalled();
      expect((syntropyLog as any)._isInitialized).toBe(false);
    });
  });
});