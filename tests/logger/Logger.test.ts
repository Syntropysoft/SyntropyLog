/// <reference types="vitest/globals" />
/**
 * FILE: tests/logger/Logger.test.ts
 * DESCRIPTION: Unit tests for the core Logger class.
 */
import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { Logger, LoggerDependencies } from '../../src/logger/Logger';
import { LogEntry } from '../../src/types';
import { LogLevel } from '../../src/logger/levels';
import { SyntropyLog } from '../../src/SyntropyLog';
import {
  Transport,
  TransportOptions,
} from '../../src/logger/transports/Transport';
import { MaskingEngine } from '../../src/masking/MaskingEngine';
import { SerializationManager } from '../../src/serialization/SerializationManager';
import { IContextManager } from '../../src/context';
import { ILogger } from '../../src/logger';

// Mock utilities defined inline for this test
const createMockLogger = (): ILogger => ({
  debug: vi.fn() as any,
  info: vi.fn() as any,
  warn: vi.fn() as any,
  error: vi.fn() as any,
  trace: vi.fn() as any,
  fatal: vi.fn() as any,
  audit: vi.fn() as any,
  child: vi.fn().mockReturnThis(),
  withSource: vi.fn().mockReturnThis(),
  level: 'info',
  setLevel: vi.fn(),
  withRetention: vi.fn().mockReturnThis(),
  withTransactionId: vi.fn().mockReturnThis(),
});

const createMockContextManager = (): IContextManager => ({
  run: vi.fn().mockImplementation(async (fn) => {
    await fn();
  }),
  get: vi.fn(),
  set: vi.fn(),
  getAll: vi.fn().mockReturnValue({}),
  getFilteredContext: vi.fn().mockReturnValue({ traceId: 'test-trace-id' }),
  getCorrelationId: vi.fn(),
  getTransactionId: vi.fn(),
  setTransactionId: vi.fn(),
  configure: vi.fn(),
  getCorrelationIdHeaderName: vi.fn().mockReturnValue('x-correlation-id'),
  getTransactionIdHeaderName: vi.fn().mockReturnValue('x-trace-id'),
  getTraceContextHeaders: vi.fn().mockReturnValue({}),
  reconfigureLoggingMatrix: vi.fn(),
});

const createMockTransport = (options: { level: LogLevel; name: string }): Transport => {
  const t = {
    log: vi.fn().mockResolvedValue(undefined),
    level: options.level,
    name: options.name,
    isLevelEnabled: vi.fn().mockImplementation((level: LogLevel) => {
      // Simple implementation for testing
      const levels: LogLevel[] = ['trace', 'debug', 'info', 'audit', 'warn', 'error', 'fatal'];
      const targetIdx = levels.indexOf(options.level);
      const currentIdx = levels.indexOf(level);
      return currentIdx >= targetIdx;
    }),
    flush: vi.fn().mockResolvedValue(undefined),
  } as unknown as Transport;
  return t;
};

const createMockPipelineComponents = () => ({
  mockMasker: {
    process: vi.fn().mockImplementation((entry) => entry),
  },
  mockSerializationManager: {
    serialize: vi.fn().mockImplementation((data) => Promise.resolve({
      success: true,
      data,
      metadata: { serializer: 'test', stepDurations: {} }
    })),
  },
});

