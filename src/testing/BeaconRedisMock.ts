/**
 * FILE: src/testing/BeaconRedisMock.ts
 * DESCRIPTION: A mock implementation of IBeaconRedis for use in unit tests.
 * This mock is framework agnostic and works with both Vitest and Jest.
 */

/**
 * Creates a simple agnostic mock function without spy capabilities
 */
function createAgnosticMockFn<T = any>(implementation?: (...args: any[]) => T) {
  const mockFn = (...args: any[]) => {
    if (implementation) {
      return implementation(...args);
    }
    return undefined;
  };

  // Basic mock properties
  (mockFn as any).mockClear = () => {};
  (mockFn as any).mockReset = () => {};
  (mockFn as any).mockImplementation = (impl: (...args: any[]) => T) => {
    return createAgnosticMockFn(impl);
  };
  (mockFn as any).mockReturnValue = (value: T) => {
    return createAgnosticMockFn(() => value);
  };
  (mockFn as any).mockResolvedValue = (value: T) => {
    return createAgnosticMockFn(() => Promise.resolve(value));
  };
  (mockFn as any).mockRejectedValue = (value: any) => {
    return createAgnosticMockFn(() => Promise.reject(value));
  };

  return mockFn as any;
}

import { IBeaconRedis, IBeaconRedisTransaction } from '../redis/IBeaconRedis';
import { RedisInstanceReconfigurableConfig } from '../config';
import { RedisZMember } from '../redis/redis.types';

// Function that throws error for eval in transaction - outside of any mock context
const throwEvalError = () => {
  throw new Error('EVAL not supported in transaction (mocked BeaconRedisMock)');
};

export class BeaconRedisMock implements IBeaconRedis {
  private spyFn: ((implementation?: any) => any) | null = null;

  // Core methods - will be initialized in constructor
  public readonly getInstanceName: any;
  public readonly connect: any;
  public readonly disconnect: any;
  public readonly quit: any;
  public readonly updateConfig: any;
  public readonly multi: any;
  public readonly get: any;
  public readonly set: any;
  public readonly del: any;
  public readonly exists: any;
  public readonly expire: any;
  public readonly ttl: any;
  public readonly incr: any;
  public readonly decr: any;
  public readonly incrBy: any;
  public readonly decrBy: any;
  public readonly hGet: any;
  public readonly hSet: any;
  public readonly hGetAll: any;
  public readonly hDel: any;
  public readonly hExists: any;
  public readonly hIncrBy: any;
  public readonly lPush: any;
  public readonly rPush: any;
  public readonly lPop: any;
  public readonly rPop: any;
  public readonly lRange: any;
  public readonly lLen: any;
  public readonly lTrim: any;
  public readonly sAdd: any;
  public readonly sMembers: any;
  public readonly sIsMember: any;
  public readonly sRem: any;
  public readonly sCard: any;
  public readonly zAdd: any;
  public readonly zRange: any;
  public readonly zRangeWithScores: any;
  public readonly zRem: any;
  public readonly zCard: any;
  public readonly zScore: any;
  public readonly subscribe: any;
  public readonly unsubscribe: any;
  public readonly publish: any;
  public readonly ping: any;
  public readonly info: any;
  public readonly eval: any;

  constructor(spyFn?: (implementation?: any) => any) {
    this.spyFn = spyFn || null;

    // Initialize mocks after spyFn is set
    this.getInstanceName = this.createMock();
    this.connect = this.createMock().mockResolvedValue(undefined);
    this.disconnect = this.createMock().mockResolvedValue(undefined);
    this.quit = this.createMock().mockResolvedValue(undefined);
    this.updateConfig = this.createMock();
    this.multi = this.createMock().mockReturnValue(
      this.createTransactionObject()
    );
    this.get = this.createMock();
    this.set = this.createMock();
    this.del = this.createMock();
    this.exists = this.createMock();
    this.expire = this.createMock();
    this.ttl = this.createMock();
    this.incr = this.createMock();
    this.decr = this.createMock();
    this.incrBy = this.createMock();
    this.decrBy = this.createMock();
    this.hGet = this.createMock();
    this.hSet = this.createMock();
    this.hGetAll = this.createMock();
    this.hDel = this.createMock();
    this.hExists = this.createMock();
    this.hIncrBy = this.createMock();
    this.lPush = this.createMock();
    this.rPush = this.createMock();
    this.lPop = this.createMock();
    this.rPop = this.createMock();
    this.lRange = this.createMock();
    this.lLen = this.createMock();
    this.lTrim = this.createMock();
    this.sAdd = this.createMock();
    this.sMembers = this.createMock();
    this.sIsMember = this.createMock();
    this.sRem = this.createMock();
    this.sCard = this.createMock();
    this.zAdd = this.createMock();
    this.zRange = this.createMock();
    this.zRangeWithScores = this.createMock();
    this.zRem = this.createMock();
    this.zCard = this.createMock();
    this.zScore = this.createMock();
    this.subscribe = this.createMock();
    this.unsubscribe = this.createMock();
    this.publish = this.createMock();
    this.ping = this.createMock();
    this.info = this.createMock();
    this.eval = this.createMock();
  }

  // Create transaction object outside of mock to avoid hoisting issues
  private createTransactionObject(): IBeaconRedisTransaction {
    return {
      exec: this.createMock().mockResolvedValue([]),
      // eval is not implemented in transactions, so it should throw
      eval: throwEvalError,
    } as any;
  }

  private createMock(implementation?: any) {
    if (!this.spyFn) {
      throw new Error(`
🚨 SPY FUNCTION NOT INJECTED! 😡

To use spy functions like toHaveBeenCalled(), toHaveBeenCalledWith(), etc.
YOU MUST inject your spy function in the constructor:

// For Vitest:
const mockRedis = new BeaconRedisMock(vi.fn);

// For Jest:
const mockRedis = new BeaconRedisMock(jest.fn);

// For Jasmine:
const mockRedis = new BeaconRedisMock(jasmine.createSpy);

// Without spy (basic functionality only):
const mockRedis = new BeaconRedisMock();

DON'T FORGET AGAIN! 😤
      `);
    }
    return this.spyFn(implementation);
  }
}
