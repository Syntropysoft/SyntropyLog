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
      contextManager.configure({ correlationIdHeader: customHeader });
      expect(contextManager.getCorrelationIdHeaderName()).toBe(customHeader);
    });

    it('should set a custom transaction ID header name', () => {
      const customHeader = 'X-Trace-ID';
      contextManager.configure({ transactionIdHeader: customHeader });
      expect(contextManager.getTransactionIdHeaderName()).toBe(customHeader);
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
        contextManager.set('outerKey', 'outerValue');

        await contextManager.run(async () => {
          contextManager.set('innerKey', 'innerValue');
          // Inner context should inherit from outer context
          expect(contextManager.get('outerKey')).toBe('outerValue');
          expect(contextManager.get('innerKey')).toBe('innerValue');
        });
      });
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

    it('should return all data from the current context', async () => {
      await contextManager.run(async () => {
        contextManager.set('key1', 'value1');
        contextManager.set('key2', 123);
        const allData = contextManager.getAll();
        expect(allData).toEqual({
          key1: 'value1',
          key2: 123,
          'x-correlation-id': expect.any(String),
        });
      });
    });
  });

  describe('Correlation ID methods', () => {
    it('should get correlation ID using the header key', () => {
      const correlationId = 'abc-123';
      contextManager.run(() => {
        contextManager.set('x-correlation-id', correlationId);
        expect(contextManager.getCorrelationId()).toBe(correlationId);
      });
    });
  });

  describe('Transaction ID methods', () => {
    it('should get and set transaction ID using the normalized key', () => {
      const transactionId = 'xyz-987';
      contextManager.run(() => {
        // The new way: set the normalized 'transactionId' key directly.
        contextManager.set('transactionId', transactionId);
        expect(contextManager.getTransactionId()).toBe(transactionId);
      });
      // It should not exist outside the context.
      expect(contextManager.getTransactionId()).toBeUndefined();
    });
  });

  describe('Trace Context Headers', () => {
    it('should return an empty object for trace context headers by default', () => {
      expect(contextManager.getTraceContextHeaders()).toEqual({});
    });
  });

  describe('getFilteredContext with loggingMatrix', () => {
    it('should include correlationId when specified in loggingMatrix', async () => {
      const loggingMatrix = {
        default: ['correlationId'],
        error: ['*']
      };
      
      const contextManagerWithMatrix = new ContextManager(loggingMatrix);
      
      await contextManagerWithMatrix.run(async () => {
        // Establecer correlationId usando el header configurado
        contextManagerWithMatrix.set('x-correlation-id', 'test-correlation-123');
        contextManagerWithMatrix.set('userId', 'user-456');
        
        const filteredContext = contextManagerWithMatrix.getFilteredContext('info');
        
        expect(filteredContext).toHaveProperty('correlationId');
        expect(filteredContext.correlationId).toBe('test-correlation-123');
        expect(filteredContext).not.toHaveProperty('userId'); // No debe incluir userId en default
      });
    });

    it('should include correlationId when stored as internal key', async () => {
      const loggingMatrix = {
        default: ['correlationId'],
        error: ['*']
      };
      
      const contextManagerWithMatrix = new ContextManager(loggingMatrix);
      
      await contextManagerWithMatrix.run(async () => {
        // Establecer correlationId usando la clave interna
        contextManagerWithMatrix.set('correlationId', 'internal-correlation-789');
        contextManagerWithMatrix.set('userId', 'user-456');
        
        const filteredContext = contextManagerWithMatrix.getFilteredContext('info');
        
        expect(filteredContext).toHaveProperty('correlationId');
        expect(filteredContext.correlationId).toBe('internal-correlation-789');
        expect(filteredContext).not.toHaveProperty('userId');
      });
    });

    it('should include all fields when using wildcard (*)', async () => {
      const loggingMatrix = {
        default: ['correlationId'],
        error: ['*']
      };
      
      const contextManagerWithMatrix = new ContextManager(loggingMatrix);
      
      await contextManagerWithMatrix.run(async () => {
        contextManagerWithMatrix.set('x-correlation-id', 'test-correlation-123');
        contextManagerWithMatrix.set('userId', 'user-456');
        contextManagerWithMatrix.set('operation', 'test-operation');
        
        const filteredContext = contextManagerWithMatrix.getFilteredContext('error');
        
        expect(filteredContext).toHaveProperty('correlationId');
        expect(filteredContext).toHaveProperty('userId');
        expect(filteredContext).toHaveProperty('operation');
        expect(filteredContext.correlationId).toBe('test-correlation-123');
        expect(filteredContext.userId).toBe('user-456');
        expect(filteredContext.operation).toBe('test-operation');
      });
    });

    it('should handle custom correlationId header name', async () => {
      const loggingMatrix = {
        default: ['correlationId'],
        error: ['*']
      };
      
      const contextManagerWithMatrix = new ContextManager(loggingMatrix);
      contextManagerWithMatrix.configure({ correlationIdHeader: 'X-Custom-Correlation-ID' });
      
      await contextManagerWithMatrix.run(async () => {
        // Establecer correlationId usando el header personalizado
        contextManagerWithMatrix.set('X-Custom-Correlation-ID', 'custom-correlation-456');
        contextManagerWithMatrix.set('userId', 'user-789');
        
        const filteredContext = contextManagerWithMatrix.getFilteredContext('info');
        
        expect(filteredContext).toHaveProperty('correlationId');
        expect(filteredContext.correlationId).toBe('custom-correlation-456');
        expect(filteredContext).not.toHaveProperty('userId');
      });
    });

    it('should return empty object when no fields are configured for level', async () => {
      const loggingMatrix = {
        default: ['correlationId'],
        info: [] // Sin campos para info
      };
      
      const contextManagerWithMatrix = new ContextManager(loggingMatrix);
      
      await contextManagerWithMatrix.run(async () => {
        contextManagerWithMatrix.set('x-correlation-id', 'test-correlation-123');
        contextManagerWithMatrix.set('userId', 'user-456');
        
        const filteredContext = contextManagerWithMatrix.getFilteredContext('info');
        
        expect(filteredContext).toEqual({});
      });
    });

    it('should handle unknown fields gracefully', async () => {
      const loggingMatrix = {
        default: ['correlationId', 'unknownField'],
        error: ['*']
      };
      
      const contextManagerWithMatrix = new ContextManager(loggingMatrix);
      
      await contextManagerWithMatrix.run(async () => {
        contextManagerWithMatrix.set('x-correlation-id', 'test-correlation-123');
        contextManagerWithMatrix.set('knownField', 'known-value');
        
        const filteredContext = contextManagerWithMatrix.getFilteredContext('info');
        
        expect(filteredContext).toHaveProperty('correlationId');
        expect(filteredContext.correlationId).toBe('test-correlation-123');
        expect(filteredContext).not.toHaveProperty('unknownField');
        expect(filteredContext).not.toHaveProperty('knownField'); // No está en el mapeo
      });
    });
  });
});