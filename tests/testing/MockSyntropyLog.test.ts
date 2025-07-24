import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockSyntropyLog, createTestHelper } from '../../src/testing/MockSyntropyLog';

describe('MockSyntropyLog', () => {
  let mockSyntropyLog: MockSyntropyLog;

  beforeEach(() => {
    mockSyntropyLog = new MockSyntropyLog();
  });

  describe('Basic Functionality', () => {
    it('should create logger with all methods', () => {
      const logger = mockSyntropyLog.getLogger();
      
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.trace).toBeDefined();
    });

    it('should create context manager with all methods', () => {
      const contextManager = mockSyntropyLog.getContextManager();
      
      expect(contextManager).toBeDefined();
      expect(contextManager.getCorrelationId).toBeDefined();
      expect(contextManager.getTransactionId).toBeDefined();
      expect(contextManager.getCorrelationIdHeaderName).toBeDefined();
      expect(contextManager.setCorrelationId).toBeDefined();
      expect(contextManager.setTransactionId).toBeDefined();
      expect(contextManager.set).toBeDefined();
      expect(contextManager.clear).toBeDefined();
      expect(contextManager.run).toBeDefined();
    });

    it('should return same logger instance', () => {
      const logger1 = mockSyntropyLog.getLogger('service1');
      const logger2 = mockSyntropyLog.getLogger('service2');
      
      expect(logger1).toBe(logger2);
    });

    it('should return same context manager instance', () => {
      const context1 = mockSyntropyLog.getContextManager();
      const context2 = mockSyntropyLog.getContextManager();
      
      expect(context1).toBe(context2);
    });
  });

  describe('Logger Methods', () => {
    it('should call logger methods without throwing', () => {
      const logger = mockSyntropyLog.getLogger();
      
      expect(() => {
        logger.info('test message');
        logger.error('test error');
        logger.warn('test warning');
        logger.debug('test debug');
        logger.trace('test trace');
      }).not.toThrow();
    });

    it('should accept multiple arguments', () => {
      const logger = mockSyntropyLog.getLogger();
      
      expect(() => {
        logger.info('message', { data: 'test' }, 123);
        logger.error('error', new Error('test'), { context: 'test' });
      }).not.toThrow();
    });
  });

  describe('Context Manager Methods', () => {
    it('should return default correlation ID', () => {
      const contextManager = mockSyntropyLog.getContextManager();
      const correlationId = contextManager.getCorrelationId();
      
      expect(correlationId).toBe('mock-correlation-id');
    });

    it('should return default transaction ID', () => {
      const contextManager = mockSyntropyLog.getContextManager();
      const transactionId = contextManager.getTransactionId();
      
      expect(transactionId).toBe('mock-transaction-id');
    });

    it('should return default correlation header name', () => {
      const contextManager = mockSyntropyLog.getContextManager();
      const headerName = contextManager.getCorrelationIdHeaderName();
      
      expect(headerName).toBe('x-correlation-id');
    });

    it('should call setter methods without throwing', () => {
      const contextManager = mockSyntropyLog.getContextManager();
      
      expect(() => {
        contextManager.setCorrelationId('new-id');
        contextManager.setTransactionId('new-tx-id');
        contextManager.set('key', 'value');
        contextManager.clear();
      }).not.toThrow();
    });

    it('should run async functions', async () => {
      const contextManager = mockSyntropyLog.getContextManager();
      const testFn = vi.fn().mockResolvedValue('test result');
      
      const result = await contextManager.run(testFn);
      
      expect(result).toBe('test result');
      expect(testFn).toHaveBeenCalled();
    });

    it('should run sync functions', async () => {
      const contextManager = mockSyntropyLog.getContextManager();
      const testFn = vi.fn().mockReturnValue('sync result');
      
      const result = await contextManager.run(testFn);
      
      expect(result).toBe('sync result');
      expect(testFn).toHaveBeenCalled();
    });
  });

  describe('Lifecycle Methods', () => {
    it('should initialize without throwing', async () => {
      await expect(mockSyntropyLog.init()).resolves.not.toThrow();
    });

    it('should initialize with config', async () => {
      const config = { level: 'info', service: 'test' };
      await expect(mockSyntropyLog.init(config)).resolves.not.toThrow();
    });

    it('should shutdown without throwing', async () => {
      await expect(mockSyntropyLog.shutdown()).resolves.not.toThrow();
    });

    it('should reset without throwing', () => {
      expect(() => mockSyntropyLog.reset()).not.toThrow();
    });
  });

  describe('Test Helper', () => {
    it('should create test helper', () => {
      const testHelper = createTestHelper();
      
      expect(testHelper).toBeDefined();
      expect(testHelper.mockSyntropyLog).toBeDefined();
      expect(testHelper.beforeEach).toBeDefined();
    });

    it('should call beforeEach without throwing', () => {
      const testHelper = createTestHelper();
      
      expect(() => testHelper.beforeEach()).not.toThrow();
    });

    it('should reset mocks in beforeEach', () => {
      const testHelper = createTestHelper();
      const logger = testHelper.mockSyntropyLog.getLogger();
      
      // Call some methods
      logger.info('test');
      logger.error('test');
      
      // Reset
      testHelper.beforeEach();
      
      // Should still work after reset
      expect(() => logger.info('test')).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined arguments', () => {
      const logger = mockSyntropyLog.getLogger();
      const contextManager = mockSyntropyLog.getContextManager();
      
      expect(() => {
        logger.info();
        logger.error();
        contextManager.set(undefined, undefined);
        contextManager.setCorrelationId(undefined);
      }).not.toThrow();
    });

    it('should handle null arguments', () => {
      const logger = mockSyntropyLog.getLogger();
      const contextManager = mockSyntropyLog.getContextManager();
      
      expect(() => {
        logger.info(null);
        logger.error(null);
        contextManager.set(null, null);
        contextManager.setCorrelationId(null);
      }).not.toThrow();
    });

    it('should handle complex objects', () => {
      const logger = mockSyntropyLog.getLogger();
      const contextManager = mockSyntropyLog.getContextManager();
      
      const complexObj = {
        nested: {
          array: [1, 2, 3],
          func: () => 'test',
          date: new Date()
        }
      };
      
      expect(() => {
        logger.info(complexObj);
        contextManager.set('complex', complexObj);
      }).not.toThrow();
    });
  });
}); 