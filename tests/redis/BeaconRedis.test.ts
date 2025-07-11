/**
 * FILE: tests/redis/BeaconRedis.test.ts
 * DESCRIPTION: Unit tests for the BeaconRedis class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BeaconRedis } from '../../src/redis/BeaconRedis';
import { ILogger } from '../../src/logger/ILogger';
import { RedisConnectionManager } from '../../src/redis/RedisConnectionManager';
import { RedisCommandExecutor } from '../../src/redis/RedisCommandExecutor';
import { RedisInstanceConfig } from '../../src/config';

// Mock dependencies
vi.mock('../../src/redis/RedisConnectionManager');
vi.mock('../../src/redis/RedisCommandExecutor');

/**
 * Creates a mock ILogger instance for testing.
 * @returns A mocked ILogger.
 */
const createMockLogger = (): ILogger => {
  const logger: any = {};
  const levels = ['debug', 'info', 'warn', 'error'];
  levels.forEach(level => {
    logger[level] = vi.fn();
  });
  // Mock withSource to be chainable
  logger.withSource = vi.fn(() => logger);
  return logger as ILogger;
};

describe('BeaconRedis', () => {
  let mockConnectionManager: vi.Mocked<RedisConnectionManager>;
  let mockCommandExecutor: vi.Mocked<RedisCommandExecutor>;
  let mockLogger: ILogger;
  let beaconRedis: BeaconRedis;
  let baseConfig: RedisInstanceConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConnectionManager = new (RedisConnectionManager as any)();
    mockCommandExecutor = new (RedisCommandExecutor as any)();
    mockLogger = createMockLogger();

    baseConfig = {
      instanceName: 'test-instance',
      mode: 'single',
      url: 'redis://localhost:6379',
      logging: {
        onSuccess: 'debug',
        onError: 'error',
        logCommandValues: false,
        logReturnValue: false,
      },
    };

    beaconRedis = new BeaconRedis(
      baseConfig,
      mockConnectionManager,
      mockCommandExecutor,
      mockLogger
    );
  });

  describe('Lifecycle and Management', () => {
    it('should return the correct instance name', () => {
      expect(beaconRedis.getInstanceName()).toBe('test-instance');
    });

    it('should call connectionManager.ensureReady on connect', async () => {
      await beaconRedis.connect();
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
    });

    it('should call connectionManager.disconnect on quit', async () => {
      await beaconRedis.quit();
      expect(mockConnectionManager.disconnect).toHaveBeenCalledOnce();
    });

    it('should update its internal configuration and use it for subsequent commands', async () => {
      const newConfig = { logging: { onSuccess: 'info' as const } };
      beaconRedis.updateConfig(newConfig);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Dynamically updating Redis instance configuration...',
        { newConfig }
      );

      // Now execute a command and verify the new logging level is used
      vi.spyOn(mockCommandExecutor, 'get').mockResolvedValue('ok');
      await beaconRedis.get('key');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'GET' }),
        'Redis command [GET] executed successfully.'
      );
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should throw an error when multi() is called', () => {
      expect(() => beaconRedis.multi()).toThrow(
        'The multi() method is not yet implemented.'
      );
    });
  });

  describe('Command Execution', () => {
    beforeEach(() => {
      // Default to a successful connection for these tests
      vi.spyOn(mockConnectionManager, 'ensureReady').mockResolvedValue();
    });

    it('should execute a simple command successfully and log it', async () => {
      const key = 'mykey';
      const value = 'myvalue';
      vi.spyOn(mockCommandExecutor, 'get').mockResolvedValue(value);

      const result = await beaconRedis.get(key);

      expect(result).toBe(value);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.get).toHaveBeenCalledWith(key);
      expect(mockLogger.withSource).toHaveBeenCalledWith('redis');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'GET',
          instance: 'test-instance',
        }),
        'Redis command [GET] executed successfully.'
      );
    });

    it('should log command parameters and result when configured to do so', async () => {
      const configWithLogging = {
        ...baseConfig,
        logging: {
          ...baseConfig.logging,
          logCommandValues: true,
          logReturnValue: true,
        },
      };
      beaconRedis = new BeaconRedis(
        configWithLogging,
        mockConnectionManager,
        mockCommandExecutor,
        mockLogger
      );

      const key = 'mykey';
      const value = 'myvalue';
      vi.spyOn(mockCommandExecutor, 'get').mockResolvedValue(value);

      await beaconRedis.get(key);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'GET',
          params: [key],
          result: value,
        }),
        'Redis command [GET] executed successfully.'
      );
    });

    it('should handle command failure and log the error', async () => {
      const commandError = new Error('Redis command failed');
      vi.spyOn(mockCommandExecutor, 'get').mockRejectedValue(commandError);

      await expect(beaconRedis.get('some-key')).rejects.toThrow(commandError);

      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'GET',
          instance: 'test-instance',
          err: commandError,
          params: undefined,
        }),
        'Redis command [GET] failed.'
      );
    });

    it('should log command parameters on failure when configured to do so', async () => {
      const configWithLogging = {
        ...baseConfig,
        logging: {
          ...baseConfig.logging,
          logCommandValues: true,
        },
      };
      beaconRedis = new BeaconRedis(
        configWithLogging,
        mockConnectionManager,
        mockCommandExecutor,
        mockLogger
      );

      const commandError = new Error('Redis command failed');
      vi.spyOn(mockCommandExecutor, 'get').mockRejectedValue(commandError);

      await expect(beaconRedis.get('failing-key')).rejects.toThrow(commandError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'GET',
          instance: 'test-instance',
          err: commandError,
          params: ['failing-key'],
        }),
        'Redis command [GET] failed.'
      );
    });

    it('should handle connection failure and log the error', async () => {
      const connectionError = new Error('Connection failed');
      vi.spyOn(mockConnectionManager, 'ensureReady').mockRejectedValue(
        connectionError
      );

      await expect(beaconRedis.get('some-key')).rejects.toThrow(connectionError);

      expect(mockCommandExecutor.get).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'GET',
          instance: 'test-instance',
          err: connectionError,
        }),
        'Redis command [GET] failed.'
      );
    });

    it('should correctly handle SET with TTL option', async () => {
      vi.spyOn(mockCommandExecutor, 'set').mockResolvedValue('OK');
      const key = 'mykey';
      const value = 'myvalue';
      const ttl = 60;

      await beaconRedis.set(key, value, ttl);

      expect(mockCommandExecutor.set).toHaveBeenCalledWith(key, value, { EX: ttl });
    });

    it('should correctly handle HSET with an object argument', async () => {
      vi.spyOn(mockCommandExecutor, 'hSet').mockResolvedValue(2);
      const key = 'myhash';
      const fieldsAndValues = { field1: 'val1', field2: 'val2' };

      await beaconRedis.hSet(key, fieldsAndValues);

      expect(mockCommandExecutor.hSet).toHaveBeenCalledWith(key, fieldsAndValues);
    });

    it('should call connectionManager.ping for the ping command', async () => {
      vi.spyOn(mockConnectionManager, 'ping').mockResolvedValue('PONG');

      const result = await beaconRedis.ping();

      expect(result).toBe('PONG');
      expect(mockConnectionManager.ping).toHaveBeenCalledOnce();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [PING] executed successfully.'
      );
    });

    it('should call connectionManager.info for the info command', async () => {
      const infoString = '# Server\nversion:6.2.6';
      vi.spyOn(mockConnectionManager, 'info').mockResolvedValue(infoString);

      const result = await beaconRedis.info();

      expect(result).toBe(infoString);
      expect(mockConnectionManager.info).toHaveBeenCalledOnce();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [INFO] executed successfully.'
      );
    });
  });
});