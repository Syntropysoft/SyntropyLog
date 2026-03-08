/**
 * FILE: src/testing/BeaconRedisMock.ts
 * DESCRIPTION: A mock implementation of IBeaconRedis for use in unit tests.
 * This mock is framework agnostic and works with both Vitest and Jest.
 */

import { describe, it, expect, vi } from 'vitest';
import { IBeaconRedis, IBeaconRedisTransaction } from '../redis';

describe('BeaconRedisMock Pure Functions', () => {
  describe('createMockFn', () => {
    it('should throw if spyFn is not provided', () => {
      expect(() => createMockFn(null)).toThrow('SPY FUNCTION NOT INJECTED');
    });

    it('should call spyFn if provided', () => {
      const spyFn = vi.fn().mockReturnValue('mocked');
      const result = createMockFn(spyFn);
      expect(spyFn).toHaveBeenCalled();
      expect(result).toBe('mocked');
    });
  });

  describe('createTransactionObject', () => {
    it('should return a transaction object with exec and executeScript', () => {
      const spyFn = vi.fn().mockReturnValue({ mockResolvedValue: vi.fn() });
      const tx = createTransactionObject(spyFn);
      expect(tx).toHaveProperty('exec');
      expect(tx).toHaveProperty('executeScript');
    });

    it('should have executeScript that throws', () => {
      const spyFn = vi.fn().mockReturnValue({ mockResolvedValue: vi.fn() });
      const tx = createTransactionObject(spyFn);
      expect(() => tx.executeScript('script', [], [])).toThrow(
        'SCRIPT execution not supported'
      );
    });
  });
});

// Function that throws error for Lua script execution in transaction - outside of any mock context
const throwScriptError = () => {
  throw new Error(
    'SCRIPT execution not supported in transaction (mocked BeaconRedisMock)'
  );
};

// Pure function: Throw error if spy function is missing
const throwSpyNotInjectedError = (): never => {
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
};

// Pure function: Create a mock function using the provided spy factory
export const createMockFn = (
  spyFn: ((implementation?: any) => any) | null,
  implementation?: any
) => {
  if (!spyFn) {
    throwSpyNotInjectedError();
  }
  return spyFn!(implementation);
};

// Pure function: Create transaction object
export const createTransactionObject = (
  spyFn: ((implementation?: any) => any) | null
): IBeaconRedisTransaction => {
  return {
    exec: createMockFn(spyFn).mockResolvedValue([]),
    // Script execution is not implemented in transactions, so it should throw
    executeScript: throwScriptError,
  } as any;
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
  public readonly executeScript: any;
  public readonly scan: any;
  public readonly keys: any;

  constructor(spyFn?: (implementation?: any) => any) {
    this.spyFn = spyFn || null;

    // Helper to keep constructor clean
    const mock = (impl?: any) => createMockFn(this.spyFn, impl);

    // Initialize mocks
    this.getInstanceName = mock();
    this.connect = mock().mockResolvedValue(undefined);
    this.disconnect = mock().mockResolvedValue(undefined);
    this.quit = mock().mockResolvedValue(undefined);
    this.updateConfig = mock();
    this.multi = mock().mockReturnValue(createTransactionObject(this.spyFn));
    this.get = mock();
    this.set = mock();
    this.del = mock();
    this.exists = mock();
    this.expire = mock();
    this.ttl = mock();
    this.incr = mock();
    this.decr = mock();
    this.incrBy = mock();
    this.decrBy = mock();
    this.hGet = mock();
    this.hSet = mock();
    this.hGetAll = mock();
    this.hDel = mock();
    this.hExists = mock();
    this.hIncrBy = mock();
    this.lPush = mock();
    this.rPush = mock();
    this.lPop = mock();
    this.rPop = mock();
    this.lRange = mock();
    this.lLen = mock();
    this.lTrim = mock();
    this.sAdd = mock();
    this.sMembers = mock();
    this.sIsMember = mock();
    this.sRem = mock();
    this.sCard = mock();
    this.zAdd = mock();
    this.zRange = mock();
    this.zRangeWithScores = mock();
    this.zRem = mock();
    this.zCard = mock();
    this.zScore = mock();
    this.subscribe = mock();
    this.unsubscribe = mock();
    this.publish = mock();
    this.ping = mock();
    this.info = mock();
    this.executeScript = mock();
    this.scan = mock().mockResolvedValue({ cursor: 0, keys: [] });
    this.keys = mock().mockResolvedValue([]);
  }
}
