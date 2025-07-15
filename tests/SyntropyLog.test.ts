import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZodError } from 'zod';
import { SyntropyLog } from '../src/SyntropyLog';
import { LoggerFactory } from '../src/logger/LoggerFactory';
import { ContextManager } from '../src/context/ContextManager';
import { RedisManager } from '../src/redis/RedisManager';
import { HttpManager } from '../src/http/HttpManager';
import { BrokerManager } from '../src/brokers/BrokerManager';
import { LifecycleManager } from '../src/core/LifecycleManager';

// Mock dependencies that are external or have complex side effects.
// We want to test SyntropyLog's orchestration, not the leaf-node implementation.
vi.mock('../src/logger/LoggerFactory');
vi.mock('../src/context/ContextManager');
vi.mock('../src/redis/RedisManager');
vi.mock('../src/http/HttpManager');
vi.mock('../src/brokers/BrokerManager');

// We do NOT mock LifecycleManager, as we want to test the interaction
// between SyntropyLog (the facade) and the core lifecycle logic.

describe('SyntropyLog', () => {
  // Use vi.mocked to get typed mock instances
  const MockedLoggerFactory = vi.mocked(LoggerFactory);
  const MockedContextManager = vi.mocked(ContextManager);
  const MockedRedisManager = vi.mocked(RedisManager);
  const MockedHttpManager = vi.mocked(HttpManager);
  const MockedBrokerManager = vi.mocked(BrokerManager);

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    withSource: vi.fn().mockReturnThis(),
  };

  // Helper to reset the singleton SyntropyLog instance for test isolation.
  const resetSyntropySingleton = () => {
    (SyntropyLog as any).instance = undefined;
  };

  beforeEach(() => {
    // Reset mocks and the singleton before each test to ensure isolation.
    vi.clearAllMocks();
    resetSyntropySingleton();
    // Ensure the mocked logger factory returns our mock logger
    MockedLoggerFactory.prototype.getLogger.mockReturnValue(mockLogger);
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

  describe('Initialization (init)', () => {
    const validConfig = {
      logger: { serializerTimeoutMs: 50, level: 'info' },
      redis: { instances: [] },
      http: { instances: [] },
      brokers: { instances: [] },
    };

    it('should delegate initialization to LifecycleManager and transition to READY state', async () => {
      const syntropy = SyntropyLog.getInstance();
      
      // We expect the 'ready' event to be emitted upon successful initialization.
      const readySpy = vi.fn();
      syntropy.on('ready', readySpy);

      await syntropy.init(validConfig);

      // 1. Verify that the facade's state is correct.
      expect(syntropy.getState()).toBe('READY');
      expect(readySpy).toHaveBeenCalledOnce();

      // 2. Verify that the core components (now inside LifecycleManager) were instantiated.
      // This confirms that LifecycleManager did its job.
      expect(MockedContextManager).toHaveBeenCalledOnce();
      expect(MockedLoggerFactory).toHaveBeenCalledOnce();
      expect(MockedRedisManager).toHaveBeenCalledOnce();
      expect(MockedHttpManager).toHaveBeenCalledOnce();
      expect(MockedBrokerManager).toHaveBeenCalledOnce();

      // 3. Verify that dependencies were injected correctly into a manager (e.g., LoggerFactory).
      // The constructor now receives the config, context manager, and the facade itself.
      expect(MockedLoggerFactory).toHaveBeenCalledWith(
        expect.objectContaining(validConfig), // config
        expect.any(MockedContextManager), // contextManager
        syntropy, // facade
      );
    });

    it('should prevent re-initialization and emit a warning', async () => {
      const syntropy = SyntropyLog.getInstance();
      const readySpy = vi.fn();
      syntropy.on('ready', readySpy);

      await syntropy.init(validConfig);
      await syntropy.init(validConfig); // Second call

      expect(syntropy.getState()).toBe('READY');
      expect(readySpy).toHaveBeenCalledOnce(); // Should not be called again
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "LifecycleManager.init() called while in state 'READY'. Ignoring subsequent call."
      );

      // Ensure managers' constructors were not called a second time
      expect(MockedLoggerFactory).toHaveBeenCalledOnce();
      expect(MockedRedisManager).toHaveBeenCalledOnce();
    });

    it('should emit an error and throw if config validation fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
        expect.any(Array), // ZodError.errors is an array, not the error object itself
      );

      consoleErrorSpy.mockRestore();
    });

    it('should initialize correctly in silent mode', async () => {
      const syntropy = SyntropyLog.getInstance();
      await syntropy.init({
        silent: true,
        logger: { serializerTimeoutMs: 100 },
        redis: { instances: [] },
        http: { instances: [] },
        brokers: { instances: [] },
      });

      expect(syntropy.getState()).toBe('READY');
      // The factory is always created; it's responsible for not creating transports.
      expect(MockedLoggerFactory).toHaveBeenCalledOnce();
      // Other managers should also be initialized.
      expect(MockedRedisManager).toHaveBeenCalledOnce();
    });
  });

  // TODO: Refactor the rest of the tests (Accessors, Shutdown, etc.)
  // using the same principles: minimal mocking, testing real interactions.
});