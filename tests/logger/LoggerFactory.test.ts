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
const { MaskingStrategy } = (await vi.importActual(
  '../../src/masking/MaskingEngine'
)) as any;

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
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    MaskingEngine: MockMaskingEngine,
  };
});

// Import the class to be tested AFTER mocks are defined
import {
  LoggerFactory,
  resolveTransports,
  createCacheKey,
} from '../../src/logger/LoggerFactory';

describe('LoggerFactory Pure Functions', () => {
  describe('createCacheKey', () => {
    it('should return name if no bindings provided', () => {
      expect(createCacheKey('test')).toBe('test');
      expect(createCacheKey('test', {})).toBe('test');
    });

    it('should return consistent key regardless of property order', () => {
      const key1 = createCacheKey('test', { a: 1, b: 2 });
      const key2 = createCacheKey('test', { b: 2, a: 1 });
      expect(key1).toBe(key2);
      expect(key1).toContain('test');
      expect(key1).toContain('{"a":1,"b":2}');
    });

    it('should handle non-serializable objects gracefully', () => {
      const circular: any = { a: 1 };
      circular.self = circular;
      const key = createCacheKey('test', circular);
      expect(key).toBe('test:a,self');
    });
  });

  describe('resolveTransports', () => {
    it('should return default console transport if no config provided', () => {
      const result = resolveTransports({});
      expect(result.transports.default).toHaveLength(1);
      expect(result.transportPool.has('console')).toBe(true);
    });

    it('should resolve transports from list and env', () => {
      const t1 = { name: 't1' } as Transport;
      const config: SyntropyLogConfig = {
        logger: {
          transportList: { t1 },
          env: { dev: ['t1'] },
          environment: 'dev',
        },
      };
      const result = resolveTransports(config);
      expect(result.transports.default).toHaveLength(1);
      expect(result.transports.default[0]).toBe(t1);
    });
  });
});

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

      expect(MockSerializationManager).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMs: 100,
        })
      );
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
            { pattern: /token/i, strategy: MaskingStrategy.TOKEN },
          ],
        },
      };

      new LoggerFactory(config, mockContextManager, mockSyntropyLog);

      expect(MockSerializationManager).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMs: 500,
        })
      );
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

    it('should cache logger by name and bindings (same key returns same instance)', () => {
      const factory = new LoggerFactory(
        baseConfig,
        mockContextManager,
        mockSyntropyLog
      );
      const a = factory.getLogger('cache-test', { component: 'a' });
      const b = factory.getLogger('cache-test', { component: 'a' });
      expect(a).toBe(b);
      expect(MockLogger).toHaveBeenCalledTimes(1);
    });

    it('should create different loggers for different bindings', () => {
      const factory = new LoggerFactory(
        baseConfig,
        mockContextManager,
        mockSyntropyLog
      );
      const a = factory.getLogger('multi', { x: 1 });
      const b = factory.getLogger('multi', { x: 2 });
      expect(a).not.toBe(b);
      expect(MockLogger).toHaveBeenCalledTimes(2);
    });
  });

  describe('Constructor with transportList and env', () => {
    it('should use transportList and env when both provided', () => {
      const transport1 = {
        log: vi.fn(),
        name: 't1',
        level: 'info',
        isLevelEnabled: vi.fn().mockReturnValue(true),
        flush: vi.fn().mockResolvedValue(undefined),
      } as unknown as Transport;
      const transport2 = {
        log: vi.fn(),
        name: 't2',
        level: 'info',
        isLevelEnabled: vi.fn().mockReturnValue(true),
        flush: vi.fn().mockResolvedValue(undefined),
      } as unknown as Transport;
      const config: SyntropyLogConfig = {
        ...baseConfig,
        logger: {
          level: 'info',
          serviceName: 'my-app',
          serializerTimeoutMs: 100,
          transportList: { t1: transport1, t2: transport2 },
          env: { development: ['t1'], production: ['t1', 't2'] },
          environment: 'development',
        },
      };

      const factory = new LoggerFactory(
        config,
        mockContextManager,
        mockSyntropyLog
      );
      const logger = factory.getLogger();

      expect(MockLogger).toHaveBeenCalledOnce();
      const [, transports] = MockLogger.mock.calls[0];
      expect(transports).toHaveLength(1);
      expect(transports[0]).toBe(transport1);
    });

    it('should use transportList and env for production', () => {
      const transport1 = {
        log: vi.fn(),
        name: 't1',
        level: 'info',
        isLevelEnabled: vi.fn().mockReturnValue(true),
        flush: vi.fn().mockResolvedValue(undefined),
      } as unknown as Transport;
      const transport2 = {
        log: vi.fn(),
        name: 't2',
        level: 'info',
        isLevelEnabled: vi.fn().mockReturnValue(true),
        flush: vi.fn().mockResolvedValue(undefined),
      } as unknown as Transport;
      const config: SyntropyLogConfig = {
        ...baseConfig,
        logger: {
          level: 'info',
          serviceName: 'my-app',
          serializerTimeoutMs: 100,
          transportList: { t1: transport1, t2: transport2 },
          env: { development: ['t1'], production: ['t1', 't2'] },
          environment: 'production',
        },
      };

      const factory = new LoggerFactory(
        config,
        mockContextManager,
        mockSyntropyLog
      );
      const logger = factory.getLogger();

      const [, transports] = MockLogger.mock.calls[0];
      expect(transports).toHaveLength(2);
      expect(transports).toContain(transport1);
      expect(transports).toContain(transport2);
    });
  });

  describe('Constructor with transports record and env filter', () => {
    it('should use transports as Record (category -> entries) and filter by env', () => {
      const transportA = {
        log: vi.fn(),
        name: 'ta',
        level: 'info',
        isLevelEnabled: vi.fn().mockReturnValue(true),
        flush: vi.fn().mockResolvedValue(undefined),
      } as unknown as Transport;
      const transportB = {
        log: vi.fn(),
        name: 'tb',
        level: 'info',
        isLevelEnabled: vi.fn().mockReturnValue(true),
        flush: vi.fn().mockResolvedValue(undefined),
      } as unknown as Transport;
      const config: SyntropyLogConfig = {
        ...baseConfig,
        logger: {
          level: 'info',
          serviceName: 'my-app',
          serializerTimeoutMs: 100,
          transports: {
            default: [
              { transport: transportA, env: ['development'] },
              { transport: transportB, env: ['production'] },
            ],
          },
          environment: 'production',
        },
      };

      const factory = new LoggerFactory(
        config,
        mockContextManager,
        mockSyntropyLog
      );
      const logger = factory.getLogger();

      const [, transports] = MockLogger.mock.calls[0];
      expect(transports).toHaveLength(1);
      expect(transports[0]).toBe(transportB);
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
        logger: {
          ...baseConfig.logger,
          transports: [transport1, transport2],
          serializerTimeoutMs: 100,
        },
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

    it('should log and continue when a transport flush fails', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const transport1 = {
        flush: vi.fn().mockRejectedValue(new Error('Flush failed')),
        constructor: { name: 'Transport1' },
      } as unknown as Transport;
      const config: SyntropyLogConfig = {
        ...baseConfig,
        logger: {
          ...baseConfig.logger,
          transports: [transport1],
          serializerTimeoutMs: 100,
        },
      };
      const factory = new LoggerFactory(
        config,
        mockContextManager,
        mockSyntropyLog
      );
      await factory.flushAllTransports();

      expect(transport1.flush).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error flushing transport'),
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    it('should call flush and then shutdown on all transports', async () => {
      const transport1: any = {
        flush: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        constructor: { name: 'Transport1' },
      };
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          transports: [transport1],
          serializerTimeoutMs: 100,
        },
      };
      const factory = new LoggerFactory(
        config,
        mockContextManager,
        mockSyntropyLog
      );
      await factory.shutdown();

      expect(transport1.flush).toHaveBeenCalledOnce();
      expect(transport1.shutdown).toHaveBeenCalledOnce();
    });

    it('should handle errors during transport shutdown gracefully', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const transport1: any = {
        flush: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockRejectedValue(new Error('Shutdown failed')),
        constructor: { name: 'Transport1' },
      };
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          transports: [transport1],
          serializerTimeoutMs: 100,
        },
      };
      const factory = new LoggerFactory(
        config,
        mockContextManager,
        mockSyntropyLog
      );
      await factory.shutdown();

      expect(transport1.shutdown).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error shutting down transport'),
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Default Transports', () => {
    it('should create a default ConsoleTransport if none are provided', () => {
      new LoggerFactory({}, mockContextManager, mockSyntropyLog);
      expect(MockConsoleTransport).toHaveBeenCalledOnce();
    });
  });
});
