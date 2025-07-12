/**
 * FILE: tests/redis/BeaconRedisMock.test.ts
 * DESCRIPTION: Unit tests for the BeaconRedisMock class.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BeaconRedisMock } from '../../src/redis/BeaconRedisMock';
import { ILogger } from '../../src/logger/ILogger';

const createMockLogger = (): ILogger => {
  const logger: any = {
    child: vi.fn(() => logger),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger as ILogger;
};

describe('BeaconRedisMock', () => {
  let mock: BeaconRedisMock;
  let logger: ILogger;

  beforeEach(() => {
    logger = createMockLogger();
    mock = new BeaconRedisMock('test-mock', logger);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Lifecycle and Management', () => {
    it('should return the correct instance name', () => {
      expect(mock.getInstanceName()).toBe('test-mock');
    });

    it('should create its own logger if none is provided', () => {
      const standaloneMock = new BeaconRedisMock();
      expect(standaloneMock.getInstanceName()).toBe('default_mock');
      // The internal logger should be a simple, functional mock object.
      expect(standaloneMock['logger']).toBeDefined();
      expect(standaloneMock['logger'].info).toBeInstanceOf(Function);
      // It should not throw when called
      expect(() => standaloneMock['logger'].info('test')).not.toThrow();
    });

    it('should call logger on updateConfig', () => {
      const newConfig = { some: 'value' };
      mock.updateConfig(newConfig);
      expect(logger.debug).toHaveBeenCalledWith(
        '[BeaconRedisMock] updateConfig called',
        { newConfig }
      );
    });

    it('should have no-op connect and quit methods', async () => {
      await expect(mock.connect()).resolves.toBeUndefined();
      await expect(mock.quit()).resolves.toBeUndefined();
    });

    it('should always report as healthy', async () => {
      expect(await mock.isHealthy()).toBe(true);
    });

    it('should return itself as the native client', () => {
      expect(mock.getNativeClient()).toBe(mock);
    });
  });

  describe('Key Commands & Expiration', () => {
    it('should set and get a string value', async () => {
      await mock.set('key1', 'value1');
      expect(await mock.get('key1')).toBe('value1');
    });

    it('should return null for a non-existent key', async () => {
      expect(await mock.get('nonexistent')).toBeNull();
    });

    it('should delete keys and return the count', async () => {
      await mock.set('key1', 'v1');
      await mock.set('key2', 'v2');
      expect(await mock.del('key1')).toBe(1);
      expect(await mock.get('key1')).toBeNull();
      expect(await mock.del(['key2', 'key3'])).toBe(1);
      expect(await mock.get('key2')).toBeNull();
    });

    it('should check for existence of keys', async () => {
      await mock.set('key1', 'v1');
      expect(await mock.exists('key1')).toBe(1);
      expect(await mock.exists('nonexistent')).toBe(0);
      await mock.set('key2', 'v2');
      expect(await mock.exists(['key1', 'key2', 'key3'])).toBe(2);
    });

    it('should expire a key after the specified TTL', async () => {
      await mock.set('expiring', 'data', 2); // 2 seconds TTL
      expect(await mock.get('expiring')).toBe('data');
      vi.advanceTimersByTime(1000);
      expect(await mock.get('expiring')).toBe('data');
      vi.advanceTimersByTime(1001);
      expect(await mock.get('expiring')).toBeNull();
    });

    it('should handle expire command correctly', async () => {
      await mock.set('persistent', 'data');
      expect(await mock.expire('persistent', 5)).toBe(true);
      expect(await mock.ttl('persistent')).toBe(5);
      expect(await mock.expire('nonexistent', 5)).toBe(false);
    });

    it('should return correct TTL values', async () => {
      await mock.set('key-ttl', 'v', 10);
      await mock.set('key-persist', 'v');
      expect(await mock.ttl('key-ttl')).toBe(10);
      expect(await mock.ttl('key-persist')).toBe(-1);
      expect(await mock.ttl('nonexistent')).toBe(-2);
    });
  });

  describe('Type Safety', () => {
    it('should throw WRONGTYPE error for operations on wrong key types', async () => {
      await mock.set('stringKey', 'hello');
      await mock.lPush('listKey', 'a');

      await expect(mock.hGet('stringKey', 'field')).rejects.toThrow(
        'WRONGTYPE'
      );
      await expect(mock.lPop('stringKey')).rejects.toThrow('WRONGTYPE');
      await expect(mock.sAdd('stringKey', 'member')).rejects.toThrow(
        'WRONGTYPE'
      );
      await expect(mock.zAdd('stringKey', 1, 'member')).rejects.toThrow(
        'WRONGTYPE'
      );
      await expect(mock.get('listKey')).rejects.toThrow('WRONGTYPE');
    });
  });

  describe('Numeric Commands', () => {
    it('should incr a non-existent key to 1', async () => {
      expect(await mock.incr('counter')).toBe(1);
    });

    it('should incr an existing integer value', async () => {
      await mock.set('counter', '5');
      expect(await mock.incr('counter')).toBe(6);
    });

    it('should decr a non-existent key to -1', async () => {
      expect(await mock.decr('counter')).toBe(-1);
    });

    it('should incrBy and decrBy correctly', async () => {
      await mock.set('counter', '10');
      expect(await mock.incrBy('counter', 5)).toBe(15);
      expect(await mock.decrBy('counter', 3)).toBe(12);
    });

    it('should throw an error when incrementing a non-integer value', async () => {
      await mock.set('not-a-number', 'hello');
      await expect(mock.incr('not-a-number')).rejects.toThrow(
        'ERR value is not an integer or out of range'
      );
    });
  });

  describe('Hash Commands', () => {
    beforeEach(async () => {
      await mock.hSet('myhash', { f1: 'v1', f2: 'v2' });
    });

    it('should hSet and hGet values', async () => {
      expect(await mock.hSet('myhash', 'f3', 'v3')).toBe(1);
      expect(await mock.hGet('myhash', 'f1')).toBe('v1');
      expect(await mock.hGet('myhash', 'f3')).toBe('v3');
      expect(await mock.hGet('myhash', 'nonexistent')).toBeNull();
    });

    it('should hGetAll values', async () => {
      expect(await mock.hGetAll('myhash')).toEqual({ f1: 'v1', f2: 'v2' });
      expect(await mock.hGetAll('nonexistent')).toEqual({});
    });

    it('should hDel fields and return the count', async () => {
      expect(await mock.hDel('myhash', 'f1')).toBe(1);
      expect(await mock.hGet('myhash', 'f1')).toBeNull();
      expect(await mock.hDel('myhash', ['f2', 'f3'])).toBe(1);
      expect(await mock.hGet('myhash', 'f2')).toBeNull();
      expect(await mock.hDel('nonexistent', 'f1')).toBe(0);
    });

    it('should hExists for fields', async () => {
      expect(await mock.hExists('myhash', 'f1')).toBe(true);
      expect(await mock.hExists('myhash', 'nonexistent')).toBe(false);
      expect(await mock.hExists('nonexistent', 'f1')).toBe(false);
    });

    it('should hIncrBy correctly', async () => {
      await mock.hSet('myhash', 'counter', '10');
      expect(await mock.hIncrBy('myhash', 'counter', 5)).toBe(15);
      expect(await mock.hGet('myhash', 'counter')).toBe('15');
    });

    it('should hIncrBy on a non-existent field, starting from 0', async () => {
      expect(await mock.hIncrBy('myhash', 'newcounter', 5)).toBe(5);
      expect(await mock.hGet('myhash', 'newcounter')).toBe('5');
    });

    it('should throw error when hIncrBy is used on a non-integer field', async () => {
      await expect(mock.hIncrBy('myhash', 'f1', 1)).rejects.toThrow(
        'ERR hash value is not an integer'
      );
    });
  });

  describe('List Commands', () => {
    it('should lPush and rPush elements and return new length', async () => {
      expect(await mock.lPush('mylist', 'a')).toBe(1);
      expect(await mock.lPush('mylist', ['b', 'c'])).toBe(3); // c, b, a
      expect(await mock.rPush('mylist', 'd')).toBe(4); // c, b, a, d
      expect(await mock.lLen('mylist')).toBe(4);
    });

    it('should lPop and rPop elements', async () => {
      await mock.rPush('mylist', ['a', 'b', 'c']);
      expect(await mock.lPop('mylist')).toBe('a');
      expect(await mock.rPop('mylist')).toBe('c');
      expect(await mock.lPop('mylist')).toBe('b');
      expect(await mock.lPop('mylist')).toBeNull();
    });

    it('should lRange elements correctly', async () => {
      await mock.rPush('mylist', ['a', 'b', 'c', 'd', 'e']);
      expect(await mock.lRange('mylist', 0, 2)).toEqual(['a', 'b', 'c']);
      expect(await mock.lRange('mylist', 2, -1)).toEqual(['c', 'd', 'e']);
      expect(await mock.lRange('mylist', 0, -1)).toEqual([
        'a',
        'b',
        'c',
        'd',
        'e',
      ]);
      expect(await mock.lRange('nonexistent', 0, -1)).toEqual([]);
    });

    it('should lTrim the list', async () => {
      await mock.rPush('mylist', ['a', 'b', 'c', 'd', 'e']);
      expect(await mock.lTrim('mylist', 1, 3)).toBe('OK');
      expect(await mock.lRange('mylist', 0, -1)).toEqual(['b', 'c', 'd']);
    });
  });

  describe('Set Commands', () => {
    it('should sAdd members and return the count of new members', async () => {
      expect(await mock.sAdd('myset', 'a')).toBe(1);
      expect(await mock.sAdd('myset', ['b', 'c'])).toBe(2);
      expect(await mock.sAdd('myset', ['a', 'd'])).toBe(1); // 'a' already exists
    });

    it('should sMembers return all members of a set', async () => {
      await mock.sAdd('myset', ['a', 'b', 'c']);
      const members = await mock.sMembers('myset');
      expect(members).toHaveLength(3);
      expect(members).toContain('a');
      expect(members).toContain('b');
      expect(members).toContain('c');
    });

    it('should sIsMember check for member existence', async () => {
      await mock.sAdd('myset', 'a');
      expect(await mock.sIsMember('myset', 'a')).toBe(true);
      expect(await mock.sIsMember('myset', 'b')).toBe(false);
    });

    it('should sRem remove members and return count', async () => {
      await mock.sAdd('myset', ['a', 'b', 'c']);
      expect(await mock.sRem('myset', 'a')).toBe(1);
      expect(await mock.sRem('myset', ['b', 'd'])).toBe(1); // 'd' doesn't exist
      expect(await mock.sCard('myset')).toBe(1);
    });

    it('should sCard return the set cardinality', async () => {
      await mock.sAdd('myset', ['a', 'b', 'c']);
      expect(await mock.sCard('myset')).toBe(3);
      expect(await mock.sCard('nonexistent')).toBe(0);
    });
  });

  describe('Sorted Set Commands', () => {
    it('should zAdd members and return the count of new members', async () => {
      expect(await mock.zAdd('myzset', 1, 'one')).toBe(1);
      expect(await mock.zAdd('myzset', 2, 'two')).toBe(1);
      expect(await mock.zAdd('myzset', 1, 'uno')).toBe(1);
      expect(await mock.zAdd('myzset', 3, 'one')).toBe(0); // 'one' is updated, not added
    });

    it('should zAdd with an array of members', async () => {
      const members = [
        { score: 10, value: 'a' },
        { score: 20, value: 'b' },
      ];
      expect(await mock.zAdd('myzset', members)).toBe(2);
      expect(await mock.zCard('myzset')).toBe(2);
    });

    it('should zRange return members in score order', async () => {
      await mock.zAdd('myzset', 1, 'a');
      await mock.zAdd('myzset', 3, 'c');
      await mock.zAdd('myzset', 2, 'b');
      expect(await mock.zRange('myzset', 0, -1)).toEqual(['a', 'b', 'c']);
    });

    it('should zRangeWithScores return members and scores', async () => {
      await mock.zAdd('myzset', 1, 'a');
      await mock.zAdd('myzset', 3, 'c');
      await mock.zAdd('myzset', 2, 'b');
      expect(await mock.zRangeWithScores('myzset', 0, -1)).toEqual([
        { score: 1, value: 'a' },
        { score: 2, value: 'b' },
        { score: 3, value: 'c' },
      ]);
    });

    it('should zRem remove members and return count', async () => {
      await mock.zAdd('myzset', 1, 'a');
      await mock.zAdd('myzset', 2, 'b');
      expect(await mock.zRem('myzset', 'a')).toBe(1);
      expect(await mock.zRem('myzset', ['b', 'c'])).toBe(1);
      expect(await mock.zCard('myzset')).toBe(0);
    });

    it('should zScore return the score of a member', async () => {
      await mock.zAdd('myzset', 42, 'the-answer');
      expect(await mock.zScore('myzset', 'the-answer')).toBe(42);
      expect(await mock.zScore('myzset', 'nonexistent')).toBeNull();
    });
  });

  describe('Transaction (MULTI/EXEC)', () => {
    it('should queue commands and execute them with multi().exec()', async () => {
      const tx = mock.multi();
      tx.set('tx_key', 'tx_val');
      tx.incr('tx_counter');
      tx.get('tx_key');

      const results = await tx.exec();

      expect(results).toEqual(['OK', 1, 'tx_val']);
      expect(await mock.get('tx_key')).toBe('tx_val');
      expect(await mock.get('tx_counter')).toBe('1');
    });

    it('should discard a transaction', async () => {
      const tx = mock.multi();
      tx.set('tx_key', 'value');
      await tx.discard();
      const results = await tx.exec(); // Should be empty

      expect(results).toEqual([]);
      expect(await mock.get('tx_key')).toBeNull();
    });

    it('should queue key management commands (del, exists, expire, ttl)', async () => {
      await mock.set('tx_del_key', 'delete me');
      await mock.set('tx_expire_key', 'expire me');

      const tx = mock.multi();
      tx.del('tx_del_key');
      tx.exists(['tx_del_key', 'tx_expire_key']);
      tx.expire('tx_expire_key', 10);
      tx.ttl('tx_expire_key');

      const results = await tx.exec();

      // The mock executes commands sequentially, so `exists` runs after `del`.
      expect(results).toEqual([1, 1, true, 10]);
      expect(await mock.get('tx_del_key')).toBeNull();
      expect(await mock.ttl('tx_expire_key')).toBe(10);
    });

    it('should queue numeric commands (decr, incrBy, decrBy)', async () => {
      await mock.set('tx_numeric_counter', '10');

      const tx = mock.multi();
      tx.decr('tx_numeric_counter'); // 10 -> 9
      tx.incrBy('tx_numeric_counter', 5); // 9 -> 14
      tx.decrBy('tx_numeric_counter', 4); // 14 -> 10

      const results = await tx.exec();

      expect(results).toEqual([9, 14, 10]);
      expect(await mock.get('tx_numeric_counter')).toBe('10');
    });

    it('should queue hash commands (hSet, hGet, hGetAll, hDel, hIncrBy, hExists)', async () => {
      await mock.hSet('tx_hash', { f1: 'v1', counter: '5' });

      const tx = mock.multi();
      tx.hGet('tx_hash', 'f1');
      tx.hSet('tx_hash', 'f2', 'v2');
      tx.hIncrBy('tx_hash', 'counter', 5);
      tx.hGetAll('tx_hash');
      tx.hDel('tx_hash', 'f1');
      tx.hExists('tx_hash', 'f2');

      const results = await tx.exec();

      expect(results).toEqual([
        'v1',
        1,
        10,
        { f1: 'v1', f2: 'v2', counter: '10' },
        1,
        true,
      ]);
      expect(await mock.hGetAll('tx_hash')).toEqual({ f2: 'v2', counter: '10' });
    });

    it('should queue list commands (lPush, rPush, lPop, rPop, lLen, lRange, lTrim)', async () => {
      await mock.rPush('tx_list', ['a', 'b']); // Initial state: ['a', 'b']

      const tx = mock.multi();
      tx.lPush('tx_list', 'c'); // -> ['c', 'a', 'b'], returns 3
      tx.rPush('tx_list', 'd'); // -> ['c', 'a', 'b', 'd'], returns 4
      tx.lPop('tx_list'); // -> pops 'c', returns 'c'
      tx.rPop('tx_list'); // -> pops 'd', returns 'd'
      tx.lTrim('tx_list', 1, 1); // list is ['a', 'b'], trims to ['b'], returns 'OK'
      tx.lLen('tx_list'); // -> list is ['a', 'b'], returns 2
      tx.lRange('tx_list', 0, -1); // -> returns ['a', 'b']

      const results = await tx.exec();

      expect(results).toEqual([3, 4, 'c', 'd', 'OK', 1, ['b']]);

      // Verify final state
      expect(await mock.lRange('tx_list', 0, -1)).toEqual(['b']);
    });

    it('should queue set commands (sAdd, sRem, sMembers, sIsMember, sCard)', async () => {
      await mock.sAdd('tx_set', ['a', 'b']); // Initial state: {'a', 'b'}

      const tx = mock.multi();
      tx.sAdd('tx_set', 'c'); // -> {'a', 'b', 'c'}, returns 1
      tx.sAdd('tx_set', ['a', 'd']); // -> {'a', 'b', 'c', 'd'}, returns 1
      tx.sIsMember('tx_set', 'c'); // -> returns true
      tx.sRem('tx_set', 'a'); // -> removes 'a', returns 1
      tx.sCard('tx_set'); // -> set is {'b', 'c', 'd'}, returns 3
      tx.sMembers('tx_set'); // -> returns members

      const results = await tx.exec();

      // sMembers result is not ordered, so we need to sort it for comparison
      const membersResult = (results[5] as string[]).sort();

      expect(results.slice(0, 5)).toEqual([1, 1, true, 1, 3]);
      expect(membersResult).toEqual(['b', 'c', 'd']);

      // Verify final state
      const finalMembers = (await mock.sMembers('tx_set')).sort();
      expect(finalMembers).toEqual(['b', 'c', 'd']);
    });

    it('should queue sorted set commands (zAdd, zRem, zRange, zScore, zCard, zRangeWithScores)', async () => {
      await mock.zAdd('tx_zset', 10, 'a'); // Initial state
      await mock.zAdd('tx_zset', 20, 'b');

      const tx = mock.multi();
      tx.zAdd('tx_zset', 30, 'c'); // -> returns 1
      tx.zAdd('tx_zset', 5, 'a'); // -> updates 'a', returns 0
      tx.zScore('tx_zset', 'b'); // -> returns 20
      tx.zRange('tx_zset', 0, -1); // -> returns ['a', 'b', 'c'] (ordered by new scores)
      tx.zRangeWithScores('tx_zset', 0, -1);
      tx.zRem('tx_zset', 'b'); // -> returns 1
      tx.zCard('tx_zset'); // -> returns 2

      const results = await tx.exec();

      expect(results).toEqual([
        1,
        0,
        20,
        ['a', 'b', 'c'],
        [
          { score: 5, value: 'a' },
          { score: 20, value: 'b' },
          { score: 30, value: 'c' },
        ],
        1,
        2,
      ]);

      // Verify final state
      expect(await mock.zRangeWithScores('tx_zset', 0, -1)).toEqual([
        { score: 5, value: 'a' },
        { score: 30, value: 'c' },
      ]);
    });

    it('should queue server commands (ping, info)', async () => {
      const tx = mock.multi();
      tx.ping();
      tx.ping('hello');
      tx.info('server');

      const results = await tx.exec();

      expect(results[0]).toBe('PONG');
      expect(results[1]).toBe('hello');
      expect(results[2]).toContain('# Mock Server');
    });
  });

  describe('Scripting Commands', () => {
    it('should have an eval method that throws not implemented', async () => {
      await expect(mock.eval('return 1', [], [])).rejects.toThrow(
        'EVAL command not implemented in mock.'
      );
    });

    it('should queue eval in a transaction', async () => {
      const tx = mock.multi();
      tx.eval('return 1', [], []);
      // The exec will fail because the underlying mock.eval throws.
      // This test just confirms the method exists on the transaction object.
      await expect(tx.exec()).rejects.toThrow(
        'EVAL command not implemented in mock.'
      );
    });
  });

  describe('Pub/Sub Commands', () => {
    it('should subscribe to a channel and receive messages', async () => {
      const received: any[] = [];
      const listener = (message: string, channel: string) => {
        received.push({ message, channel });
      };

      await mock.subscribe('channel1', listener);
      await mock.publish('channel1', 'hello');
      await mock.publish('channel2', 'world'); // Should not be received
      await mock.publish('channel1', 'again');

      expect(received).toEqual([
        { message: 'hello', channel: 'channel1' },
        { message: 'again', channel: 'channel1' },
      ]);
    });

    it('should unsubscribe from a channel', async () => {
      const received: any[] = [];
      const listener = (message: string, channel: string) => {
        received.push({ message, channel });
      };

      await mock.subscribe('channel1', listener);
      await mock.publish('channel1', 'first');
      await mock.unsubscribe('channel1');
      await mock.publish('channel1', 'second'); // Should not be received

      expect(received).toEqual([{ message: 'first', channel: 'channel1' }]);
    });
  });
});