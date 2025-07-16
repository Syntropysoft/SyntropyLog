/**
 * FILE: tests/redis/RedisManager.test.ts
 * DESCRIPTION: Unit tests for the RedisManager class.
 *
 * This test suite has been refactored to align with the current architecture where
 * RedisManager is responsible for creating and managing RedisConnectionManager instances,
 * not BeaconRedis instances directly.
 */
import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import { RedisManager } from '../../src/redis/RedisManager';
import { ILogger } from '../../src/logger/ILogger';
import { IContextManager } from '../../src/context';
import { SyntropyRedisConfig } from '../../src/config';
import { RedisConnectionManager } from '../../src/redis/RedisConnectionManager';

// --- Mocks ---
vi.mock('../../src/redis/RedisConnectionManager', () => ({
  RedisConnectionManager: vi.fn(),
}));

const createMockLogger = (): ILogger => ({
  trace: vi.fn() as any,
  debug: vi.fn() as any,
  info: vi.fn() as any,
  warn: vi.fn() as any,
  error: vi.fn() as any,
  fatal: vi.fn() as any,
  child: vi.fn().mockReturnThis(),
  withSource: vi.fn().mockReturnThis(),
  level: 'info',
  setLevel: vi.fn(),
  withRetention: vi.fn().mockReturnThis(),
  withTransactionId: vi.fn().mockReturnThis(),
});

const createMockContextManager = (): IContextManager => ({
  run: vi.fn((fn: () => void | Promise<void>) => Promise.resolve(fn())),
  get: vi.fn(),
  set: vi.fn(),
  configure: vi.fn(),
  getFilteredContext: vi.fn(),
  getAll: vi.fn(),
  getCorrelationId: vi.fn(),
  getCorrelationIdHeaderName: vi.fn(),
  getTransactionIdHeaderName: vi.fn(),
  getTransactionId: vi.fn(),
  setTransactionId: vi.fn(),
  getTraceContextHeaders: vi.fn(),
});

describe('RedisManager', () => {
  let mockLogger: ILogger;
  let mockContextManager: IContextManager;
  let redisConfig: SyntropyRedisConfig;
  let MockedConnectionManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    mockContextManager = createMockContextManager();
    redisConfig = { instances: [] };
    MockedConnectionManager = vi.mocked(RedisConnectionManager);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize empty and log a trace message if no config is provided', () => {
      const manager = new RedisManager({ instances: [] }, mockLogger, mockContextManager);
      manager.init();
      expect(mockLogger.trace).toHaveBeenCalledWith('No Redis instances to initialize.');
      expect(MockedConnectionManager).not.toHaveBeenCalled();
    });

    it('should create RedisConnectionManager instances for each config entry', () => {
      redisConfig.instances = [
        { instanceName: 'instance-1', mode: 'single', url: 'redis://a' },
        { instanceName: 'instance-2', mode: 'single', url: 'redis://b' },
      ];
      const manager = new RedisManager(redisConfig, mockLogger, mockContextManager);
      manager.init();

      expect(MockedConnectionManager).toHaveBeenCalledTimes(2);
      expect(MockedConnectionManager).toHaveBeenCalledWith(
        redisConfig.instances[0],
        expect.anything(),
      );
      expect(MockedConnectionManager).toHaveBeenCalledWith(
        redisConfig.instances[1],
        expect.anything(),
      );
    });

    it('should set the default instance based on the "default" config property', () => {
        redisConfig.instances = [
            { instanceName: 'redis-1', mode: 'single', url: 'redis://a' },
            { instanceName: 'redis-2', mode: 'single', url: 'redis://b' },
        ];
        redisConfig.default = 'redis-2';

        const mockInstance1 = { instanceName: 'redis-1' };
        const mockInstance2 = { instanceName: 'redis-2' };
        MockedConnectionManager
            .mockReturnValueOnce(mockInstance1 as any)
            .mockReturnValueOnce(mockInstance2 as any);

        const manager = new RedisManager(redisConfig, mockLogger, mockContextManager);
        manager.init();
        const instance = manager.getInstance();
        expect(instance.instanceName).toBe('redis-2');
    });
  });

  describe('Instance Retrieval', () => {
    it('should return the correct instance when a valid name is provided', () => {
      const mockInstance = { instanceName: 'my-redis' };
      MockedConnectionManager.mockReturnValueOnce(mockInstance as any);
      redisConfig.instances = [
        { instanceName: 'my-redis', mode: 'single', url: 'redis://a' },
      ];
      
      const manager = new RedisManager(redisConfig, mockLogger, mockContextManager);
      manager.init();
      const instance = manager.getInstance('my-redis');
      expect(instance.instanceName).toBe('my-redis');
    });

    it('should throw an error if the instance name is not found', () => {
      const manager = new RedisManager({ instances: [] }, mockLogger, mockContextManager);
      manager.init();
      expect(() => manager.getInstance('non-existent')).toThrow(
        'Redis instance with name "non-existent" was not found.',
      );
    });
  });

  describe('Lifecycle', () => {
    it('should call disconnect on all instances during shutdown', async () => {
      const mockInstance1 = { instanceName: 'inst-a', disconnect: vi.fn().mockResolvedValue(undefined) };
      const mockInstance2 = { instanceName: 'inst-b', disconnect: vi.fn().mockResolvedValue(undefined) };
      MockedConnectionManager
        .mockReturnValueOnce(mockInstance1 as any)
        .mockReturnValueOnce(mockInstance2 as any);

      redisConfig.instances = [
        { instanceName: 'inst-a', mode: 'single', url: 'redis://a' },
        { instanceName: 'inst-b', mode: 'single', url: 'redis://b' },
      ];
      const manager = new RedisManager(redisConfig, mockLogger, mockContextManager);
      manager.init();

      await manager.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('Closing all Redis connections...');
      expect(mockInstance1.disconnect).toHaveBeenCalledOnce();
      expect(mockInstance2.disconnect).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith('All Redis connections have been closed.');
    });
  });
});