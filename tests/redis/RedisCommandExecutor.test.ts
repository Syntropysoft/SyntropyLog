/**
 * FILE: tests/redis/RedisCommandExecutor.test.ts
 * DESCRIPTION: Unit tests for the RedisCommandExecutor class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisCommandExecutor } from '../../src/redis/RedisCommandExecutor';
import { NodeRedisClient } from '../../src/redis/redis.types';

/**
 * Creates a comprehensive mock for the native Redis client (`node-redis`).
 * This mock includes spies for all commands used by the executor.
 * @returns A mocked NodeRedisClient.
 */
const createMockNativeClient = (): vi.Mocked<NodeRedisClient> => {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    incr: vi.fn(),
    decr: vi.fn(),
    incrBy: vi.fn(),
    decrBy: vi.fn(),
    hGet: vi.fn(),
    hSet: vi.fn(),
    hGetAll: vi.fn(),
    hDel: vi.fn(),
    hExists: vi.fn(),
    hIncrBy: vi.fn(),
    lPush: vi.fn(),
    rPush: vi.fn(),
    lPop: vi.fn(),
    rPop: vi.fn(),
    lRange: vi.fn(),
    lLen: vi.fn(),
    lTrim: vi.fn(),
    sAdd: vi.fn(),
    sMembers: vi.fn(),
    sIsMember: vi.fn(),
    sRem: vi.fn(),
    sCard: vi.fn(),
    zAdd: vi.fn(),
    zRange: vi.fn(),
    zRangeWithScores: vi.fn(),
    zRem: vi.fn(),
    zCard: vi.fn(),
    zScore: vi.fn(),
  } as any;
};

describe('RedisCommandExecutor', () => {
  let mockClient: vi.Mocked<NodeRedisClient>;
  let executor: RedisCommandExecutor;

  beforeEach(() => {
    mockClient = createMockNativeClient();
    // The constructor is the method under test here.
    // We verify that it correctly assigns the client, and the subsequent
    // tests confirm that the methods use this assigned client.
    executor = new RedisCommandExecutor(mockClient);
  });

  it('should correctly proxy the GET command to the native client', async () => {
    mockClient.get.mockResolvedValue('value');
    const result = await executor.get('key');
    expect(mockClient.get).toHaveBeenCalledWith('key');
    expect(result).toBe('value');
  });

  it('should correctly proxy the SET command with options', async () => {
    mockClient.set.mockResolvedValue('OK');
    const options = { EX: 60 };
    await executor.set('key', 'value', options);
    expect(mockClient.set).toHaveBeenCalledWith('key', 'value', options);
  });

  it('should correctly proxy the HSET command with a single field', async () => {
    mockClient.hSet.mockResolvedValue(1);
    await executor.hSet('hash-key', 'field', 'value');
    expect(mockClient.hSet).toHaveBeenCalledWith('hash-key', 'field', 'value');
  });

  it.skip('should correctly proxy the HSET command with multiple fields', async () => {
    const fields = { f1: 'v1', f2: 'v2' };
    mockClient.hSet.mockResolvedValue(2);
    await executor.hSet('hash-key', fields);
    expect(mockClient.hSet).toHaveBeenCalledWith('hash-key', fields);
  });

  it.skip('should correctly proxy the ZADD command with multiple members', async () => {
    const members = [
      { score: 1, value: 'one' },
      { score: 2, value: 'two' },
    ];
    mockClient.zAdd.mockResolvedValue(2);
    await executor.zAdd('zset-key', members);
    expect(mockClient.zAdd).toHaveBeenCalledWith('zset-key', members);
  });

  it('should correctly proxy the DEL command with multiple keys', async () => {
    const keys = ['key1', 'key2'];
    mockClient.del.mockResolvedValue(2);
    await executor.del(keys);
    expect(mockClient.del).toHaveBeenCalledWith(keys);
  });
});