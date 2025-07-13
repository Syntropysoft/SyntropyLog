/**
 * FILE: tests/logger/LoggerFactory.test.ts
 * DESCRIPTION: Unit tests for the LoggerFactory class.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyntropyLogConfig } from '../../src/config';
import { Transport } from '../../src/logger/transports/Transport';
import { SpyTransport } from '../../src/logger/transports/SpyTransport';

// --- Mocks ---

// Hoist mocks to be available in the factory functions, preventing ReferenceError.
const {
  MockLogger,
  mockContextManager,
  MockContextManager,
  MockConsoleTransport,
  MockSerializerRegistry,
  MockMaskingEngine,
  MockSanitizationEngine,
} = vi.hoisted(() => {
  const MockLogger = vi.fn();
  const mockContextManager = { configure: vi.fn() };
  const MockContextManager = vi.fn(() => mockContextManager);
  const MockConsoleTransport = vi.fn();
  const MockSerializerRegistry = vi.fn();
  const MockMaskingEngine = vi.fn();
  const MockSanitizationEngine = vi.fn();

  return {
    MockLogger,
    mockContextManager,
    MockContextManager,
    MockConsoleTransport,
    MockSerializerRegistry,
    MockMaskingEngine,
    MockSanitizationEngine,
  };
});

// Mock all dependencies of LoggerFactory
vi.mock('../../src/logger/Logger', () => ({ Logger: MockLogger }));
vi.mock('../../src/context/ContextManager', () => ({ ContextManager: MockContextManager }));
vi.mock('../../src/logger/transports/ConsoleTransport', () => ({ ConsoleTransport: MockConsoleTransport }));
vi.mock('../../src/serialization/SerializerRegistry', () => ({ SerializerRegistry: MockSerializerRegistry }));
vi.mock('../../src/masking/MaskingEngine', () => ({ MaskingEngine: MockMaskingEngine }));
vi.mock('../../src/sanitization/SanitizationEngine', () => ({ SanitizationEngine: MockSanitizationEngine }));

// Import the class to be tested AFTER mocks are defined
import { LoggerFactory } from '../../src/logger/LoggerFactory';

// --- Tests ---

describe('LoggerFactory', () => {
  let baseConfig: SyntropyLogConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    baseConfig = {
      logger: {
        level: 'info',
        serviceName: 'my-app',
        serializerTimeoutMs: 50, // Add the required property
      },
    };
  });

  describe('Constructor', () => {
    it('should instantiate dependencies with default settings', () => {
      // This config simulates the object *after* it has been parsed by Zod,
      // which applies the default values.
      const parsedConfig: SyntropyLogConfig = {
        logger: {
          serializerTimeoutMs: 50,
        },
      };
      new LoggerFactory(parsedConfig);

      expect(MockContextManager).toHaveBeenCalledOnce();
      expect(mockContextManager.configure).not.toHaveBeenCalled();
      expect(MockConsoleTransport).toHaveBeenCalledOnce(); // Default transport
      expect(MockSerializerRegistry).toHaveBeenCalledWith({
        serializers: undefined,
        timeoutMs: 50, // This should now be the default from the config schema
      });
      expect(MockMaskingEngine).toHaveBeenCalledWith(undefined);
      expect(MockSanitizationEngine).toHaveBeenCalledOnce();
    });

    it('should configure context manager with custom correlation ID header', () => {
      const config: SyntropyLogConfig = {
        ...baseConfig,
        context: { correlationIdHeader: 'x-request-id' },
      };
      new LoggerFactory(config);
      expect(mockContextManager.configure).toHaveBeenCalledWith({
        correlationIdHeader: 'x-request-id',
      });
    });

    it('should use custom transports if provided', () => {
      const mockTransport = new SpyTransport();
      const config: SyntropyLogConfig = {
        ...baseConfig,
        logger: { ...baseConfig.logger, transports: [mockTransport] },
      };
      new LoggerFactory(config);
      // Default console transport should NOT be created
      expect(MockConsoleTransport).not.toHaveBeenCalled();
    });

    it('should pass serializer and masking configs to their engines', () => {
      const config: SyntropyLogConfig = {
        ...baseConfig,
        logger: {
          ...baseConfig.logger,
          serializers: { err: () => ({}) },
          serializerTimeoutMs: 500,
        },
        masking: { rules: [] },
      };
      new LoggerFactory(config);
      expect(MockSerializerRegistry).toHaveBeenCalledWith({
        serializers: config.logger?.serializers,
        timeoutMs: 500,
      });
      expect(MockMaskingEngine).toHaveBeenCalledWith(config.masking);
    });
  });

  describe('getLogger', () => {
    it('should create a new logger with correct options on first call', () => {
      const factory = new LoggerFactory(baseConfig);
      factory.getLogger('api-logger');

      expect(MockLogger).toHaveBeenCalledOnce();
      const loggerOptions = MockLogger.mock.calls[0][0];

      expect(loggerOptions.level).toBe('info');
      expect(loggerOptions.serviceName).toBe('api-logger');
      expect(loggerOptions.contextManager).toBe(mockContextManager);
      expect(loggerOptions.serializerRegistry).toBeInstanceOf(Object);
      expect(loggerOptions.maskingEngine).toBeInstanceOf(Object);
    });

    it('should use the global serviceName for the "default" logger', () => {
      const factory = new LoggerFactory(baseConfig);
      factory.getLogger('default');

      const loggerOptions = MockLogger.mock.calls[0][0];
      expect(loggerOptions.serviceName).toBe('my-app');
    });

    it('should return a cached logger instance on subsequent calls for the same name', () => {
      const factory = new LoggerFactory(baseConfig);
      const logger1 = factory.getLogger('api-logger');
      const logger2 = factory.getLogger('api-logger');

      expect(logger1).toBe(logger2);
      expect(MockLogger).toHaveBeenCalledOnce();
    });
  });

  describe('getContextManager', () => {
    it('should return the created context manager instance', () => {
      const factory = new LoggerFactory(baseConfig);
      const cm = factory.getContextManager();
      expect(cm).toBe(mockContextManager);
    });
  });

  describe('flushAllTransports', () => {
    let consoleErrorSpy: vi.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should call flush on all provided transports', async () => {
      const transport1 = { flush: vi.fn().mockResolvedValue(undefined), constructor: { name: 'T1' } } as unknown as Transport;
      const transport2 = { flush: vi.fn().mockResolvedValue(undefined), constructor: { name: 'T2' } } as unknown as Transport;
      const config: SyntropyLogConfig = { ...baseConfig, logger: { ...baseConfig.logger, transports: [transport1, transport2] } };
      const factory = new LoggerFactory(config);
      await factory.flushAllTransports();

      expect(transport1.flush).toHaveBeenCalledOnce();
      expect(transport2.flush).toHaveBeenCalledOnce();
    });

    it('should handle and log errors from a failing transport flush', async () => {
      const error = new Error('Flush failed');
      const failingTransport = { flush: vi.fn().mockRejectedValue(error), constructor: { name: 'Failing' } } as unknown as Transport;
      const workingTransport = { flush: vi.fn().mockResolvedValue(undefined), constructor: { name: 'Working' } } as unknown as Transport;
      const config: SyntropyLogConfig = { ...baseConfig, logger: { ...baseConfig.logger, transports: [failingTransport, workingTransport] } };
      const factory = new LoggerFactory(config);
      await factory.flushAllTransports();

      expect(failingTransport.flush).toHaveBeenCalledOnce();
      expect(workingTransport.flush).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error flushing transport Failing:', error);
    });
  });
});