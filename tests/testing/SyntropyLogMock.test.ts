import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSyntropyLogMock,
  resetSyntropyLogMocks,
  createMockLogger,
  createMockContextManager,
  createMockHttpManager,
  createMockBrokerManager,
  createMockSerializationManager,
  getMockLogger,
  getMockContextManager,
  getMockHttpManager,
  getMockBrokerManager,
  getMockSerializationManager
} from '../../src/testing/SyntropyLogMock';

describe('SyntropyLogMock', () => {
  beforeEach(() => {
    resetSyntropyLogMocks();
  });

  describe('createMockLogger', () => {
    it('should create logger with all methods', () => {
      const logger = createMockLogger();
      
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.trace).toBeDefined();
      expect(logger.fatal).toBeDefined();
      expect(logger.withSource).toBeDefined();
    });

    it('should call logger methods without throwing', () => {
      const logger = createMockLogger();
      
      expect(() => {
        logger.info('test message');
        logger.warn('test warning');
        logger.error('test error');
        logger.debug('test debug');
        logger.trace('test trace');
        logger.fatal('test fatal');
      }).not.toThrow();
    });

    it('should accept metadata', () => {
      const logger = createMockLogger();
      
      expect(() => {
        logger.info('test', { user: 'test', id: 123 });
        logger.error('test', { error: new Error('test') });
      }).not.toThrow();
    });

    it('should return new logger with withSource', () => {
      const logger = createMockLogger();
      const sourceLogger = logger.withSource('test-service');
      
      expect(sourceLogger).toBeDefined();
      expect(sourceLogger).not.toBe(logger);
      expect(sourceLogger.info).toBeDefined();
    });
  });

  describe('createMockContextManager', () => {
    it('should create context manager with all methods', () => {
      const contextManager = createMockContextManager();
      
      expect(contextManager).toBeDefined();
      expect(contextManager.run).toBeDefined();
      expect(contextManager.set).toBeDefined();
      expect(contextManager.get).toBeDefined();
      expect(contextManager.getCorrelationIdHeaderName).toBeDefined();
      expect(contextManager.getTransactionIdHeaderName).toBeDefined();
    });

    it('should run async functions', async () => {
      const contextManager = createMockContextManager();
      const testFn = vi.fn().mockResolvedValue('test result');
      
      const result = await contextManager.run(testFn);
      
      expect(result).toBe('test result');
      expect(testFn).toHaveBeenCalled();
    });

    it('should run sync functions', async () => {
      const contextManager = createMockContextManager();
      const testFn = vi.fn().mockReturnValue('sync result');
      
      const result = await contextManager.run(testFn);
      
      expect(result).toBe('sync result');
      expect(testFn).toHaveBeenCalled();
    });

    it('should set and get context values', () => {
      const contextManager = createMockContextManager();
      
      contextManager.set('test-key', 'test-value');
      const value = contextManager.get('test-key');
      
      expect(value).toBe('test-value');
    });

    it('should return null for non-existent keys', () => {
      const contextManager = createMockContextManager();
      
      const value = contextManager.get('non-existent');
      
      expect(value).toBeNull();
    });

    it('should return correlation header name', () => {
      const contextManager = createMockContextManager();
      
      const headerName = contextManager.getCorrelationIdHeaderName();
      
      expect(headerName).toBe('x-correlation-id');
    });

    it('should return transaction header name', () => {
      const contextManager = createMockContextManager();
      
      const headerName = contextManager.getTransactionIdHeaderName();
      
      expect(headerName).toBe('x-transaction-id');
    });
  });

  describe('createMockHttpManager', () => {
    it('should create HTTP manager', () => {
      const httpManager = createMockHttpManager();
      
      expect(httpManager).toBeDefined();
    });
  });

  describe('createMockBrokerManager', () => {
    it('should create broker manager', () => {
      const brokerManager = createMockBrokerManager();
      
      expect(brokerManager).toBeDefined();
    });
  });

  describe('createMockSerializationManager', () => {
    it('should create serialization manager with methods', () => {
      const serializationManager = createMockSerializationManager();
      
      expect(serializationManager).toBeDefined();
      expect(serializationManager.serialize).toBeDefined();
      expect(serializationManager.deserialize).toBeDefined();
    });

    it('should serialize and deserialize', async () => {
      const serializationManager = createMockSerializationManager();
      
      const serialized = await serializationManager.serialize();
      const deserialized = await serializationManager.deserialize();
      
      expect(serialized).toBe('{}');
      expect(deserialized).toEqual({});
    });
  });

  describe('Global mock instances', () => {
    it('should get or create mock logger', () => {
      const logger1 = getMockLogger();
      const logger2 = getMockLogger();
      
      expect(logger1).toBeDefined();
      expect(logger1).toBe(logger2); // Same instance
    });

    it('should get or create mock context manager', () => {
      const context1 = getMockContextManager();
      const context2 = getMockContextManager();
      
      expect(context1).toBeDefined();
      expect(context1).toBe(context2); // Same instance
    });

    it('should get or create mock HTTP manager', () => {
      const http1 = getMockHttpManager();
      const http2 = getMockHttpManager();
      
      expect(http1).toBeDefined();
      expect(http1).toBe(http2); // Same instance
    });

    it('should get or create mock broker manager', () => {
      const broker1 = getMockBrokerManager();
      const broker2 = getMockBrokerManager();
      
      expect(broker1).toBeDefined();
      expect(broker1).toBe(broker2); // Same instance
    });

    it('should get or create mock serialization manager', () => {
      const serialization1 = getMockSerializationManager();
      const serialization2 = getMockSerializationManager();
      
      expect(serialization1).toBeDefined();
      expect(serialization1).toBe(serialization2); // Same instance
    });
  });

  describe('createSyntropyLogMock', () => {
    it('should create mock without spy function', () => {
      const mock = createSyntropyLogMock();
      
      expect(mock).toBeDefined();
      expect(mock.init).toBeDefined();
      expect(mock.shutdown).toBeDefined();
      expect(mock.getLogger).toBeDefined();
      expect(mock.getContextManager).toBeDefined();
      expect(mock.getHttpManager).toBeDefined();
      expect(mock.getBrokerManager).toBeDefined();
      expect(mock.getSerializationManager).toBeDefined();
    });

    it('should create mock with spy function', () => {
      const mock = createSyntropyLogMock(vi.fn);
      
      expect(mock).toBeDefined();
      expect(mock.init).toBeDefined();
      expect(mock.shutdown).toBeDefined();
      expect(mock.getLogger).toBeDefined();
      expect(mock.getContextManager).toBeDefined();
      expect(mock.getHttpManager).toBeDefined();
      expect(mock.getBrokerManager).toBeDefined();
      expect(mock.getSerializationManager).toBeDefined();
    });

    it('should call init without throwing', async () => {
      const mock = createSyntropyLogMock();
      
      await expect(mock.init()).resolves.not.toThrow();
    });

    it('should call shutdown without throwing', async () => {
      const mock = createSyntropyLogMock();
      
      await expect(mock.shutdown()).resolves.not.toThrow();
    });

    it('should get logger', () => {
      const mock = createSyntropyLogMock();
      
      const logger = mock.getLogger();
      
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
    });

    it('should get context manager', () => {
      const mock = createSyntropyLogMock();
      
      const contextManager = mock.getContextManager();
      
      expect(contextManager).toBeDefined();
      expect(contextManager.run).toBeDefined();
    });

    it('should get HTTP manager', () => {
      const mock = createSyntropyLogMock();
      
      const httpManager = mock.getHttpManager();
      
      expect(httpManager).toBeDefined();
    });

    it('should get broker manager', () => {
      const mock = createSyntropyLogMock();
      
      const brokerManager = mock.getBrokerManager();
      
      expect(brokerManager).toBeDefined();
    });

    it('should get serialization manager', () => {
      const mock = createSyntropyLogMock();
      
      const serializationManager = mock.getSerializationManager();
      
      expect(serializationManager).toBeDefined();
    });

    it('should work with spy functions for assertions', () => {
      const mock = createSyntropyLogMock(vi.fn);
      
      // Call methods
      mock.init();
      mock.getLogger();
      mock.getContextManager();
      
      // Should be able to assert on spy functions
      expect(mock.init).toHaveBeenCalled();
      expect(mock.getLogger).toHaveBeenCalled();
      expect(mock.getContextManager).toHaveBeenCalled();
    });
  });

  describe('resetSyntropyLogMocks', () => {
    it('should reset all global instances', () => {
      // Create instances
      const logger1 = getMockLogger();
      const context1 = getMockContextManager();
      const http1 = getMockHttpManager();
      const broker1 = getMockBrokerManager();
      const serialization1 = getMockSerializationManager();
      
      // Reset
      resetSyntropyLogMocks();
      
      // Get new instances
      const logger2 = getMockLogger();
      const context2 = getMockContextManager();
      const http2 = getMockHttpManager();
      const broker2 = getMockBrokerManager();
      const serialization2 = getMockSerializationManager();
      
      // Should be different instances
      expect(logger1).not.toBe(logger2);
      expect(context1).not.toBe(context2);
      expect(http1).not.toBe(http2);
      expect(broker1).not.toBe(broker2);
      expect(serialization1).not.toBe(serialization2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined arguments', () => {
      const logger = createMockLogger();
      const contextManager = createMockContextManager();
      
      expect(() => {
        logger.info(undefined);
        logger.error(undefined);
        contextManager.set(undefined, undefined);
        contextManager.get(undefined);
      }).not.toThrow();
    });

    it('should handle null arguments', () => {
      const logger = createMockLogger();
      const contextManager = createMockContextManager();
      
      expect(() => {
        logger.info(null);
        logger.error(null);
        contextManager.set(null, null);
        contextManager.get(null);
      }).not.toThrow();
    });

    it('should handle complex objects', () => {
      const logger = createMockLogger();
      const contextManager = createMockContextManager();
      
      const complexObj = {
        nested: {
          array: [1, 2, 3],
          func: () => 'test',
          date: new Date()
        }
      };
      
      expect(() => {
        logger.info('test', complexObj);
        contextManager.set('complex', complexObj);
      }).not.toThrow();
    });
  });
}); 