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

    it('should set a custom transaction ID header name', () => {
      const customHeader = 'X-Trace-ID';
      mockContextManager.configure({ transactionIdHeader: customHeader });
      expect(mockContextManager.getTransactionIdHeaderName()).toBe(customHeader);
    });
  });

  describe('run', () => {
    it('should execute a synchronous callback within a simulated context', async () => {
      mockContextManager.set('key', 'outside');

      await mockContextManager.run(() => {
        mockContextManager.set('key', 'inside');
        expect(mockContextManager.get('key')).toBe('inside');
      });
      // After run, the store is restored
      expect(mockContextManager.get('key')).toBe('outside');
    });

    it('should execute an asynchronous callback within a simulated context', async () => {
      mockContextManager.set('key', 'outside');

      await mockContextManager.run(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        mockContextManager.set('key', 'inside_async');
        expect(mockContextManager.get('key')).toBe('inside_async');
      });

      // After run, the store is restored
      expect(mockContextManager.get('key')).toBe('outside');
    });

    it('should restore context if synchronous callback throws an error', async () => {
      mockContextManager.set('key', 'original');
      const error = new Error('test_error');

      await expect(
        mockContextManager.run(() => {
          mockContextManager.set('key', 'modified');
          throw error;
        }),
      ).rejects.toThrow(error);

      expect(mockContextManager.get('key')).toBe('original');
    });

    it('should restore context if asynchronous callback throws an error', async () => {
      mockContextManager.set('key', 'original');
      const error = new Error('async_error');

      await expect(
        mockContextManager.run(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          mockContextManager.set('key', 'modified');
          throw error;
        }),
      ).rejects.toThrow(error);

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
    it('should get correlation ID using the normalized key', () => {
      const correlationId = 'abc-123';
      // In a real scenario, the middleware sets both the header key and the normalized key.
      mockContextManager.set('correlationId', correlationId);
      expect(mockContextManager.getCorrelationId()).toBe(correlationId);
    });
  });

  describe('Transaction ID methods', () => {
    it('should get and set transaction ID using the normalized key', () => {
      const transactionId = 'xyz-987';
      mockContextManager.set('transactionId', transactionId);
      expect(mockContextManager.getTransactionId()).toBe(transactionId);
      mockContextManager.clear();
      expect(mockContextManager.getTransactionId()).toBeUndefined();
    });
  });

  describe('getTraceContextHeaders', () => {
    it('should return an empty object by default', () => {
      expect(mockContextManager.getTraceContextHeaders()).toEqual({});
    });

    it('should return headers for correlation and transaction IDs when they exist', () => {
      mockContextManager.set('correlationId', 'test-corr-id');
      mockContextManager.set('transactionId', 'test-trans-id');
      expect(mockContextManager.getTraceContextHeaders()).toEqual({
        'x-correlation-id': 'test-corr-id',
        'x-trace-id': 'test-trans-id',
      });
    });
  });
});