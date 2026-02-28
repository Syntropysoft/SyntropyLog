import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZodError } from 'zod';
import { SyntropyLog } from '../src/SyntropyLog';
import { LoggerFactory } from '../src/logger/LoggerFactory';
import { ContextManager } from '../src/context/ContextManager';
import { RedisManager } from '../src/redis/RedisManager';
import { HttpManager } from '../src/http/HttpManager';
import { BrokerManager } from '../src/brokers/BrokerManager';

// Use vi.hoisted to make the mockLogger available to the hoisted vi.mock calls.
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    withSource: vi.fn().mockReturnThis(),
    audit: vi.fn(),
  },
}));

// Mock dependencies using regular functions for constructors (Vitest 4 compatibility)
// and returning the shared mockLogger for functional verification.
vi.mock('../src/logger/LoggerFactory', () => {
  return {
    LoggerFactory: vi.fn().mockImplementation(function () {
      return {
        getLogger: vi.fn().mockReturnValue(mockLogger),
        shutdown: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

vi.mock('../src/context/ContextManager', () => {
  return {
    ContextManager: vi.fn().mockImplementation(function () {
      return {
        run: vi.fn((fn: any) => fn()),
        get: vi.fn(),
        set: vi.fn(),
        configure: vi.fn(),
        reconfigureLoggingMatrix: vi.fn(),
        getAll: vi.fn(),
        getFilteredContext: vi.fn(),
        getCorrelationId: vi.fn(),
        getCorrelationIdHeaderName: vi.fn(),
        getTransactionIdHeaderName: vi.fn(),
        getTransactionId: vi.fn(),
        setTransactionId: vi.fn(),
        getTraceContextHeaders: vi.fn(),
      };
    }),
  };
});

vi.mock('../src/redis/RedisManager', () => {
  return {
    RedisManager: vi.fn().mockImplementation(function () {
      return {
        init: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
        getInstance: vi.fn(),
      };
    }),
  };
});

vi.mock('../src/http/HttpManager', () => {
  return {
    HttpManager: vi.fn().mockImplementation(function () {
      return {
        init: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
        getInstance: vi.fn().mockReturnValue({
          instanceName: 'api2',
        }),
      };
    }),
  };
});

vi.mock('../src/brokers/BrokerManager', () => {
  return {
    BrokerManager: vi.fn().mockImplementation(function () {
      return {
        init: vi.fn(),
        shutdown: vi.fn().mockResolvedValue(undefined),
        getInstance: vi.fn(),
      };
    }),
  };
});

describe('SyntropyLog', () => {
  const MockedLoggerFactory = vi.mocked(LoggerFactory);
  const MockedContextManager = vi.mocked(ContextManager);
  const MockedRedisManager = vi.mocked(RedisManager);
  const MockedHttpManager = vi.mocked(HttpManager);
  const MockedBrokerManager = vi.mocked(BrokerManager);

  // Helper to reset the singleton SyntropyLog instance for test isolation.
  const resetSyntropySingleton = () => {
    (SyntropyLog as any).instance = undefined;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetSyntropySingleton();
  });

  afterEach(async () => {
    const syntropy = SyntropyLog.getInstance();
    if (syntropy.getState() === 'READY') {
      await syntropy.shutdown();
    }
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = SyntropyLog.getInstance();
      const instance2 = SyntropyLog.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create a new instance if the singleton is reset', () => {
      const instance1 = SyntropyLog.getInstance();
      resetSyntropySingleton();
      const instance2 = SyntropyLog.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  const validConfig = {
    logger: { serializerTimeoutMs: 50, level: 'info' as const },
    redis: { instances: [] },
    http: { instances: [] },
    brokers: { instances: [] },
  };

  describe('Initialization (init)', () => {

    it('should delegate initialization to LifecycleManager and transition to READY state', async () => {
      const syntropy = SyntropyLog.getInstance();
      const readySpy = vi.fn();
      syntropy.on('ready', readySpy);

      await syntropy.init(validConfig);

      expect(syntropy.getState()).toBe('READY');
      expect(readySpy).toHaveBeenCalledOnce();

      expect(MockedContextManager).toHaveBeenCalledOnce();
      expect(MockedLoggerFactory).toHaveBeenCalledOnce();
      const [configArg, contextArg] = MockedLoggerFactory.mock.calls[0];
      expect(configArg).toMatchObject(validConfig);
      expect(contextArg.run).toBeDefined();
    });

    it('should prevent re-initialization and emit a warning', async () => {
      const syntropy = SyntropyLog.getInstance();
      const readySpy = vi.fn();
      syntropy.on('ready', readySpy);

      await syntropy.init(validConfig);
      await syntropy.init(validConfig); // Second call

      expect(syntropy.getState()).toBe('READY');
      expect(readySpy).toHaveBeenCalledOnce();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "LifecycleManager.init() called while in state 'READY'. Ignoring subsequent call."
      );

      expect(MockedLoggerFactory).toHaveBeenCalledOnce();
      expect(MockedRedisManager).toHaveBeenCalledOnce();
    });

    it('should emit an error and throw if config validation fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
      const syntropy = SyntropyLog.getInstance();
      const errorSpy = vi.fn();
      syntropy.on('error', errorSpy);

      const invalidConfig = { logger: { level: 123 } }; // Invalid level

      await expect(syntropy.init(invalidConfig as any)).rejects.toThrow(ZodError);

      expect(syntropy.getState()).toBe('ERROR');
      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledWith(expect.any(ZodError));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SyntropyLog] Configuration validation failed:',
        expect.anything()
      );

      consoleErrorSpy.mockRestore();
    });

    it('should initialize correctly in silent mode', async () => {
      const syntropy = SyntropyLog.getInstance();
      await syntropy.init({
        logger: { serializerTimeoutMs: 100 },
        redis: { instances: [] },
        http: { instances: [] },
        brokers: { instances: [] },
      });

      expect(syntropy.getState()).toBe('READY');
      expect(MockedLoggerFactory).toHaveBeenCalledOnce();
      expect(MockedRedisManager).toHaveBeenCalledOnce();
    });
  });

  describe('reconfigureLoggingMatrix', () => {
    it('should reconfigure logging matrix when ready', async () => {
      const syntropy = SyntropyLog.getInstance();
      await syntropy.init(validConfig);

      const newMatrix = {
        default: ['correlationId', 'userId'],
        error: ['*']
      };

      expect(() => syntropy.reconfigureLoggingMatrix(newMatrix)).not.toThrow();
    });

    it('should throw error when not ready', () => {
      const syntropy = SyntropyLog.getInstance();

      const newMatrix = {
        default: ['correlationId']
      };

      expect(() => syntropy.reconfigureLoggingMatrix(newMatrix)).toThrow(
        'SyntropyLog is not ready. Current state: \'NOT_INITIALIZED\'. Ensure init() has completed successfully by listening for the \'ready\' event.'
      );
    });

    it('should delegate to context manager', async () => {
      const syntropy = SyntropyLog.getInstance();
      await syntropy.init(validConfig);

      const contextManager = syntropy.getContextManager();
      const reconfigureSpy = vi.spyOn(contextManager, 'reconfigureLoggingMatrix');

      const newMatrix = {
        default: ['correlationId']
      };

      syntropy.reconfigureLoggingMatrix(newMatrix);

      expect(reconfigureSpy).toHaveBeenCalledWith(newMatrix);
    });
  });
});