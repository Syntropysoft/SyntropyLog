/**
 * FILE: tests/redis/RedisCommandExecutor.test.ts
 * DESCRIPTION: Unit tests for the RedisCommandExecutor class.
 * This file tests that the executor correctly delegates commands to the native redis client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisCommandExecutor } from '../../src/redis/RedisCommandExecutor';
import { RedisClientType } from '@redis/client';
import { RedisZMember } from '../../src/redis/redis.types';

// Helper to create a deeply mocked native client for type safety
const createMockNativeClient = () => {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    hSet: vi.fn(),
    hGet: vi.fn(),
    hDel: vi.fn(),
    hExists: vi.fn(),
    hIncrBy: vi.fn(),
    hGetAll: vi.fn(),
    lPush: vi.fn(),
    rPush: vi.fn(),
    lPop: vi.fn(),
    rPop: vi.fn(),
    lLen: vi.fn(),
    lTrim: vi.fn(),
    lRange: vi.fn(),
    sAdd: vi.fn(),
    sRem: vi.fn(),
    sMembers: vi.fn(),
    sIsMember: vi.fn(),
    sCard: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    eval: vi.fn(),
    zRange: vi.fn(),
    zRangeWithScores: vi.fn(),
    zRem: vi.fn(),
    zCard: vi.fn(),
    zScore: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    incr: vi.fn(),
    decr: vi.fn(),
    incrBy: vi.fn(),
    decrBy: vi.fn(),
    zAdd: vi.fn(),
    // Add any other methods you need to mock for tests
  } as unknown as vi.Mocked<RedisClientType>;
};

describe('RedisCommandExecutor', () => {
  let mockNativeClient: vi.Mocked<RedisClientType>;
  let executor: RedisCommandExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNativeClient = createMockNativeClient();
    // Assuming the executor's constructor takes the native client
    executor = new RedisCommandExecutor(mockNativeClient);
  });

  it('should delegate GET command to the native client', async () => {
    mockNativeClient.get.mockResolvedValue('value');
    const result = await executor.get('key');
    expect(result).toBe('value');
    expect(mockNativeClient.get).toHaveBeenCalledWith('key');
    expect(mockNativeClient.get).toHaveBeenCalledTimes(1);
  });

  describe('SET command', () => {
    it('should delegate SET command without options to the native client', async () => {
      const key = 'my-key';
      const value = 'my-value';
      await executor.set(key, value);
      expect(mockNativeClient.set).toHaveBeenCalledWith(key, value, undefined);
      expect(mockNativeClient.set).toHaveBeenCalledTimes(1);
    });

    it('should delegate SET command with options to the native client', async () => {
      const options = { EX: 60 };
      await executor.set('key', 'value', options);
      expect(mockNativeClient.set).toHaveBeenCalledWith('key', 'value', options);
      expect(mockNativeClient.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('EXISTS command', () => {
    it('should delegate EXISTS command for a single key to the native client', async () => {
      const key = 'my-key';
      mockNativeClient.exists.mockResolvedValue(1);

      const result = await executor.exists(key);

      expect(result).toBe(1);
      expect(mockNativeClient.exists).toHaveBeenCalledWith(key);
      expect(mockNativeClient.exists).toHaveBeenCalledTimes(1);
    });

    it('should delegate EXISTS command for multiple keys to the native client', async () => {
      const keys = ['key1', 'key2'];
      mockNativeClient.exists.mockResolvedValue(2);

      const result = await executor.exists(keys);

      expect(result).toBe(2);
      expect(mockNativeClient.exists).toHaveBeenCalledWith(keys);
      expect(mockNativeClient.exists).toHaveBeenCalledTimes(1);
    });
  });

  describe('EXPIRE command', () => {
    it('should delegate EXPIRE command and return true when key exists', async () => {
      const key = 'my-key';
      const seconds = 60;
      mockNativeClient.expire.mockResolvedValue(true);

      const result = await executor.expire(key, seconds);

      expect(result).toBe(true);
      expect(mockNativeClient.expire).toHaveBeenCalledWith(key, seconds);
      expect(mockNativeClient.expire).toHaveBeenCalledTimes(1);
    });

    it('should delegate EXPIRE command and return false when key does not exist', async () => {
      const key = 'non-existent-key';
      const seconds = 60;
      mockNativeClient.expire.mockResolvedValue(false);

      const result = await executor.expire(key, seconds);

      expect(result).toBe(false);
      expect(mockNativeClient.expire).toHaveBeenCalledWith(key, seconds);
      expect(mockNativeClient.expire).toHaveBeenCalledTimes(1);
    });
  });

  describe('TTL command', () => {
    it('should delegate TTL command and return the remaining time', async () => {
      const key = 'my-key';
      const remainingTime = 123;
      mockNativeClient.ttl.mockResolvedValue(remainingTime);

      const result = await executor.ttl(key);

      expect(result).toBe(remainingTime);
      expect(mockNativeClient.ttl).toHaveBeenCalledWith(key);
      expect(mockNativeClient.ttl).toHaveBeenCalledTimes(1);
    });

    it('should delegate TTL command and return -1 for a key with no expiry', async () => {
      const key = 'persistent-key';
      mockNativeClient.ttl.mockResolvedValue(-1);

      const result = await executor.ttl(key);

      expect(result).toBe(-1);
      expect(mockNativeClient.ttl).toHaveBeenCalledWith(key);
    });

    it('should delegate TTL command and return -2 for a non-existent key', async () => {
      const key = 'non-existent-key';
      mockNativeClient.ttl.mockResolvedValue(-2);

      const result = await executor.ttl(key);

      expect(result).toBe(-2);
      expect(mockNativeClient.ttl).toHaveBeenCalledWith(key);
    });
  });

  describe('Numeric commands', () => {
    it('should delegate INCR command and return the new value', async () => {
      const key = 'my-counter';
      const newValue = 101;
      mockNativeClient.incr.mockResolvedValue(newValue);

      const result = await executor.incr(key);

      expect(result).toBe(newValue);
      expect(mockNativeClient.incr).toHaveBeenCalledWith(key);
      expect(mockNativeClient.incr).toHaveBeenCalledTimes(1);
    });

    it('should delegate DECR command and return the new value', async () => {
      const key = 'my-counter';
      const newValue = 99;
      mockNativeClient.decr.mockResolvedValue(newValue);

      const result = await executor.decr(key);

      expect(result).toBe(newValue);
      expect(mockNativeClient.decr).toHaveBeenCalledWith(key);
      expect(mockNativeClient.decr).toHaveBeenCalledTimes(1);
    });

    it('should delegate INCRBY command and return the new value', async () => {
      const key = 'my-counter';
      const increment = 10;
      const newValue = 110;
      mockNativeClient.incrBy.mockResolvedValue(newValue);

      const result = await executor.incrBy(key, increment);

      expect(result).toBe(newValue);
      expect(mockNativeClient.incrBy).toHaveBeenCalledWith(key, increment);
      expect(mockNativeClient.incrBy).toHaveBeenCalledTimes(1);
    });

    it('should delegate DECRBY command and return the new value', async () => {
      const key = 'my-counter';
      const decrement = 5;
      const newValue = 95;
      mockNativeClient.decrBy.mockResolvedValue(newValue);

      const result = await executor.decrBy(key, decrement);

      expect(result).toBe(newValue);
      expect(mockNativeClient.decrBy).toHaveBeenCalledWith(key, decrement);
      expect(mockNativeClient.decrBy).toHaveBeenCalledTimes(1);
    });
  });

  describe('HSET command', () => {
    it('should delegate HSET command (single field) to the native client', async () => {
      await executor.hSet('key', 'field', 'value');
      expect(mockNativeClient.hSet).toHaveBeenCalledWith('key', 'field', 'value');
      expect(mockNativeClient.hSet).toHaveBeenCalledTimes(1);
    });

    it('should delegate HSET command (multiple fields) to the native client', async () => {
      const fields = { field1: 'value1', field2: 'value2' };
      await executor.hSet('key', fields);
      expect(mockNativeClient.hSet).toHaveBeenCalledWith('key', fields);
      expect(mockNativeClient.hSet).toHaveBeenCalledTimes(1);
    });
  });

  describe('HGET command', () => {
    it('should delegate HGET command and return the value when field exists', async () => {
      const key = 'my-hash';
      const field = 'my-field';
      const value = 'my-value';
      mockNativeClient.hGet.mockResolvedValue(value);

      const result = await executor.hGet(key, field);

      expect(result).toBe(value);
      expect(mockNativeClient.hGet).toHaveBeenCalledWith(key, field);
      expect(mockNativeClient.hGet).toHaveBeenCalledTimes(1);
    });

    it('should delegate HGET command and return undefined when field does not exist', async () => {
      const key = 'my-hash';
      const field = 'non-existent-field';
      mockNativeClient.hGet.mockResolvedValue(undefined);

      const result = await executor.hGet(key, field);

      expect(result).toBeUndefined();
      expect(mockNativeClient.hGet).toHaveBeenCalledWith(key, field);
    });
  });

  describe('HGETALL command', () => {
    it('should delegate HGETALL command and return a record when the hash exists', async () => {
      const key = 'my-hash';
      const hashData = { field1: 'value1', field2: 'value2' };
      mockNativeClient.hGetAll.mockResolvedValue(hashData);

      const result = await executor.hGetAll(key);

      expect(result).toEqual(hashData);
      expect(mockNativeClient.hGetAll).toHaveBeenCalledWith(key);
      expect(mockNativeClient.hGetAll).toHaveBeenCalledTimes(1);
    });

    it('should delegate HGETALL command and return an empty object when the hash does not exist', async () => {
      const key = 'non-existent-hash';
      // The native client returns an empty object for a non-existent key.
      mockNativeClient.hGetAll.mockResolvedValue({});

      const result = await executor.hGetAll(key);

      expect(result).toEqual({});
      expect(mockNativeClient.hGetAll).toHaveBeenCalledWith(key);
      expect(mockNativeClient.hGetAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('HDEL command', () => {
    it('should delegate HDEL command for a single field', async () => {
      const key = 'my-hash';
      const field = 'field-to-delete';
      mockNativeClient.hDel.mockResolvedValue(1);

      const result = await executor.hDel(key, field);

      expect(result).toBe(1);
      expect(mockNativeClient.hDel).toHaveBeenCalledWith(key, field);
      expect(mockNativeClient.hDel).toHaveBeenCalledTimes(1);
    });

    it('should delegate HDEL command for multiple fields', async () => {
      const key = 'my-hash';
      const fields = ['field1', 'field2'];
      mockNativeClient.hDel.mockResolvedValue(2);

      const result = await executor.hDel(key, fields);

      expect(result).toBe(2);
      expect(mockNativeClient.hDel).toHaveBeenCalledWith(key, fields);
      expect(mockNativeClient.hDel).toHaveBeenCalledTimes(1);
    });
  });

  describe('HEXISTS command', () => {
    it('should delegate HEXISTS command and return true if field exists', async () => {
      const key = 'my-hash';
      const field = 'existing-field';
      mockNativeClient.hExists.mockResolvedValue(true);

      const result = await executor.hExists(key, field);

      expect(result).toBe(true);
      expect(mockNativeClient.hExists).toHaveBeenCalledWith(key, field);
      expect(mockNativeClient.hExists).toHaveBeenCalledTimes(1);
    });

    it('should delegate HEXISTS command and return false if field does not exist', async () => {
      const key = 'my-hash';
      const field = 'non-existent-field';
      mockNativeClient.hExists.mockResolvedValue(false);

      const result = await executor.hExists(key, field);

      expect(result).toBe(false);
      expect(mockNativeClient.hExists).toHaveBeenCalledWith(key, field);
      expect(mockNativeClient.hExists).toHaveBeenCalledTimes(1);
    });
  });

  describe('HINCRBY command', () => {
    it('should delegate HINCRBY command and return the new value', async () => {
      const key = 'my-hash';
      const field = 'counter';
      const increment = 5;
      const newValue = 15;
      mockNativeClient.hIncrBy.mockResolvedValue(newValue);

      const result = await executor.hIncrBy(key, field, increment);

      expect(result).toBe(newValue);
      expect(mockNativeClient.hIncrBy).toHaveBeenCalledWith(
        key,
        field,
        increment
      );
      expect(mockNativeClient.hIncrBy).toHaveBeenCalledTimes(1);
    });
  });

  describe('List commands', () => {
    describe('LPUSH', () => {
      it('should delegate LPUSH command for a single element', async () => {
        const key = 'my-list';
        const element = 'item1';
        mockNativeClient.lPush.mockResolvedValue(1);

        const result = await executor.lPush(key, element);

        expect(result).toBe(1);
        expect(mockNativeClient.lPush).toHaveBeenCalledWith(key, element);
        expect(mockNativeClient.lPush).toHaveBeenCalledTimes(1);
      });

      it('should delegate LPUSH command for multiple elements', async () => {
        const key = 'my-list';
        const elements = ['item1', 'item2'];
        mockNativeClient.lPush.mockResolvedValue(2);

        const result = await executor.lPush(key, elements);

        expect(result).toBe(2);
        expect(mockNativeClient.lPush).toHaveBeenCalledWith(key, elements);
        expect(mockNativeClient.lPush).toHaveBeenCalledTimes(1);
      });
    });

    describe('RPUSH', () => {
      it('should delegate RPUSH command for a single element', async () => {
        const key = 'my-list';
        const element = 'item1';
        mockNativeClient.rPush.mockResolvedValue(1);

        const result = await executor.rPush(key, element);

        expect(result).toBe(1);
        expect(mockNativeClient.rPush).toHaveBeenCalledWith(key, element);
        expect(mockNativeClient.rPush).toHaveBeenCalledTimes(1);
      });

      it('should delegate RPUSH command for multiple elements', async () => {
        const key = 'my-list';
        const elements = ['item1', 'item2'];
        mockNativeClient.rPush.mockResolvedValue(2);

        const result = await executor.rPush(key, elements);

        expect(result).toBe(2);
        expect(mockNativeClient.rPush).toHaveBeenCalledWith(key, elements);
        expect(mockNativeClient.rPush).toHaveBeenCalledTimes(1);
      });
    });

    describe('LPOP', () => {
      it('should delegate LPOP command and return a value', async () => {
        const key = 'my-list';
        const value = 'first-item';
        mockNativeClient.lPop.mockResolvedValue(value);

        const result = await executor.lPop(key);

        expect(result).toBe(value);
        expect(mockNativeClient.lPop).toHaveBeenCalledWith(key);
        expect(mockNativeClient.lPop).toHaveBeenCalledTimes(1);
      });

      it('should delegate LPOP command and return null for an empty list', async () => {
        const key = 'empty-list';
        mockNativeClient.lPop.mockResolvedValue(null);

        const result = await executor.lPop(key);

        expect(result).toBeNull();
        expect(mockNativeClient.lPop).toHaveBeenCalledWith(key);
      });
    });

    describe('LRANGE', () => {
      it('should delegate LRANGE command and return an array of elements', async () => {
        const key = 'my-list';
        const listSlice = ['item1', 'item2'];
        mockNativeClient.lRange.mockResolvedValue(listSlice);

        const result = await executor.lRange(key, 0, 1);

        expect(result).toEqual(listSlice);
        expect(mockNativeClient.lRange).toHaveBeenCalledWith(key, 0, 1);
        expect(mockNativeClient.lRange).toHaveBeenCalledTimes(1);
      });
    });

    describe('RPOP', () => {
      it('should delegate RPOP command and return a value', async () => {
        const key = 'my-list';
        const value = 'last-item';
        mockNativeClient.rPop.mockResolvedValue(value);

        const result = await executor.rPop(key);

        expect(result).toBe(value);
        expect(mockNativeClient.rPop).toHaveBeenCalledWith(key);
        expect(mockNativeClient.rPop).toHaveBeenCalledTimes(1);
      });

      it('should delegate RPOP command and return null for an empty list', async () => {
        const key = 'empty-list';
        mockNativeClient.rPop.mockResolvedValue(null);

        const result = await executor.rPop(key);

        expect(result).toBeNull();
        expect(mockNativeClient.rPop).toHaveBeenCalledWith(key);
      });
    });

    describe('LLEN', () => {
      it('should delegate LLEN command and return the list length', async () => {
        const key = 'my-list';
        const length = 5;
        mockNativeClient.lLen.mockResolvedValue(length);

        const result = await executor.lLen(key);

        expect(result).toBe(length);
        expect(mockNativeClient.lLen).toHaveBeenCalledWith(key);
        expect(mockNativeClient.lLen).toHaveBeenCalledTimes(1);
      });

      it('should delegate LLEN command and return 0 for a non-existent list', async () => {
        const key = 'non-existent-list';
        mockNativeClient.lLen.mockResolvedValue(0);

        const result = await executor.lLen(key);

        expect(result).toBe(0);
        expect(mockNativeClient.lLen).toHaveBeenCalledWith(key);
      });
    });

    describe('LTRIM', () => {
      it('should delegate LTRIM command and return "OK"', async () => {
        const key = 'my-list';
        mockNativeClient.lTrim.mockResolvedValue('OK');

        const result = await executor.lTrim(key, 1, 2);

        expect(result).toBe('OK');
        expect(mockNativeClient.lTrim).toHaveBeenCalledWith(key, 1, 2);
        expect(mockNativeClient.lTrim).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Set commands', () => {
    describe('SADD', () => {
      it('should delegate SADD command for a single member', async () => {
        const key = 'my-set';
        const member = 'member1';
        mockNativeClient.sAdd.mockResolvedValue(1);

        const result = await executor.sAdd(key, member);

        expect(result).toBe(1);
        expect(mockNativeClient.sAdd).toHaveBeenCalledWith(key, member);
        expect(mockNativeClient.sAdd).toHaveBeenCalledTimes(1);
      });

      it('should delegate SADD command for multiple members', async () => {
        const key = 'my-set';
        const members = ['member1', 'member2'];
        mockNativeClient.sAdd.mockResolvedValue(2);

        const result = await executor.sAdd(key, members);

        expect(result).toBe(2);
        expect(mockNativeClient.sAdd).toHaveBeenCalledWith(key, members);
        expect(mockNativeClient.sAdd).toHaveBeenCalledTimes(1);
      });
    });

    describe('SREM', () => {
      it('should delegate SREM command for a single member', async () => {
        const key = 'my-set';
        const member = 'member1';
        mockNativeClient.sRem.mockResolvedValue(1);

        const result = await executor.sRem(key, member);

        expect(result).toBe(1);
        expect(mockNativeClient.sRem).toHaveBeenCalledWith(key, member);
        expect(mockNativeClient.sRem).toHaveBeenCalledTimes(1);
      });

      it('should delegate SREM command for multiple members', async () => {
        const key = 'my-set';
        const members = ['member1', 'member2'];
        mockNativeClient.sRem.mockResolvedValue(2);

        const result = await executor.sRem(key, members);

        expect(result).toBe(2);
        expect(mockNativeClient.sRem).toHaveBeenCalledWith(key, members);
        expect(mockNativeClient.sRem).toHaveBeenCalledTimes(1);
      });
    });

    describe('SMEMBERS', () => {
      it('should delegate SMEMBERS command and return an array of members', async () => {
        const key = 'my-set';
        const members = ['member1', 'member2'];
        mockNativeClient.sMembers.mockResolvedValue(members);

        const result = await executor.sMembers(key);

        expect(result).toEqual(members);
        expect(mockNativeClient.sMembers).toHaveBeenCalledWith(key);
        expect(mockNativeClient.sMembers).toHaveBeenCalledTimes(1);
      });

      it('should delegate SMEMBERS command and return an empty array for a non-existent set', async () => {
        const key = 'empty-set';
        mockNativeClient.sMembers.mockResolvedValue([]);

        const result = await executor.sMembers(key);

        expect(result).toEqual([]);
        expect(mockNativeClient.sMembers).toHaveBeenCalledWith(key);
      });
    });

    describe('SISMEMBER', () => {
      it('should delegate SISMEMBER command and return true if member exists', async () => {
        const key = 'my-set';
        const member = 'existing-member';
        mockNativeClient.sIsMember.mockResolvedValue(true);

        const result = await executor.sIsMember(key, member);

        expect(result).toBe(true);
        expect(mockNativeClient.sIsMember).toHaveBeenCalledWith(key, member);
        expect(mockNativeClient.sIsMember).toHaveBeenCalledTimes(1);
      });

      it('should delegate SISMEMBER command and return false if member does not exist', async () => {
        const key = 'my-set';
        const member = 'non-existent-member';
        mockNativeClient.sIsMember.mockResolvedValue(false);

        const result = await executor.sIsMember(key, member);

        expect(result).toBe(false);
        expect(mockNativeClient.sIsMember).toHaveBeenCalledWith(key, member);
      });
    });

    describe('SCARD', () => {
      it('should delegate SCARD command and return the cardinality of the set', async () => {
        const key = 'my-set';
        const cardinality = 3;
        mockNativeClient.sCard.mockResolvedValue(cardinality);

        const result = await executor.sCard(key);

        expect(result).toBe(cardinality);
        expect(mockNativeClient.sCard).toHaveBeenCalledWith(key);
        expect(mockNativeClient.sCard).toHaveBeenCalledTimes(1);
      });

      it('should delegate SCARD command and return 0 for a non-existent set', async () => {
        const key = 'empty-set';
        mockNativeClient.sCard.mockResolvedValue(0);

        const result = await executor.sCard(key);

        expect(result).toBe(0);
        expect(mockNativeClient.sCard).toHaveBeenCalledWith(key);
        expect(mockNativeClient.sCard).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Pub/Sub commands', () => {
    describe('PUBLISH', () => {
      it('should delegate PUBLISH command and return the number of receivers', async () => {
        const channel = 'news-channel';
        const message = 'Hello world!';
        const receivers = 2;
        mockNativeClient.publish.mockResolvedValue(receivers);

        const result = await executor.publish(channel, message);

        expect(result).toBe(receivers);
        expect(mockNativeClient.publish).toHaveBeenCalledWith(channel, message);
        expect(mockNativeClient.publish).toHaveBeenCalledTimes(1);
      });
    });

    describe('SUBSCRIBE', () => {
      it('should delegate SUBSCRIBE command with the correct channel and listener', async () => {
        const channel = 'news-channel';
        const listener = vi.fn();
        // The subscribe method might not return anything, or might return void.
        // We don't need to mock a return value if we're just checking the call.
        // Let's assume it's async and returns void.
        mockNativeClient.subscribe.mockResolvedValue(undefined);

        await executor.subscribe(channel, listener);

        expect(mockNativeClient.subscribe).toHaveBeenCalledWith(
          channel,
          listener
        );
        expect(mockNativeClient.subscribe).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Scripting commands', () => {
    describe('EVAL', () => {
      it('should delegate EVAL command with a script, keys, and args', async () => {
        const script = 'return {KEYS[1], ARGV[1]}';
        const keys = ['mykey'];
        const args = ['myarg'];
        const expectedResult = ['mykey', 'myarg'];
        mockNativeClient.eval.mockResolvedValue(expectedResult);

        const result = await executor.eval(script, keys, args);

        expect(result).toEqual(expectedResult);
        expect(mockNativeClient.eval).toHaveBeenCalledWith(script, {
          keys,
          arguments: args,
        });
        expect(mockNativeClient.eval).toHaveBeenCalledTimes(1);
      });

      it('should delegate EVAL command with only a script and empty arrays', async () => {
        const script = "return 'hello'";
        mockNativeClient.eval.mockResolvedValue('hello');

        await executor.eval(script, [], []);

        expect(mockNativeClient.eval).toHaveBeenCalledWith(script, {
          keys: [],
          arguments: [],
        });
      });
    });
  });

  describe('Pub/Sub commands', () => {
    describe('PUBLISH', () => {
      it('should delegate PUBLISH command and return the number of receivers', async () => {
        const channel = 'news-channel';
        const message = 'Hello world!';
        const receivers = 2;
        mockNativeClient.publish.mockResolvedValue(receivers);

        const result = await executor.publish(channel, message);

        expect(result).toBe(receivers);
        expect(mockNativeClient.publish).toHaveBeenCalledWith(channel, message);
        expect(mockNativeClient.publish).toHaveBeenCalledTimes(1);
      });
    });

    describe('SUBSCRIBE', () => {
      it('should delegate SUBSCRIBE command with the correct channel and listener', async () => {
        const channel = 'news-channel';
        const listener = vi.fn();
        mockNativeClient.subscribe.mockResolvedValue(undefined);

        await executor.subscribe(channel, listener);

        expect(mockNativeClient.subscribe).toHaveBeenCalledWith(
          channel,
          listener
        );
        expect(mockNativeClient.subscribe).toHaveBeenCalledTimes(1);
      });
    });

    describe('UNSUBSCRIBE', () => {
      it('should delegate UNSUBSCRIBE command without arguments', async () => {
        mockNativeClient.unsubscribe.mockResolvedValue(undefined);

        await executor.unsubscribe();

        expect(mockNativeClient.unsubscribe).toHaveBeenCalledWith();
        expect(mockNativeClient.unsubscribe).toHaveBeenCalledTimes(1);
      });

      it('should delegate UNSUBSCRIBE command with a channel', async () => {
        const channel = 'news-channel';
        mockNativeClient.unsubscribe.mockResolvedValue(undefined);

        await executor.unsubscribe(channel);

        expect(mockNativeClient.unsubscribe).toHaveBeenCalledWith(channel);
        expect(mockNativeClient.unsubscribe).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Sorted Set (ZSET) commands', () => {
    describe('ZADD', () => {
      it('should delegate ZADD command (single member) to the native client', async () => {
        await executor.zAdd('key', 10, 'member1');
        expect(mockNativeClient.zAdd).toHaveBeenCalledWith('key', {
          score: 10,
          value: 'member1',
        });

        expect(mockNativeClient.zAdd).toHaveBeenCalledTimes(1);
      });

      it('should delegate ZADD command (multiple members) to the native client', async () => {
        const members: RedisZMember[] = [
          { score: 10, value: 'member1' },
          { score: 20, value: 'member2' },
        ];
        await executor.zAdd('key', members);
        // This assertion now passes because the executor calls the client correctly
        expect(mockNativeClient.zAdd).toHaveBeenCalledWith('key', members);
        expect(mockNativeClient.zAdd).toHaveBeenCalledTimes(1);
      });
    });

    describe('ZRANGE', () => {
      it('should delegate ZRANGE command and return an array of members', async () => {
        const key = 'my-zset';
        const members = ['member1', 'member2'];
        mockNativeClient.zRange.mockResolvedValue(members);

        const result = await executor.zRange(key, 0, 1);

        expect(result).toEqual(members);
        expect(mockNativeClient.zRange).toHaveBeenCalledWith(key, 0, 1, undefined);
        expect(mockNativeClient.zRange).toHaveBeenCalledTimes(1);
      });

      it('should delegate ZRANGE command with options', async () => {
        const key = 'my-zset';
        const options = { REV: true };
        mockNativeClient.zRange.mockResolvedValue(['member2', 'member1']);

        const result = await executor.zRange(key, 0, 1, options);

        expect(result).toEqual(['member2', 'member1']);
        expect(mockNativeClient.zRange).toHaveBeenCalledWith(key, 0, 1, options);
        expect(mockNativeClient.zRange).toHaveBeenCalledTimes(1);
      });
    });

    describe('ZRANGE WITHSCORES', () => {
      it('should delegate ZRANGE WITHSCORES command and return members with scores', async () => {
        const key = 'my-zset';
        const membersWithScores = [
          { score: 10, value: 'member1' },
          { score: 20, value: 'member2' },
        ];
        mockNativeClient.zRangeWithScores.mockResolvedValue(membersWithScores);

        const result = await executor.zRangeWithScores(key, 0, 1);

        expect(result).toEqual(membersWithScores);
        expect(mockNativeClient.zRangeWithScores).toHaveBeenCalledWith(
          key,
          0,
          1,
          undefined
        );
        expect(mockNativeClient.zRangeWithScores).toHaveBeenCalledTimes(1);
      });

      it('should delegate ZRANGE WITHSCORES command with options', async () => {
        const key = 'my-zset';
        const options = { REV: true };
        mockNativeClient.zRangeWithScores.mockResolvedValue([]);

        await executor.zRangeWithScores(key, 0, 1, options);

        expect(mockNativeClient.zRangeWithScores).toHaveBeenCalledWith(
          key,
          0,
          1,
          options
        );
        expect(mockNativeClient.zRangeWithScores).toHaveBeenCalledTimes(1);
      });
    });

    describe('ZREM', () => {
      it('should delegate ZREM command for a single member', async () => {
        const key = 'my-zset';
        const member = 'member-to-remove';
        mockNativeClient.zRem.mockResolvedValue(1);

        const result = await executor.zRem(key, member);

        expect(result).toBe(1);
        expect(mockNativeClient.zRem).toHaveBeenCalledWith(key, member);
        expect(mockNativeClient.zRem).toHaveBeenCalledTimes(1);
      });

      it('should delegate ZREM command for multiple members', async () => {
        const key = 'my-zset';
        const members = ['member1', 'member2'];
        mockNativeClient.zRem.mockResolvedValue(2);

        const result = await executor.zRem(key, members);

        expect(result).toBe(2);
        expect(mockNativeClient.zRem).toHaveBeenCalledWith(key, members);
        expect(mockNativeClient.zRem).toHaveBeenCalledTimes(1);
      });
    });

    describe('ZCARD', () => {
      it('should delegate ZCARD command and return the cardinality', async () => {
        const key = 'my-zset';
        mockNativeClient.zCard.mockResolvedValue(5);

        const result = await executor.zCard(key);

        expect(result).toBe(5);
        expect(mockNativeClient.zCard).toHaveBeenCalledWith(key);
        expect(mockNativeClient.zCard).toHaveBeenCalledTimes(1);
      });

      it('should delegate ZCARD command and return 0 for a non-existent key', async () => {
        const key = 'empty-zset';
        mockNativeClient.zCard.mockResolvedValue(0);

        const result = await executor.zCard(key);

        expect(result).toBe(0);
        expect(mockNativeClient.zCard).toHaveBeenCalledWith(key);
      });
    });

    describe('ZSCORE', () => {
      it('should delegate ZSCORE command and return the score', async () => {
        const key = 'my-zset';
        const member = 'member1';
        const score = 123.45;
        mockNativeClient.zScore.mockResolvedValue(score);

        const result = await executor.zScore(key, member);

        expect(result).toBe(score);
        expect(mockNativeClient.zScore).toHaveBeenCalledWith(key, member);
        expect(mockNativeClient.zScore).toHaveBeenCalledTimes(1);
      });

      it('should delegate ZSCORE command and return null for a non-existent member', async () => {
        const key = 'my-zset';
        const member = 'non-existent-member';
        mockNativeClient.zScore.mockResolvedValue(null);

        const result = await executor.zScore(key, member);

        expect(result).toBeNull();
        expect(mockNativeClient.zScore).toHaveBeenCalledWith(key, member);
      });
    });
  });

  describe('DEL command', () => {
    it('should delegate DEL command for a single key to the native client', async () => {
      await executor.del('key1');
      expect(mockNativeClient.del).toHaveBeenCalledWith('key1');
      expect(mockNativeClient.del).toHaveBeenCalledTimes(1);
    });

    it('should delegate DEL command for multiple keys to the native client', async () => {
      const keys = ['key1', 'key2'];
      await executor.del(keys);
      expect(mockNativeClient.del).toHaveBeenCalledWith(keys);
      expect(mockNativeClient.del).toHaveBeenCalledTimes(1);
    });
  });
});