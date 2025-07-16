/**
 * FILE: tests/redis/BeaconRedis.test.ts
 * DESCRIPTION: Unit tests for the BeaconRedis class.
 */

import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
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
  let mockConnectionManager: Mocked<RedisConnectionManager>;
  let mockCommandExecutor: Mocked<RedisCommandExecutor>;
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
      const newConfig = { 
        logging: { 
          onSuccess: 'info' as const,
          onError: 'error' as const,
          logCommandValues: false,
          logReturnValue: false
        } 
      };
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
      vi.spyOn(mockConnectionManager, 'ensureReady').mockResolvedValue(undefined);
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
          onSuccess: 'debug' as const,
          onError: 'error' as const,
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
          onSuccess: 'debug' as const,
          onError: 'error' as const,
          logReturnValue: true,
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

    it('should execute HGET and return a value when the field exists', async () => {
      const key = 'my-hash';
      const field = 'my-field';
      const value = 'my-value';
      vi.spyOn(mockCommandExecutor, 'hGet').mockResolvedValue(value);

      const result = await beaconRedis.hGet(key, field);

      expect(result).toBe(value);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.hGet).toHaveBeenCalledWith(key, field);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'HGET',
          instance: 'test-instance',
        }),
        'Redis command [HGET] executed successfully.'
      );
    });

    it('should execute HGET and return null when the field does not exist', async () => {
      const key = 'my-hash';
      const field = 'non-existent-field';
      // The native client returns undefined for non-existent fields.
      vi.spyOn(mockCommandExecutor, 'hGet').mockResolvedValue(undefined);

      const result = await beaconRedis.hGet(key, field);

      // The wrapper should convert undefined to null.
      expect(result).toBeNull();
      expect(mockCommandExecutor.hGet).toHaveBeenCalledWith(key, field);
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.any(Object), 'Redis command [HGET] executed successfully.');
    });

    it('should execute RPOP and return a value when the list is not empty', async () => {
      const key = 'my-list';
      const value = 'last-item';
      vi.spyOn(mockCommandExecutor, 'rPop').mockResolvedValue(value);

      const result = await beaconRedis.rPop(key);

      expect(result).toBe(value);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.rPop).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'RPOP',
          instance: 'test-instance',
        }),
        'Redis command [RPOP] executed successfully.'
      );
    });

    it('should execute RPOP and return null when the list is empty or does not exist', async () => {
      const key = 'empty-list';
      // The native client returns null for an empty list.
      vi.spyOn(mockCommandExecutor, 'rPop').mockResolvedValue(null);

      const result = await beaconRedis.rPop(key);

      expect(result).toBeNull();
      expect(mockCommandExecutor.rPop).toHaveBeenCalledWith(key);
      // Check that it still logs success, even with a null result
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.any(Object), 'Redis command [RPOP] executed successfully.');
    });

    it('should execute HGETALL and return a record when the hash exists', async () => {
      const key = 'my-hash';
      const hashData = { field1: 'value1', field2: 'value2' };
      vi.spyOn(mockCommandExecutor, 'hGetAll').mockResolvedValue(hashData);

      const result = await beaconRedis.hGetAll(key);

      expect(result).toEqual(hashData);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.hGetAll).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'HGETALL',
          instance: 'test-instance',
        }),
        'Redis command [HGETALL] executed successfully.'
      );
    });

    it('should execute HGETALL and return an empty object when the hash does not exist', async () => {
      const key = 'non-existent-hash';
      // The native client returns an empty object for a non-existent hash key.
      vi.spyOn(mockCommandExecutor, 'hGetAll').mockResolvedValue({});

      const result = await beaconRedis.hGetAll(key);

      expect(result).toEqual({});
      expect(mockCommandExecutor.hGetAll).toHaveBeenCalledWith(key);
      // Check that it still logs success, even with an empty result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [HGETALL] executed successfully.'
      );
    });

    it('should execute HDEL for a single field and return the number of deleted fields', async () => {
      const key = 'my-hash';
      const field = 'field-to-delete';
      vi.spyOn(mockCommandExecutor, 'hDel').mockResolvedValue(1);

      const result = await beaconRedis.hDel(key, field);

      expect(result).toBe(1);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.hDel).toHaveBeenCalledWith(key, field);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'HDEL',
          instance: 'test-instance',
        }),
        'Redis command [HDEL] executed successfully.'
      );
    });

    it('should execute HDEL for multiple fields and return the number of deleted fields', async () => {
      const key = 'my-hash';
      const fields = ['field1', 'field2', 'non-existent'];
      // Simulate that 2 of the 3 fields existed and were deleted.
      vi.spyOn(mockCommandExecutor, 'hDel').mockResolvedValue(2);

      const result = await beaconRedis.hDel(key, fields);

      expect(result).toBe(2);
      expect(mockCommandExecutor.hDel).toHaveBeenCalledWith(key, fields);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'HDEL',
          instance: 'test-instance',
        }),
        'Redis command [HDEL] executed successfully.'
      );
    });

    it('should execute HEXISTS and return true when the field exists', async () => {
      const key = 'my-hash';
      const field = 'existing-field';
      vi.spyOn(mockCommandExecutor, 'hExists').mockResolvedValue(true);

      const result = await beaconRedis.hExists(key, field);

      expect(result).toBe(true);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.hExists).toHaveBeenCalledWith(key, field);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'HEXISTS',
          instance: 'test-instance',
        }),
        'Redis command [HEXISTS] executed successfully.'
      );
    });

    it('should execute HEXISTS and return false when the field does not exist', async () => {
      const key = 'my-hash';
      const field = 'non-existent-field';
      vi.spyOn(mockCommandExecutor, 'hExists').mockResolvedValue(false);

      const result = await beaconRedis.hExists(key, field);

      expect(result).toBe(false);
      expect(mockCommandExecutor.hExists).toHaveBeenCalledWith(key, field);
      // Check that it still logs success, even with a false result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [HEXISTS] executed successfully.'
      );
    });

    it('should execute HINCRBY and return the new value', async () => {
      const key = 'my-hash';
      const field = 'counter-field';
      const increment = 5;
      const newValue = 15;
      vi.spyOn(mockCommandExecutor, 'hIncrBy').mockResolvedValue(newValue);

      const result = await beaconRedis.hIncrBy(key, field, increment);

      expect(result).toBe(newValue);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.hIncrBy).toHaveBeenCalledWith(key, field, increment);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'HINCRBY',
          instance: 'test-instance',
        }),
        'Redis command [HINCRBY] executed successfully.'
      );
    });

    it('should execute LPUSH for a single element and return the new list length', async () => {
      const key = 'my-list';
      const element = 'item1';
      const newLength = 1;
      vi.spyOn(mockCommandExecutor, 'lPush').mockResolvedValue(newLength);

      const result = await beaconRedis.lPush(key, element);

      expect(result).toBe(newLength);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.lPush).toHaveBeenCalledWith(key, element);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'LPUSH',
          instance: 'test-instance',
        }),
        'Redis command [LPUSH] executed successfully.'
      );
    });

    it('should execute LPUSH for multiple elements and return the new list length', async () => {
      const key = 'my-list';
      const elements = ['item2', 'item3'];
      const newLength = 3;
      vi.spyOn(mockCommandExecutor, 'lPush').mockResolvedValue(newLength);

      const result = await beaconRedis.lPush(key, elements);

      expect(result).toBe(newLength);
      expect(mockCommandExecutor.lPush).toHaveBeenCalledWith(key, elements);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'LPUSH' }),
        'Redis command [LPUSH] executed successfully.'
      );
    });

    it('should execute RPUSH for a single element and return the new list length', async () => {
      const key = 'my-list';
      const element = 'item1';
      const newLength = 1;
      vi.spyOn(mockCommandExecutor, 'rPush').mockResolvedValue(newLength);

      const result = await beaconRedis.rPush(key, element);

      expect(result).toBe(newLength);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.rPush).toHaveBeenCalledWith(key, element);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'RPUSH',
          instance: 'test-instance',
        }),
        'Redis command [RPUSH] executed successfully.'
      );
    });

    it('should execute RPUSH for multiple elements and return the new list length', async () => {
      const key = 'my-list';
      const elements = ['item2', 'item3'];
      const newLength = 3;
      vi.spyOn(mockCommandExecutor, 'rPush').mockResolvedValue(newLength);

      const result = await beaconRedis.rPush(key, elements);

      expect(result).toBe(newLength);
      expect(mockCommandExecutor.rPush).toHaveBeenCalledWith(key, elements);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'RPUSH' }),
        'Redis command [RPUSH] executed successfully.'
      );
    });

    it('should execute LPOP and return a value when the list is not empty', async () => {
      const key = 'my-list';
      const value = 'first-item';
      vi.spyOn(mockCommandExecutor, 'lPop').mockResolvedValue(value);

      const result = await beaconRedis.lPop(key);

      expect(result).toBe(value);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.lPop).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'LPOP',
          instance: 'test-instance',
        }),
        'Redis command [LPOP] executed successfully.'
      );
    });

    it('should execute LPOP and return null when the list is empty or does not exist', async () => {
      const key = 'empty-list';
      // The native client returns null for an empty list.
      vi.spyOn(mockCommandExecutor, 'lPop').mockResolvedValue(null);

      const result = await beaconRedis.lPop(key);

      expect(result).toBeNull();
      expect(mockCommandExecutor.lPop).toHaveBeenCalledWith(key);
      // Check that it still logs success, even with a null result
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.any(Object), 'Redis command [LPOP] executed successfully.');
    });

    it('should execute LRANGE and return an array of elements', async () => {
      const key = 'my-list';
      const start = 0;
      const stop = 2;
      const listSlice = ['item0', 'item1', 'item2'];
      vi.spyOn(mockCommandExecutor, 'lRange').mockResolvedValue(listSlice);

      const result = await beaconRedis.lRange(key, start, stop);

      expect(result).toEqual(listSlice);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.lRange).toHaveBeenCalledWith(key, start, stop);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'LRANGE',
          instance: 'test-instance',
        }),
        'Redis command [LRANGE] executed successfully.'
      );
    });

    it('should execute LRANGE and return an empty array when the list does not exist', async () => {
      const key = 'empty-list';
      const start = 0;
      const stop = -1;
      // The native client returns an empty array for a non-existent list.
      vi.spyOn(mockCommandExecutor, 'lRange').mockResolvedValue([]);

      const result = await beaconRedis.lRange(key, start, stop);

      expect(result).toEqual([]);
      expect(mockCommandExecutor.lRange).toHaveBeenCalledWith(key, start, stop);
      // Check that it still logs success, even with an empty result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [LRANGE] executed successfully.'
      );
    });

    it('should execute LLEN and return the length of the list', async () => {
      const key = 'my-list';
      const length = 5;
      vi.spyOn(mockCommandExecutor, 'lLen').mockResolvedValue(length);

      const result = await beaconRedis.lLen(key);

      expect(result).toBe(length);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.lLen).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'LLEN',
          instance: 'test-instance',
        }),
        'Redis command [LLEN] executed successfully.'
      );
    });

    it('should execute LLEN and return 0 when the list does not exist', async () => {
      const key = 'empty-list';
      // The native client returns 0 for a non-existent list.
      vi.spyOn(mockCommandExecutor, 'lLen').mockResolvedValue(0);

      const result = await beaconRedis.lLen(key);

      expect(result).toBe(0);
      expect(mockCommandExecutor.lLen).toHaveBeenCalledWith(key);
      // Check that it still logs success, even with a 0 result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [LLEN] executed successfully.'
      );
    });

    it('should execute LTRIM and return "OK"', async () => {
      const key = 'my-list';
      const start = 1;
      const stop = 2;
      vi.spyOn(mockCommandExecutor, 'lTrim').mockResolvedValue('OK');

      const result = await beaconRedis.lTrim(key, start, stop);

      expect(result).toBe('OK');
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.lTrim).toHaveBeenCalledWith(key, start, stop);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'LTRIM',
          instance: 'test-instance',
        }),
        'Redis command [LTRIM] executed successfully.'
      );
    });

    it('should execute SADD for a single member and return the number of added members', async () => {
      const key = 'my-set';
      const member = 'member1';
      const addedCount = 1;
      vi.spyOn(mockCommandExecutor, 'sAdd').mockResolvedValue(addedCount);

      const result = await beaconRedis.sAdd(key, member);

      expect(result).toBe(addedCount);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.sAdd).toHaveBeenCalledWith(key, member);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SADD',
          instance: 'test-instance',
        }),
        'Redis command [SADD] executed successfully.'
      );
    });

    it('should execute SADD for multiple members and return the number of added members', async () => {
      const key = 'my-set';
      const members = ['member2', 'member3'];
      const addedCount = 2;
      vi.spyOn(mockCommandExecutor, 'sAdd').mockResolvedValue(addedCount);

      const result = await beaconRedis.sAdd(key, members);

      expect(result).toBe(addedCount);
      expect(mockCommandExecutor.sAdd).toHaveBeenCalledWith(key, members);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'SADD' }),
        'Redis command [SADD] executed successfully.'
      );
    });

    it('should execute SMEMBERS and return an array of members', async () => {
      const key = 'my-set';
      const members = ['member1', 'member2', 'member3'];
      vi.spyOn(mockCommandExecutor, 'sMembers').mockResolvedValue(members);

      const result = await beaconRedis.sMembers(key);

      expect(result).toEqual(members);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.sMembers).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SMEMBERS',
          instance: 'test-instance',
        }),
        'Redis command [SMEMBERS] executed successfully.'
      );
    });

    it('should execute SMEMBERS and return an empty array when the set does not exist', async () => {
      const key = 'empty-set';
      // The native client returns an empty array for a non-existent set.
      vi.spyOn(mockCommandExecutor, 'sMembers').mockResolvedValue([]);

      const result = await beaconRedis.sMembers(key);

      expect(result).toEqual([]);
      expect(mockCommandExecutor.sMembers).toHaveBeenCalledWith(key);
      // Check that it still logs success, even with an empty result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [SMEMBERS] executed successfully.'
      );
    });

    it('should execute SISMEMBER and return true when the member exists', async () => {
      const key = 'my-set';
      const member = 'existing-member';
      vi.spyOn(mockCommandExecutor, 'sIsMember').mockResolvedValue(true);

      const result = await beaconRedis.sIsMember(key, member);

      expect(result).toBe(true);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.sIsMember).toHaveBeenCalledWith(key, member);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SISMEMBER',
          instance: 'test-instance',
        }),
        'Redis command [SISMEMBER] executed successfully.'
      );
    });

    it('should execute SISMEMBER and return false when the member does not exist', async () => {
      const key = 'my-set';
      const member = 'non-existent-member';
      vi.spyOn(mockCommandExecutor, 'sIsMember').mockResolvedValue(false);

      const result = await beaconRedis.sIsMember(key, member);

      expect(result).toBe(false);
      expect(mockCommandExecutor.sIsMember).toHaveBeenCalledWith(key, member);
      // Check that it still logs success, even with a false result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [SISMEMBER] executed successfully.'
      );
    });

    it('should execute SREM for a single member and return the number of removed members', async () => {
      const key = 'my-set';
      const member = 'member-to-remove';
      vi.spyOn(mockCommandExecutor, 'sRem').mockResolvedValue(1);

      const result = await beaconRedis.sRem(key, member);

      expect(result).toBe(1);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.sRem).toHaveBeenCalledWith(key, member);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SREM',
          instance: 'test-instance',
        }),
        'Redis command [SREM] executed successfully.'
      );
    });

    it('should execute SREM for multiple members and return the number of removed members', async () => {
      const key = 'my-set';
      const members = ['member1', 'non-existent-member'];
      // Simulate that only 1 of the 2 members was actually in the set.
      vi.spyOn(mockCommandExecutor, 'sRem').mockResolvedValue(1);

      const result = await beaconRedis.sRem(key, members);

      expect(result).toBe(1);
      expect(mockCommandExecutor.sRem).toHaveBeenCalledWith(key, members);
      // Check that it still logs success
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'SREM' }),
        'Redis command [SREM] executed successfully.'
      );
    });

    it('should execute SCARD and return the cardinality of the set', async () => {
      const key = 'my-set';
      const cardinality = 3;
      vi.spyOn(mockCommandExecutor, 'sCard').mockResolvedValue(cardinality);

      const result = await beaconRedis.sCard(key);

      expect(result).toBe(cardinality);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.sCard).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'SCARD',
          instance: 'test-instance',
        }),
        'Redis command [SCARD] executed successfully.'
      );
    });

    it('should execute SCARD and return 0 when the set does not exist', async () => {
      const key = 'empty-set';
      // The native client returns 0 for a non-existent set.
      vi.spyOn(mockCommandExecutor, 'sCard').mockResolvedValue(0);

      const result = await beaconRedis.sCard(key);

      expect(result).toBe(0);
      expect(mockCommandExecutor.sCard).toHaveBeenCalledWith(key);
      // Check that it still logs success, even with a 0 result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [SCARD] executed successfully.'
      );
    });

    it('should execute ZADD for a single member and return the number of added members', async () => {
      const key = 'my-zset';
      const score = 10;
      const member = 'member1';
      const addedCount = 1;
      vi.spyOn(mockCommandExecutor, 'zAdd').mockResolvedValue(addedCount);

      const result = await beaconRedis.zAdd(key, score, member);

      expect(result).toBe(addedCount);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.zAdd).toHaveBeenCalledWith(key, score, member);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'ZADD',
          instance: 'test-instance',
        }),
        'Redis command [ZADD] executed successfully.'
      );
    });

    it('should execute ZADD for multiple members and return the number of added members', async () => {
      const key = 'my-zset';
      const members = [
        { score: 20, value: 'member2' },
        { score: 30, value: 'member3' },
      ];
      const addedCount = 2;
      vi.spyOn(mockCommandExecutor, 'zAdd').mockResolvedValue(addedCount);

      const result = await beaconRedis.zAdd(key, members);

      expect(result).toBe(addedCount);
      expect(mockCommandExecutor.zAdd).toHaveBeenCalledWith(key, members);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'ZADD' }),
        'Redis command [ZADD] executed successfully.'
      );
    });

    it('should execute ZRANGE and return an array of members', async () => {
      const key = 'my-zset';
      const min = 0;
      const max = 1;
      const members = ['member1', 'member2'];
      vi.spyOn(mockCommandExecutor, 'zRange').mockResolvedValue(members);

      const result = await beaconRedis.zRange(key, min, max);

      expect(result).toEqual(members);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.zRange).toHaveBeenCalledWith(key, min, max, undefined);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'ZRANGE',
          instance: 'test-instance',
        }),
        'Redis command [ZRANGE] executed successfully.'
      );
    });

    it('should execute ZRANGE and return an empty array for a non-existent key', async () => {
      const key = 'non-existent-zset';
      const min = 0;
      const max = -1;
      vi.spyOn(mockCommandExecutor, 'zRange').mockResolvedValue([]);

      const result = await beaconRedis.zRange(key, min, max);

      expect(result).toEqual([]);
      expect(mockCommandExecutor.zRange).toHaveBeenCalledWith(key, min, max, undefined);
      // Check that it still logs success, even with an empty result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [ZRANGE] executed successfully.'
      );
    });

    it('should execute ZRANGE with options and pass them to the executor', async () => {
      const key = 'my-zset';
      const options = { REV: true };
      vi.spyOn(mockCommandExecutor, 'zRange').mockResolvedValue(['member2', 'member1']);

      const result = await beaconRedis.zRange(key, 0, 1, options);

      expect(result).toEqual(['member2', 'member1']);
      expect(mockCommandExecutor.zRange).toHaveBeenCalledWith(key, 0, 1, options);
    });

    it('should execute ZRANGE WITHSCORES and return an array of members with scores', async () => {
      const key = 'my-zset';
      const min = 0;
      const max = 1;
      const membersWithScores = [
        { score: 10, value: 'member1' },
        { score: 20, value: 'member2' },
      ];
      vi.spyOn(mockCommandExecutor, 'zRangeWithScores').mockResolvedValue(
        membersWithScores
      );

      const result = await beaconRedis.zRangeWithScores(key, min, max);

      expect(result).toEqual(membersWithScores);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.zRangeWithScores).toHaveBeenCalledWith(
        key,
        min,
        max,
        undefined
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'ZRANGE_WITHSCORES',
          instance: 'test-instance',
        }),
        'Redis command [ZRANGE_WITHSCORES] executed successfully.'
      );
    });

    it('should execute ZRANGE WITHSCORES and return an empty array for a non-existent key', async () => {
      const key = 'non-existent-zset';
      vi.spyOn(mockCommandExecutor, 'zRangeWithScores').mockResolvedValue([]);

      const result = await beaconRedis.zRangeWithScores(key, 0, -1);

      expect(result).toEqual([]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [ZRANGE_WITHSCORES] executed successfully.'
      );
    });

    it('should execute ZRANGE WITHSCORES with options and pass them to the executor', async () => {
      const key = 'my-zset';
      const options = { REV: true };
      vi.spyOn(mockCommandExecutor, 'zRangeWithScores').mockResolvedValue([]);
      await beaconRedis.zRangeWithScores(key, 0, 1, options);
      expect(mockCommandExecutor.zRangeWithScores).toHaveBeenCalledWith(key, 0, 1, options);
    });

    it('should execute ZREM for a single member and return the number of removed members', async () => {
      const key = 'my-zset';
      const member = 'member-to-remove';
      vi.spyOn(mockCommandExecutor, 'zRem').mockResolvedValue(1);

      const result = await beaconRedis.zRem(key, member);

      expect(result).toBe(1);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.zRem).toHaveBeenCalledWith(key, member);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'ZREM',
          instance: 'test-instance',
        }),
        'Redis command [ZREM] executed successfully.'
      );
    });

    it('should execute ZREM for multiple members and return the number of removed members', async () => {
      const key = 'my-zset';
      const members = ['member1', 'non-existent-member'];
      // Simulate that only 1 of the 2 members was actually in the set.
      vi.spyOn(mockCommandExecutor, 'zRem').mockResolvedValue(1);

      const result = await beaconRedis.zRem(key, members);

      expect(result).toBe(1);
      expect(mockCommandExecutor.zRem).toHaveBeenCalledWith(key, members);
      // Check that it still logs success
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'ZREM' }),
        'Redis command [ZREM] executed successfully.'
      );
    });

    it('should execute ZCARD and return the cardinality of the sorted set', async () => {
      const key = 'my-zset';
      const cardinality = 5;
      vi.spyOn(mockCommandExecutor, 'zCard').mockResolvedValue(cardinality);

      const result = await beaconRedis.zCard(key);

      expect(result).toBe(cardinality);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.zCard).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'ZCARD',
          instance: 'test-instance',
        }),
        'Redis command [ZCARD] executed successfully.'
      );
    });

    it('should execute ZCARD and return 0 when the sorted set does not exist', async () => {
      const key = 'empty-zset';
      // The native client returns 0 for a non-existent set.
      vi.spyOn(mockCommandExecutor, 'zCard').mockResolvedValue(0);

      const result = await beaconRedis.zCard(key);

      expect(result).toBe(0);
      expect(mockCommandExecutor.zCard).toHaveBeenCalledWith(key);
      // Check that it still logs success, even with a 0 result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [ZCARD] executed successfully.'
      );
    });

    it('should execute ZSCORE and return the score when the member exists', async () => {
      const key = 'my-zset';
      const member = 'active-member';
      const score = 100;
      vi.spyOn(mockCommandExecutor, 'zScore').mockResolvedValue(score);

      const result = await beaconRedis.zScore(key, member);

      expect(result).toBe(score);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.zScore).toHaveBeenCalledWith(key, member);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'ZSCORE',
          instance: 'test-instance',
        }),
        'Redis command [ZSCORE] executed successfully.'
      );
    });

    it('should execute ZSCORE and return null when the member does not exist', async () => {
      const key = 'my-zset';
      const member = 'inactive-member';
      // The native client returns null if the member or key does not exist.
      vi.spyOn(mockCommandExecutor, 'zScore').mockResolvedValue(null);

      const result = await beaconRedis.zScore(key, member);

      expect(result).toBeNull();
      expect(mockCommandExecutor.zScore).toHaveBeenCalledWith(key, member);
      // Check that it still logs success, even with a null result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [ZSCORE] executed successfully.'
      );
    });

    it('should execute DEL for a single key and return the number of deleted keys', async () => {
      const key = 'my-key-to-delete';
      vi.spyOn(mockCommandExecutor, 'del').mockResolvedValue(1);

      const result = await beaconRedis.del(key);

      expect(result).toBe(1);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.del).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'DEL',
          instance: 'test-instance',
        }),
        'Redis command [DEL] executed successfully.'
      );
    });

    it('should execute DEL for multiple keys and return the number of deleted keys', async () => {
      const keys = ['key1', 'key2', 'non-existent'];
      // Simulate that 2 of the 3 keys existed and were deleted.
      vi.spyOn(mockCommandExecutor, 'del').mockResolvedValue(2);

      const result = await beaconRedis.del(keys);

      expect(result).toBe(2);
      expect(mockCommandExecutor.del).toHaveBeenCalledWith(keys);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'DEL',
          instance: 'test-instance',
        }),
        'Redis command [DEL] executed successfully.'
      );
    });

    it('should execute EXISTS for a single key and return 1 if it exists', async () => {
      const key = 'existing-key';
      vi.spyOn(mockCommandExecutor, 'exists').mockResolvedValue(1);

      const result = await beaconRedis.exists(key);

      expect(result).toBe(1);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.exists).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'EXISTS',
          instance: 'test-instance',
        }),
        'Redis command [EXISTS] executed successfully.'
      );
    });

    it('should execute EXISTS for multiple keys and return the count of existing keys', async () => {
      const keys = ['key1', 'key2', 'non-existent'];
      // Simulate that 2 of the 3 keys exist.
      vi.spyOn(mockCommandExecutor, 'exists').mockResolvedValue(2);

      const result = await beaconRedis.exists(keys);

      expect(result).toBe(2);
      expect(mockCommandExecutor.exists).toHaveBeenCalledWith(keys);
      // Check that it still logs success
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'EXISTS',
          instance: 'test-instance',
        }),
        'Redis command [EXISTS] executed successfully.'
      );
    });

    it('should execute EXPIRE and return true when the key exists', async () => {
      const key = 'my-key';
      const seconds = 60;
      vi.spyOn(mockCommandExecutor, 'expire').mockResolvedValue(true);

      const result = await beaconRedis.expire(key, seconds);

      expect(result).toBe(true);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.expire).toHaveBeenCalledWith(key, seconds);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'EXPIRE',
          instance: 'test-instance',
        }),
        'Redis command [EXPIRE] executed successfully.'
      );
    });

    it('should execute EXPIRE and return false when the key does not exist', async () => {
      const key = 'non-existent-key';
      const seconds = 60;
      // The native client returns false if the key does not exist.
      vi.spyOn(mockCommandExecutor, 'expire').mockResolvedValue(false);

      const result = await beaconRedis.expire(key, seconds);

      expect(result).toBe(false);
      expect(mockCommandExecutor.expire).toHaveBeenCalledWith(key, seconds);
      // Check that it still logs success, even with a false result
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [EXPIRE] executed successfully.'
      );
    });

    it('should execute TTL and return the remaining time when the key has an expiry', async () => {
      const key = 'expiring-key';
      const remainingTime = 120;
      vi.spyOn(mockCommandExecutor, 'ttl').mockResolvedValue(remainingTime);

      const result = await beaconRedis.ttl(key);

      expect(result).toBe(remainingTime);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.ttl).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'TTL',
          instance: 'test-instance',
        }),
        'Redis command [TTL] executed successfully.'
      );
    });

    it('should execute TTL and return -1 when the key exists but has no expiry', async () => {
      const key = 'persistent-key';
      // The native client returns -1 for a key with no expiry.
      vi.spyOn(mockCommandExecutor, 'ttl').mockResolvedValue(-1);

      const result = await beaconRedis.ttl(key);

      expect(result).toBe(-1);
      expect(mockCommandExecutor.ttl).toHaveBeenCalledWith(key);
      // Check that it still logs success
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [TTL] executed successfully.'
      );
    });

    it('should execute TTL and return -2 when the key does not exist', async () => {
      const key = 'non-existent-key';
      // The native client returns -2 for a non-existent key.
      vi.spyOn(mockCommandExecutor, 'ttl').mockResolvedValue(-2);

      const result = await beaconRedis.ttl(key);

      expect(result).toBe(-2);
      expect(mockCommandExecutor.ttl).toHaveBeenCalledWith(key);
      // Check that it still logs success
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Redis command [TTL] executed successfully.'
      );
    });

    it('should execute INCR and return the new value', async () => {
      const key = 'my-counter';
      const newValue = 101;
      vi.spyOn(mockCommandExecutor, 'incr').mockResolvedValue(newValue);

      const result = await beaconRedis.incr(key);

      expect(result).toBe(newValue);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.incr).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'INCR',
          instance: 'test-instance',
        }),
        'Redis command [INCR] executed successfully.'
      );
    });

    it('should execute DECR and return the new value', async () => {
      const key = 'my-counter';
      const newValue = 99;
      vi.spyOn(mockCommandExecutor, 'decr').mockResolvedValue(newValue);

      const result = await beaconRedis.decr(key);

      expect(result).toBe(newValue);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.decr).toHaveBeenCalledWith(key);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'DECR',
          instance: 'test-instance',
        }),
        'Redis command [DECR] executed successfully.'
      );
    });

    it('should execute INCRBY and return the new value', async () => {
      const key = 'my-counter';
      const increment = 10;
      const newValue = 110;
      vi.spyOn(mockCommandExecutor, 'incrBy').mockResolvedValue(newValue);

      const result = await beaconRedis.incrBy(key, increment);

      expect(result).toBe(newValue);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.incrBy).toHaveBeenCalledWith(key, increment);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'INCRBY',
          instance: 'test-instance',
        }),
        'Redis command [INCRBY] executed successfully.'
      );
    });

    it('should execute DECRBY and return the new value', async () => {
      const key = 'my-counter';
      const decrement = 5;
      const newValue = 95;
      vi.spyOn(mockCommandExecutor, 'decrBy').mockResolvedValue(newValue);

      const result = await beaconRedis.decrBy(key, decrement);

      expect(result).toBe(newValue);
      expect(mockConnectionManager.ensureReady).toHaveBeenCalledOnce();
      expect(mockCommandExecutor.decrBy).toHaveBeenCalledWith(key, decrement);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'DECRBY',
          instance: 'test-instance',
        }),
        'Redis command [DECRBY] executed successfully.'
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

    it('should correctly handle HSET with a single field and value', async () => {
      vi.spyOn(mockCommandExecutor, 'hSet').mockResolvedValue(1);
      const key = 'myhash';
      const field = 'field1';
      const value = 'val1';

      const result = await beaconRedis.hSet(key, field, value);

      expect(result).toBe(1);
      expect(mockCommandExecutor.hSet).toHaveBeenCalledWith(key, field, value);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'HSET',
          instance: 'test-instance',
        }),
        'Redis command [HSET] executed successfully.'
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