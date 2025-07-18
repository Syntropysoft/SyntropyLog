/**
 * FILE: src/testing/BeaconRedisMock.ts
 * DESCRIPTION: A mock implementation of IBeaconRedis for use in unit tests.
 * This mock uses `vi.fn()` for all methods, allowing tests to spy on calls,
 * mock return values, and simulate errors.
 */

import { vi } from 'vitest';
import { IBeaconRedis, IBeaconRedisTransaction } from '../redis/IBeaconRedis';
import { RedisInstanceReconfigurableConfig } from '../config';
import { RedisZMember } from '../redis/redis.types';

// Function that throws error for eval in transaction - outside of any mock context
const throwEvalError = () => {
  throw new Error('EVAL not supported in transaction (mocked BeaconRedisMock)');
};

export class BeaconRedisMock implements IBeaconRedis {
  // Create transaction object outside of mock to avoid hoisting issues
  private createTransactionObject(): IBeaconRedisTransaction {
    return {
      exec: vi.fn().mockResolvedValue([]),
      // eval is not implemented in transactions, so it should throw
      eval: throwEvalError,
    } as any;
  }

  // Lifecycle and Management
  public readonly getInstanceName = vi.fn<[], string>();
  public readonly connect = vi
    .fn<[], Promise<void>>()
    .mockResolvedValue(undefined);
  public readonly quit = vi
    .fn<[], Promise<void>>()
    .mockResolvedValue(undefined);
  public readonly updateConfig = vi.fn<
    [Partial<RedisInstanceReconfigurableConfig>],
    void
  >();
  public readonly multi = vi
    .fn<[], IBeaconRedisTransaction>()
    .mockReturnValue(this.createTransactionObject());

  // String Commands
  public readonly get = vi.fn<[string], Promise<string | null>>();
  public readonly set = vi.fn<
    [string, string, number?],
    Promise<string | null>
  >();
  public readonly del = vi.fn<[string | string[]], Promise<number>>();

  // Generic Key Commands
  public readonly exists = vi.fn<[string | string[]], Promise<number>>();
  public readonly expire = vi.fn<[string, number], Promise<boolean>>();
  public readonly ttl = vi.fn<[string], Promise<number>>();

  // Numeric Commands
  public readonly incr = vi.fn<[string], Promise<number>>();
  public readonly decr = vi.fn<[string], Promise<number>>();
  public readonly incrBy = vi.fn<[string, number], Promise<number>>();
  public readonly decrBy = vi.fn<[string, number], Promise<number>>();

  // Hash Commands
  public readonly hGet = vi.fn<[string, string], Promise<string | null>>();
  public readonly hSet = vi.fn<
    [string, Record<string, any> | string, any?],
    Promise<number>
  >();
  public readonly hGetAll = vi.fn<[string], Promise<Record<string, string>>>();
  public readonly hDel = vi.fn<[string, string | string[]], Promise<number>>();
  public readonly hExists = vi.fn<[string, string], Promise<boolean>>();
  public readonly hIncrBy = vi.fn<[string, string, number], Promise<number>>();

  // List Commands
  public readonly lPush = vi.fn<[string, any | any[]], Promise<number>>();
  public readonly rPush = vi.fn<[string, any | any[]], Promise<number>>();
  public readonly lPop = vi.fn<[string], Promise<string | null>>();
  public readonly rPop = vi.fn<[string], Promise<string | null>>();
  public readonly lRange = vi.fn<[string, number, number], Promise<string[]>>();
  public readonly lLen = vi.fn<[string], Promise<number>>();
  public readonly lTrim = vi.fn<[string, number, number], Promise<string>>();

  // Set Commands
  public readonly sAdd = vi.fn<[string, any | any[]], Promise<number>>();
  public readonly sMembers = vi.fn<[string], Promise<string[]>>();
  public readonly sIsMember = vi.fn<[string, any], Promise<boolean>>();
  public readonly sRem = vi.fn<[string, any | any[]], Promise<number>>();
  public readonly sCard = vi.fn<[string], Promise<number>>();

  // Sorted Set Commands
  public readonly zAdd = vi.fn<
    [string, number | { score: number; value: any }[], any?],
    Promise<number>
  >();
  public readonly zRange = vi.fn<
    [string, string | number, string | number, any?],
    Promise<string[]>
  >();
  public readonly zRangeWithScores = vi.fn<
    [string, string | number, string | number, any?],
    Promise<RedisZMember[]>
  >();
  public readonly zRem = vi.fn<[string, any | any[]], Promise<number>>();
  public readonly zCard = vi.fn<[string], Promise<number>>();
  public readonly zScore = vi.fn<[string, any], Promise<number | null>>();

  // Pub/Sub Commands
  public readonly subscribe = vi.fn<
    [string, (message: string, channel: string) => void],
    Promise<void>
  >();
  public readonly unsubscribe = vi.fn<[string?], Promise<void>>();
  public readonly publish = vi.fn<[string, string], Promise<number>>();

  // Server/Connection Commands
  public readonly ping = vi.fn<[string?], Promise<string>>();
  public readonly info = vi.fn<[string?], Promise<string>>();

  // Scripting Commands
  public readonly eval = vi.fn<[string, string[], string[]], Promise<any>>();
}
