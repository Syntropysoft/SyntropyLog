/**
 * Unit tests for BeaconRedisMock pure functions (createMockFn, createTransactionObject).
 * The mock implementation lives in src/testing/BeaconRedisMock.ts without vitest so the testing bundle stays small.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createMockFn,
  createTransactionObject,
} from '../../src/testing/BeaconRedisMock';

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
