/**
 * FILE: tests/context/MockContextManager.test.ts
 * DESCRIPTION: Unit tests for the MockContextManager class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockContextManager } from '../../src/context/MockContextManager';

// Helper to introduce a delay for async tests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('MockContextManager', () => {
  let mockContextManager: MockContextManager;

  beforeEach(() => {
    // The mock manager is stateful, so we instantiate a new one for each test
    // to ensure test isolation.
    mockContextManager = new MockContextManager();
  });

  describe('configure', () => {
    it('should use the default correlation ID header name', () => {
      expect(mockContextManager.getCorrelationIdHeaderName()).toBe('x-correlation-id');
    });

    it('should set a custom correlation ID header name', () => {
      const customHeader = 'X-Request-ID';
      mockContextManager.configure({ correlationIdHeader: customHeader });
      expect(mockContextManager.getCorrelationIdHeaderName()).toBe(customHeader);
    });

    it('should set a custom transaction ID key', () => {
      const customKey = 'my-transaction-id';
      mockContextManager.configure({ transactionIdKey: customKey });
      const transactionId = 'txn-456';
      mockContextManager.setTransactionId(transactionId);
      expect(mockContextManager.getTransactionId()).toBe(transactionId);
      expect(mockContextManager.get(customKey)).toBe(transactionId);
    });
  });

  describe('run', () => {
    it('should execute a synchronous callback within a simulated context', () => {
      mockContextManager.set('key', 'outside');
      mockContextManager.run(() => {
        expect(mockContextManager.get('key')).toBe('outside'); // Inherits
        mockContextManager.set('key', 'inside');
        expect(mockContextManager.get('key')).toBe('inside');
      });
      // After run, the store is restored
      expect(mockContextManager.get('key')).toBe('outside');
    });

    it('should handle nested contexts correctly', () => {
      mockContextManager.run(() => {
        mockContextManager.set('outerKey', 'outerValue');
        expect(mockContextManager.get('outerKey')).toBe('outerValue');

        mockContextManager.run(() => {
          mockContextManager.set('innerKey', 'innerValue');
          // Inner context should inherit from outer context
          expect(mockContextManager.get('outerKey')).toBe('outerValue');
          expect(mockContextManager.get('innerKey')).toBe('innerValue');
        });

        // Back in the outer context, innerKey should not exist
        expect(mockContextManager.get('outerKey')).toBe('outerValue');
        expect(mockContextManager.get('innerKey')).toBeUndefined();
      });

      // Outside all contexts, the store is empty
      expect(mockContextManager.getAll()).toEqual({});
    });

    it('should handle asynchronous callbacks', async () => {
      mockContextManager.set('key', 'outside');
      await mockContextManager.run(async () => {
        expect(mockContextManager.get('key')).toBe('outside');
        mockContextManager.set('key', 'inside_async');
        await delay(10);
        expect(mockContextManager.get('key')).toBe('inside_async');
      });
      expect(mockContextManager.get('key')).toBe('outside');
    });

    it('should restore context if synchronous callback throws an error', () => {
      mockContextManager.set('key', 'original');
      const error = new Error('test error');

      expect(() => {
        mockContextManager.run(() => {
          mockContextManager.set('key', 'modified');
          throw error;
        });
      }).toThrow(error);

      expect(mockContextManager.get('key')).toBe('original');
    });

    it('should restore context if asynchronous callback rejects', async () => {
      mockContextManager.set('key', 'original');
      const error = new Error('async test error');

      const promise = mockContextManager.run(async () => {
        mockContextManager.set('key', 'modified');
        await delay(10);
        throw error;
      });

      await expect(promise).rejects.toThrow(error);
      expect(mockContextManager.get('key')).toBe('original');
    });
  });

  describe('get/set/getAll', () => {
    it('should set and get values from the store', () => {
      mockContextManager.set('key1', 'value1');
      mockContextManager.set('key2', 123);
      expect(mockContextManager.get('key1')).toBe('value1');
      expect(mockContextManager.get('key2')).toBe(123);
    });

    it('getAll should return a copy of the store, not a reference', () => {
      mockContextManager.set('key', 'value');
      const all = mockContextManager.getAll();
      all['key'] = 'modified';
      expect(mockContextManager.get('key')).toBe('value');
    });
  });

  describe('clear', () => {
    it('should clear all values from the store', () => {
      mockContextManager.set('key1', 'value1');
      mockContextManager.clear();
      expect(mockContextManager.getAll()).toEqual({});
      expect(mockContextManager.get('key1')).toBeUndefined();
    });
  });

  describe('Correlation ID methods', () => {
    it('should get correlation ID using the configured header name', () => {
      const correlationId = 'abc-123';
      mockContextManager.set(mockContextManager.getCorrelationIdHeaderName(), correlationId);
      expect(mockContextManager.getCorrelationId()).toBe(correlationId);
    });
  });

  describe('Transaction ID methods', () => {
    it('should get and set transaction ID', () => {
      const transactionId = 'xyz-987';
      mockContextManager.setTransactionId(transactionId);
      expect(mockContextManager.getTransactionId()).toBe(transactionId);
      mockContextManager.clear();
      expect(mockContextManager.getTransactionId()).toBeUndefined();
    });
  });

  describe('getTraceContextHeaders', () => {
    it('should return undefined as per its mock implementation', () => {
      expect(mockContextManager.getTraceContextHeaders()).toBeUndefined();
    });
  });
});