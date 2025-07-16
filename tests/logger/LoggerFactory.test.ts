/**
 * FILE: tests/logger/LoggerFactory.test.ts
 * DESCRIPTION: Unit tests for the LoggerFactory class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyntropyLogConfig } from '../../src/config';
import { Transport } from '../../src/logger/transports/Transport';
import { SpyTransport } from '../../src/logger/transports/SpyTransport';
import { IContextManager } from '../../src/context';
import { SyntropyLog } from '../../src/SyntropyLog';

// --- Mocks ---
const {
  MockLogger,
  MockConsoleTransport,
  MockSerializerRegistry,
  MockMaskingEngine,
} = vi.hoisted(() => ({
  MockLogger: vi.fn(),
  MockConsoleTransport: vi.fn(),
  MockSerializerRegistry: vi.fn(),
  MockMaskingEngine: vi.fn(),
}));

// Mock all dependencies of LoggerFactory
vi.mock('../../src/logger/Logger', () => ({ Logger: MockLogger }));
vi.mock('../../src/logger/transports/ConsoleTransport', () => ({
  ConsoleTransport: MockConsoleTransport,
}));
vi.mock('../../src/serialization/SerializerRegistry', () => ({
  SerializerRegistry: MockSerializerRegistry,
}));
vi.mock('../../src/masking/MaskingEngine', () => ({
  MaskingEngine: MockMaskingEngine,
}));
// SanitizationEngine is a concrete class with no side-effects, so no need to mock.

// Import the class to be tested AFTER mocks are defined
import { LoggerFactory } from '../../src/logger/LoggerFactory';

// --- Tests ---

describe('LoggerFactory', () => {
  let baseConfig: SyntropyLogConfig;
  let mockContextManager: IContextManager;
  let mockSyntropyLog: SyntropyLog;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock instances for dependencies that are now injected.
    mockContextManager = {
      configure: vi.fn(),
      // Add other methods if needed by tests, but for now this is enough.
    } as unknown as IContextManager;

    mockSyntropyLog = {} as unknown as SyntropyLog;

    baseConfig = {
      logger: {
        level: 'info',
        serviceName: 'my-app',
        serializerTimeoutMs: 100, // Add default value
      },
    };
  });

  describe('Constructor', () => {
    it('should instantiate dependencies with the provided config', () => {
      new LoggerFactory(baseConfig, mockContextManager, mockSyntropyLog);

      expect(MockSerializerRegistry).toHaveBeenCalledWith({
        serializers: undefined,
        timeoutMs: 100, // Default value from config
      });
      expect(MockMaskingEngine).toHaveBeenCalledWith({
        fields: undefined,
        maskChar: undefined,
        maxDepth: undefined,
      });
      expect(MockConsoleTransport).toHaveBeenCalledOnce();
    });

    it('should configure context manager if context config is present', () => {
      const config: SyntropyLogConfig = {
        ...baseConfig,
        context: { correlationIdHeader: 'x-custom-id' },
      };
      new LoggerFactory(config, mockContextManager, mockSyntropyLog);
      expect(mockContextManager.configure).toHaveBeenCalledWith({
        correlationIdHeader: 'x-custom-id',
      });
    });

    it('should use custom transports if provided and not create default ones', () => {
      const mockTransport = new SpyTransport();
      const config: SyntropyLogConfig = {
        ...baseConfig,
        logger: { ...baseConfig.logger, transports: [mockTransport], serializerTimeoutMs: 100 },
      };
      new LoggerFactory(config, mockContextManager, mockSyntropyLog);
      expect(MockConsoleTransport).not.toHaveBeenCalled();
    });

    it('should pass serializer and masking configs to their engines', () => {
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          serviceName: 'my-app',
          serializers: {
            custom: (val: any) => JSON.stringify(val),
          },
          serializerTimeoutMs: 500,
        },
        masking: {
          fields: ['password', /token/i],
        },
      };

      new LoggerFactory(config, mockContextManager, mockSyntropyLog);

      expect(MockSerializerRegistry).toHaveBeenCalledWith({
        serializers: config.logger?.serializers,
        timeoutMs: 500,
      });
      expect(MockMaskingEngine).toHaveBeenCalledWith({
        ...config.masking,
        maxDepth: undefined,
        maskChar: undefined,
      });
    });
  });

  describe('getLogger', () => {
    it('should create a new logger with correct options on first call', () => {
      const factory = new LoggerFactory(
        baseConfig,
        mockContextManager,
        mockSyntropyLog
      );
      factory.getLogger('api-logger');

      expect(MockLogger).toHaveBeenCalledOnce();
      
      const [name, transports, dependencies] = MockLogger.mock.calls[0];

      expect(name).toBe('api-logger');
      expect(transports).toBeInstanceOf(Array);
      expect(dependencies.contextManager).toBe(mockContextManager);
      expect(dependencies.syntropyLogInstance).toBe(mockSyntropyLog);
      expect(dependencies.serializerRegistry).toBeInstanceOf(Object);
      expect(dependencies.maskingEngine).toBeInstanceOf(Object);
      // We don't check level here because it's set on the instance after creation
    });

    it('should use the global serviceName for the "default" logger', () => {
      const factory = new LoggerFactory(
        baseConfig,
        mockContextManager,
        mockSyntropyLog
      );
      factory.getLogger('default');

      const [name] = MockLogger.mock.calls[0];
      expect(name).toBe('my-app');
    });

    it('should return a cached logger instance on subsequent calls', () => {
      const factory = new LoggerFactory(
        baseConfig,
        mockContextManager,
        mockSyntropyLog
      );
      const logger1 = factory.getLogger('api-logger');
      const logger2 = factory.getLogger('api-logger');

      expect(logger1).toBe(logger2);
      expect(MockLogger).toHaveBeenCalledOnce();
    });
  });

  describe('flushAllTransports', () => {
    it('should call flush on all provided transports', async () => {
      const transport1 = {
        flush: vi.fn().mockResolvedValue(undefined),
      } as unknown as Transport;
      const transport2 = {
        flush: vi.fn().mockResolvedValue(undefined),
      } as unknown as Transport;
      const config: SyntropyLogConfig = {
        ...baseConfig,
        logger: { ...baseConfig.logger, transports: [transport1, transport2], serializerTimeoutMs: 100 },
      };
      const factory = new LoggerFactory(
        config,
        mockContextManager,
        mockSyntropyLog
      );
      await factory.flushAllTransports();

      expect(transport1.flush).toHaveBeenCalledOnce();
      expect(transport2.flush).toHaveBeenCalledOnce();
    });
  });
});