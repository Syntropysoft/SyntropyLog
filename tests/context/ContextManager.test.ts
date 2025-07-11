/**
 * FILE: tests/context/ContextManager.test.ts
 * DESCRIPTION: Unit tests for the ContextManager class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../../src/context/ContextManager';

// Helper to introduce a delay for async tests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('ContextManager', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager();
  });

  describe('configure', () => {
    it('should use the default correlation ID header name', () => {
      expect(contextManager.getCorrelationIdHeaderName()).toBe('x-correlation-id');
    });

    it('should set a custom correlation ID header name', () => {
      const customHeader = 'X-Request-ID';
      contextManager.configure(customHeader);
      expect(contextManager.getCorrelationIdHeaderName()).toBe(customHeader);
    });
  });

  describe('run', () => {
    it('should execute a callback within a new context', () => {
      contextManager.run(() => {
        contextManager.set('key', 'value');
        expect(contextManager.get('key')).toBe('value');
      });
      // Outside the context, the value should not exist.
      expect(contextManager.get('key')).toBeUndefined();
    });

    it('should handle nested contexts correctly', () => {
      contextManager.run(() => {
        contextManager.set('outerKey', 'outerValue');
        expect(contextManager.get('outerKey')).toBe('outerValue');

        contextManager.run(() => {
          contextManager.set('innerKey', 'innerValue');
          // Inner context should inherit from outer context
          expect(contextManager.get('outerKey')).toBe('outerValue');
          expect(contextManager.get('innerKey')).toBe('innerValue');
        });

        // Back in the outer context, innerKey should not exist
        expect(contextManager.get('outerKey')).toBe('outerValue');
        expect(contextManager.get('innerKey')).toBeUndefined();
      });

      // Outside all contexts
      expect(contextManager.get('outerKey')).toBeUndefined();
      expect(contextManager.get('innerKey')).toBeUndefined();
    });

    it('should isolate sibling contexts', () => {
      let firstContextValue: any;
      let secondContextValue: any;

      contextManager.run(() => {
        contextManager.set('key', 'value1');
        firstContextValue = contextManager.get('key');
      });

      contextManager.run(() => {
        contextManager.set('key', 'value2');
        secondContextValue = contextManager.get('key');
      });

      expect(firstContextValue).toBe('value1');
      expect(secondContextValue).toBe('value2');
      expect(contextManager.get('key')).toBeUndefined();
    });

    it('should handle asynchronous callbacks', async () => {
      await contextManager.run(async () => {
        contextManager.set('asyncKey', 'asyncValue');
        await delay(10);
        expect(contextManager.get('asyncKey')).toBe('asyncValue');
      });
      expect(contextManager.get('asyncKey')).toBeUndefined();
    });
  });

  describe('get/set', () => {
    it('should return undefined when getting a key outside of a context', () => {
      expect(contextManager.get('anyKey')).toBeUndefined();
    });

    it('should not throw when setting a key outside of a context', () => {
      expect(() => contextManager.set('anyKey', 'anyValue')).not.toThrow();
      expect(contextManager.get('anyKey')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return an empty object outside of a context', () => {
      expect(contextManager.getAll()).toEqual({});
    });

    it('should return all key-value pairs within a context', () => {
      contextManager.run(() => {
        contextManager.set('key1', 'value1');
        contextManager.set('key2', 123);
        expect(contextManager.getAll()).toEqual({ key1: 'value1', key2: 123 });
      });
    });
  });

  describe('Correlation ID methods', () => {
    it('should get correlation ID using the configured header name', () => {
      const correlationId = 'abc-123';
      contextManager.run(() => {
        contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
        expect(contextManager.getCorrelationId()).toBe(correlationId);
      });
    });
  });
});