describe('Logger', () => {
  let mockMasker: Mocked<MaskingEngine>;
  let mockSerializationManager: Mocked<SerializationManager>;
  let mockContextManager: Mocked<IContextManager>;
  let mockSyntropyLog: Mocked<SyntropyLog>;
  let dependencies: LoggerDependencies;
  let transports: Transport[];
  let logger: Logger;

  beforeEach(() => {
    const pipelineComponents = createMockPipelineComponents();
    mockMasker = pipelineComponents.mockMasker as any;
    mockSerializationManager = pipelineComponents.mockSerializationManager as any;
    mockContextManager = createMockContextManager() as any;
    mockSyntropyLog = {
      getLogger: vi.fn().mockImplementation((name, bindings) => {
        const childLogger = new Logger(name, transports, dependencies);
        return childLogger;
      }),
    } as unknown as Mocked<SyntropyLog>;

    dependencies = {
      maskingEngine: mockMasker,
      serializationManager: mockSerializationManager,
      contextManager: mockContextManager,
      syntropyLogInstance: mockSyntropyLog,
    };

    transports = [
      createMockTransport({ level: 'info', name: 'test-transport-1' }),
      createMockTransport({ level: 'debug', name: 'test-transport-2' }),
    ];

    logger = new Logger('test-logger', transports, dependencies);
  });

  describe('Logging methods', () => {
    it('should set initial level correctly', () => {
      expect(logger.level).toBe('info');
    });

    it('should format a basic log entry and pass it to the transport', async () => {
      await logger.info('hello world');

      expect(transports[0].log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('info');
      const logEntry = (transports[0].log as any).mock.calls[0][0];
      expect(logEntry).toMatchObject({
        level: 'info',
        message: 'hello world',
        traceId: 'test-trace-id',
      });
    });

    it('should correctly merge a metadata object with a log message', async () => {
      await logger.info({ userId: 123, component: 'auth' }, 'user logged in');

      expect(transports[0].log).toHaveBeenCalledOnce();
      const logEntry = (transports[0].log as any).mock.calls[0][0];
      expect(logEntry).toMatchObject({
        level: 'info',
        message: 'user logged in',
        userId: 123,
        component: 'auth',
      });
    });
  });

  describe('Processing Pipeline', () => {
    it('should call the serializer and masker in the correct order', async () => {
      const logData = { user: { id: 1, password: 'password123' } };
      await logger.info(logData);

      expect(mockSerializationManager.serialize).toHaveBeenCalledOnce();
      expect(mockMasker.process).toHaveBeenCalledOnce();

      const serializerCallOrder = (mockSerializationManager.serialize as any).mock.invocationCallOrder[0];
      const maskerCallOrder = (mockMasker.process as any).mock.invocationCallOrder[0];
      const transportCallOrder = (transports[0].log as any).mock.invocationCallOrder[0];

      expect(serializerCallOrder).toBeLessThan(maskerCallOrder);
      expect(maskerCallOrder).toBeLessThan(transportCallOrder);
    });
  });

  describe('Log Level Filtering', () => {
    it('should not log messages below the current level', async () => {
      logger.level = 'warn';
      await logger.info('should be ignored');
      expect(transports[0].log).not.toHaveBeenCalled();
    });

    it('should respect the log level of individual transports', async () => {
      const infoTransport = createMockTransport({ level: 'info', name: 'info-only' });
      const errorTransport = createMockTransport({ level: 'error', name: 'error-only' });

      const localLogger = new Logger('multi-transport', [infoTransport, errorTransport], dependencies);
      localLogger.level = 'info';

      await localLogger.info('test info message');

      expect(infoTransport.log).toHaveBeenCalledOnce();
      expect(errorTransport.log).not.toHaveBeenCalled();

      vi.clearAllMocks();

      await localLogger.error('test error message');

      expect(infoTransport.log).toHaveBeenCalledOnce();
      expect(errorTransport.log).toHaveBeenCalledOnce();
    });
  });

  describe('Child Loggers', () => {
    it('should create a child logger with inherited properties', () => {
      const child = logger.child({ component: 'database' });
      expect(child).toBeInstanceOf(Logger);
      expect(child.level).toBe(logger.level);
    });

    it('child logger should include parent context', async () => {
      const parentLogger = new Logger(
        'parent-logger',
        transports,
        dependencies,
        { bindings: { serviceName: 'parent' } }
      );
      parentLogger.level = 'info';

      mockContextManager.getFilteredContext = vi.fn().mockReturnValue({
        traceId: 'test-trace-id',
        loggerName: 'parent',
        component: 'database',
      });

      const child = parentLogger.child({ component: 'database' });
      await child.info({ query: 'SELECT *' }, 'Query executed');

      expect(transports[0].log).toHaveBeenCalledOnce();
      const logEntry = (transports[0].log as any).mock.calls[0][0];

      expect(logEntry).toMatchObject({
        loggerName: 'parent',
        component: 'database',
        query: 'SELECT *',
      });
    });
  });
});