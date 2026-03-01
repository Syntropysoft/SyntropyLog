/**
 * FILE: tests/logger/LoggerFactory.test.ts
 * DESCRIPTION: Unit tests for the LoggerFactory class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyntropyLogConfig } from '../../src/config';
import { Transport } from '../../src/logger/transports/Transport';
import { IContextManager } from '../../src/context';
import { SyntropyLog } from '../../src/SyntropyLog';

// We need the real MaskingStrategy enum
const { MaskingStrategy } = await vi.importActual('../../src/masking/MaskingEngine') as any;

// --- Mocks ---
const {
  MockLogger,
  MockConsoleTransport,
  MockSerializationManager,
  MockMaskingEngine,
} = vi.hoisted(() => ({
  MockLogger: vi.fn(),
  MockConsoleTransport: vi.fn(),
  MockSerializationManager: vi.fn(),
  MockMaskingEngine: vi.fn(),
}));

// Mock all dependencies of LoggerFactory
vi.mock('../../src/logger/Logger', () => ({ Logger: MockLogger }));
vi.mock('../../src/logger/transports/ConsoleTransport', () => ({
  ConsoleTransport: MockConsoleTransport,
}));
vi.mock('../../src/serialization/SerializationManager', () => ({
  SerializationManager: MockSerializationManager,
}));
vi.mock('../../src/masking/MaskingEngine', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    MaskingEngine: MockMaskingEngine,
  };
});

// Import the class to be tested AFTER mocks are defined
import { LoggerFactory } from '../../src/logger/LoggerFactory';

describe('LoggerFactory', () => {
  let baseConfig: SyntropyLogConfig;
  let mockContextManager: IContextManager;
  let mockSyntropyLog: SyntropyLog;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContextManager = {
      configure: vi.fn(),
      reconfigureLoggingMatrix: vi.fn(),
    } as unknown as IContextManager;

    mockSyntropyLog = {} as unknown as SyntropyLog;

    baseConfig = {
      logger: {
        level: 'info',
        serviceName: 'my-app',
        serializerTimeoutMs: 100,
      },
    };
  });

  describe('Constructor', () => {
    it('should instantiate dependencies with the provided config', () => {
      new LoggerFactory(baseConfig, mockContextManager, mockSyntropyLog);

      expect(MockSerializationManager).toHaveBeenCalledWith(expect.objectContaining({
        timeoutMs: 100,
      }));
      expect(MockMaskingEngine).toHaveBeenCalledWith({
        rules: undefined,
        maskChar: undefined,
        preserveLength: undefined,
        enableDefaultRules: true,
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

    it('should pass masking configs to their engines', () => {
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          serviceName: 'my-app',
          serializerTimeoutMs: 500,
        },
        masking: {
          rules: [
            { pattern: 'password', strategy: MaskingStrategy.PASSWORD },
            { pattern: /token/i, strategy: MaskingStrategy.TOKEN }
          ],
        },
      };

      new LoggerFactory(config, mockContextManager, mockSyntropyLog);

      expect(MockSerializationManager).toHaveBeenCalledWith(expect.objectContaining({
        timeoutMs: 500,
      }));
      expect(MockMaskingEngine).toHaveBeenCalledWith({
        rules: expect.any(Array),
        maskChar: undefined,
        preserveLength: undefined,
        enableDefaultRules: true,
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
      expect(dependencies.serializationManager).toBeInstanceOf(Object);
      expect(dependencies.maskingEngine).toBeInstanceOf(Object);
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