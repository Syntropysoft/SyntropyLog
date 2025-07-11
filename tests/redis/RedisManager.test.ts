/**
 * FILE: tests/redis/RedisManager.test.ts
 * DESCRIPTION: Unit tests for the RedisManager class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisManager } from '../../src/redis/RedisManager';
import { ILogger } from '../../src/logger/ILogger';
import { SyntropyRedisConfig } from '../../src/config';
import { BeaconRedis } from '../../src/redis/BeaconRedis';
import { RedisConnectionManager } from '../../src/redis/RedisConnectionManager';
import { RedisCommandExecutor } from '../../src/redis/RedisCommandExecutor';
import { createFailingRedisClient } from '../../src/utils/createFailingClient';
import { IBeaconRedis } from '../../src/redis/IBeaconRedis';

// Mock all dependencies
vi.mock('../../src/redis/BeaconRedis');
vi.mock('../../src/redis/RedisConnectionManager');
vi.mock('../../src/redis/RedisCommandExecutor');
vi.mock('../../src/utils/createFailingClient');

const createMockLogger = (): ILogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(), // Chainable child logger
});

describe('RedisManager', () => {
  let mockLogger: ILogger;
  let mockBeaconRedis: vi.Mocked<BeaconRedis>;

  // Mocked constructors and functions
  const MockedBeaconRedis = vi.mocked(BeaconRedis);
  const MockedConnectionManager = vi.mocked(RedisConnectionManager);
  const mockedCreateFailingClient = vi.mocked(createFailingRedisClient);
  const MockedCommandExecutor = vi.mocked(RedisCommandExecutor);

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();

    // Setup a generic mock for BeaconRedis instances
    mockBeaconRedis = {
      getInstanceName: vi.fn().mockReturnValue('mock-instance'),
      updateConfig: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    } as any;
    MockedBeaconRedis.mockImplementation(() => mockBeaconRedis);

    // Mock the native client getter from ConnectionManager
    vi.spyOn(
      MockedConnectionManager.prototype,
      'getNativeClient'
    ).mockReturnValue({} as any);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize empty and log a debug message if no config is provided', () => {
      new RedisManager({ logger: mockLogger });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'No Redis configuration was provided or no instances were defined. RedisManager initialized empty.'
      );
      expect(MockedBeaconRedis).not.toHaveBeenCalled();
    });

    it('should create BeaconRedis instances for each configuration entry', () => {
      const config: SyntropyRedisConfig = {
        instances: [
          { instanceName: 'instance-1', mode: 'single', url: 'redis://a' },
          { instanceName: 'instance-2', mode: 'single', url: 'redis://b' },
        ],
      };

      new RedisManager({ config, logger: mockLogger });

      expect(MockedBeaconRedis).toHaveBeenCalledTimes(2);
      expect(mockLogger.child).toHaveBeenCalledWith({ instance: 'instance-1' });
      expect(mockLogger.child).toHaveBeenCalledWith({ instance: 'instance-2' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Redis instance "instance-1" created successfully.'
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Redis instance "instance-2" created successfully.'
      );
    });

    it('should correctly wire up ConnectionManager, CommandExecutor, and BeaconRedis', () => {
      const instanceConfig = { instanceName: 'wired-instance', mode: 'single', url: 'redis://c' };
      const config: SyntropyRedisConfig = { instances: [instanceConfig] };
      const mockNativeClient = { id: 'native-client' } as any;

      vi.spyOn(
        MockedConnectionManager.prototype,
        'getNativeClient'
      ).mockReturnValue(mockNativeClient);

      new RedisManager({ config, logger: mockLogger });

      expect(MockedConnectionManager).toHaveBeenCalledWith(instanceConfig, expect.any(Object));
      expect(MockedCommandExecutor).toHaveBeenCalledWith(mockNativeClient);
      expect(MockedBeaconRedis).toHaveBeenCalledWith(
        instanceConfig,
        expect.any(MockedConnectionManager),
        expect.any(MockedCommandExecutor),
        expect.any(Object) // child logger
      );
    });
  });

  describe('Instance Retrieval', () => {
    it('should return the correct instance when a valid name is provided', () => {
      const config: SyntropyRedisConfig = {
        instances: [{ instanceName: 'my-redis', mode: 'single', url: 'redis://a' }],
      };
      MockedBeaconRedis.mockReturnValue({ getInstanceName: () => 'my-redis' } as any);

      const manager = new RedisManager({ config, logger: mockLogger });
      const instance = manager.getInstance('my-redis');

      expect(instance.getInstanceName()).toBe('my-redis');
    });

    it('should throw an error if the instance name is not found', () => {
      const manager = new RedisManager({ logger: mockLogger });
      expect(() => manager.getInstance('non-existent')).toThrow(
        'Redis instance with name "non-existent" was not found.'
      );
    });
  });

  describe('Error Handling and Lifecycle', () => {
    it('should create a failing client if an instance fails to initialize', () => {
      const error = new Error('Initialization failed');
      MockedBeaconRedis.mockImplementation(() => {
        throw error;
      });
      const failingClientMock = { isFailing: true } as any;
      mockedCreateFailingClient.mockReturnValue(failingClientMock);

      const config: SyntropyRedisConfig = {
        instances: [{ instanceName: 'failing-instance', mode: 'single', url: 'redis://fail' }],
      };

      const manager = new RedisManager({ config, logger: mockLogger });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create Redis instance "failing-instance"',
        { error }
      );
      expect(createFailingRedisClient).toHaveBeenCalledWith('failing-instance', error, expect.any(Object));

      const instance = manager.getInstance('failing-instance');
      expect(instance).toBe(failingClientMock);
    });

    it('should call quit on all instances during shutdown', async () => {
      const instances: IBeaconRedis[] = [
        { getInstanceName: () => 'inst-a', quit: vi.fn().mockResolvedValue(undefined) } as any,
        { getInstanceName: () => 'inst-b', quit: vi.fn().mockResolvedValue(undefined) } as any,
      ];
      MockedBeaconRedis.mockImplementationOnce(() => instances[0] as BeaconRedis)
                       .mockImplementationOnce(() => instances[1] as BeaconRedis);

      const config: SyntropyRedisConfig = {
        instances: [
          { instanceName: 'inst-a', mode: 'single', url: 'redis://a' },
          { instanceName: 'inst-b', mode: 'single', url: 'redis://b' },
        ],
      };
      const manager = new RedisManager({ config, logger: mockLogger });

      await manager.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('Closing all Redis connections...');
      expect(instances[0].quit).toHaveBeenCalledOnce();
      expect(instances[1].quit).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith('All Redis connections have been closed.');
    });

    it('should update the configuration of a specific instance', () => {
      const config: SyntropyRedisConfig = {
        instances: [{ instanceName: 'my-redis', mode: 'single', url: 'redis://a' }],
      };
      const manager = new RedisManager({ config, logger: mockLogger });
      const newConfig = { logging: { onSuccess: 'info' as const } };

      manager.updateInstanceConfig('my-redis', newConfig);

      expect(mockBeaconRedis.updateConfig).toHaveBeenCalledWith(newConfig);
    });

    it('should log a warning when trying to update a non-existent instance', () => {
      const manager = new RedisManager({ logger: mockLogger });
      const newConfig = { logging: { onSuccess: 'info' as const } };

      manager.updateInstanceConfig('non-existent', newConfig);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Attempted to reconfigure Redis instance "non-existent", but it was not found.'
      );
    });
  });
});