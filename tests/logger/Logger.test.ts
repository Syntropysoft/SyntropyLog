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
import { SerializerRegistry } from '../../src/serialization/SerializerRegistry';
import { IContextManager } from '../../src/context';
import { SpyTransport } from '../../src/logger/transports/SpyTransport';
import { ILogger } from '../../src/logger';
// Mock utilities defined inline for this test
const createMockLogger = (): ILogger => ({
  debug: vi.fn() as any,
  info: vi.fn() as any,
  warn: vi.fn() as any,
  error: vi.fn() as any,
  trace: vi.fn() as any,
  fatal: vi.fn() as any,
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
});

const createMockTransport = (): Transport => ({
  log: vi.fn().mockResolvedValue(undefined),
  level: 'info',
  name: 'mock-transport',
  isLevelEnabled: vi.fn().mockReturnValue(true),
  flush: vi.fn().mockResolvedValue(undefined),
});

const createMockPipelineComponents = () => ({
  mockMasker: {
    process: vi.fn().mockImplementation((entry) => Promise.resolve(entry)),
  },
  mockSerializer: {
    process: vi.fn().mockImplementation((entry) => Promise.resolve(entry)),
  },
});

describe('Logger', () => {
  let mockMasker: Mocked<MaskingEngine>;
  let mockSerializer: Mocked<SerializerRegistry>;
  let mockContextManager: Mocked<IContextManager>;
  let mockSyntropyLog: Mocked<SyntropyLog>;
  let dependencies: LoggerDependencies;
  let transports: Mocked<Transport>[];
  let logger: Logger;

  beforeEach(() => {
    const pipelineComponents = createMockPipelineComponents();
    mockMasker = pipelineComponents.mockMasker as any;
    mockSerializer = pipelineComponents.mockSerializer as any;
    mockContextManager = createMockContextManager() as any;
    mockSyntropyLog = {
      getLogger: vi.fn().mockImplementation((name, bindings) => {
        // Return a real Logger instance for child loggers
        const childLogger = new Logger(name, transports, dependencies);
        if (bindings) {
          Object.assign(childLogger.bindings || {}, bindings);
        }
        return childLogger;
      }),
    } as unknown as Mocked<SyntropyLog>;

    dependencies = {
      maskingEngine: mockMasker,
      serializerRegistry: mockSerializer,
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

      // Verify the transport was called correctly.
      expect(transports[0].log).toHaveBeenCalledOnce();
      // Verify the correct context was requested for the "info" level.
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('info');
      const logEntry = transports[0].log.mock.calls[0][0];
      expect(logEntry).toMatchObject({
        level: 'info',
        message: 'hello world',
        traceId: 'test-trace-id', // from mocked context
      });
    });

    it('should correctly merge a metadata object with a log message', async () => {
      await logger.info({ userId: 123, component: 'auth' }, 'user logged in');

      expect(transports[0].log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('info');

      const logEntry = transports[0].log.mock.calls[0][0];
      expect(logEntry).toMatchObject({
        level: 'info',
        message: 'user logged in',
        userId: 123,
        component: 'auth',
        traceId: 'test-trace-id',
      });
    });

    it('should combine message from metadata and arguments if both are present', async () => {
      await logger.info(
        { userId: 123 }, // metadata object
        'hello %s', // message with placeholder
        'world', // format argument
      );

      expect(transports[0].log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('info');

      const logEntry = transports[0].log.mock.calls[0][0];
      expect(logEntry.message).toBe('hello world');
      expect(logEntry.userId).toBe(123);
    });

    it('should format messages with placeholders (util.format style)', async () => {
      await logger.warn('event: %s, user: %s, success: %j', 'login', 'alice', true);

      expect(transports[0].log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('warn');

      const logEntry = transports[0].log.mock.calls[0][0];
      expect(logEntry.message).toBe('event: login, user: alice, success: true');
    });
  });

  describe('Processing Pipeline', async () => {
    it('should call the serializer and masker in the correct order', async () => {
      const logData = { user: { id: 1, password: 'password123' } };
      await logger.info(logData);

      expect(transports[0].log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('info');

      // Verify that the processing methods were called
      expect(mockSerializer.process).toHaveBeenCalledOnce();
      expect(mockMasker.process).toHaveBeenCalledOnce();

      // Vitest's `vi.mock` allows us to check call order
      const serializerCallOrder =
        mockSerializer.process.mock.invocationCallOrder[0];
      const maskerCallOrder = mockMasker.process.mock.invocationCallOrder[0];
      const transportCallOrder = transports[0].log.mock.invocationCallOrder[0];

      // Serializer runs, then masker, then the transport sends the log.
      expect(serializerCallOrder).toBeLessThan(maskerCallOrder);
      expect(maskerCallOrder).toBeLessThan(transportCallOrder);
    });
  });

  describe('Log Level Filtering', () => {
    it('should not log messages below the current level', async () => {
      logger.level = 'warn'; // Set level to warn

      // This promise will resolve immediately as the log should be skipped.
      await logger.info('should be ignored');

      expect(transports[0].log).not.toHaveBeenCalled();
    });

    it('should not log messages below the transport level', async () => {
      transports[0].level = 'error';
      // Mock isLevelEnabled to return false for warn level
      transports[0].isLevelEnabled = vi.fn().mockReturnValue(false);

      await logger.warn('should be ignored by transport');

      expect(transports[0].log).not.toHaveBeenCalled();
    });

    it('should log messages at or above the logger level', async () => {
      // Logger is 'info', so it should log 'warn' and 'error'
      await Promise.all([
        logger.warn('warn message'),
        logger.error('error message'),
      ]);

      expect(transports[0].log).toHaveBeenCalledTimes(2);
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('warn');
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('error');
    });

    it('should respect the log level of individual transports', async () => {
      const infoTransport = {
        log: vi.fn(),
        level: 'info',
        name: 'info-only',
        isLevelEnabled: vi.fn().mockImplementation((level) => ['info', 'warn', 'error', 'fatal'].includes(level)),
      } as any;
      const errorTransport = {
        log: vi.fn(),
        level: 'error',
        name: 'error-only',
        isLevelEnabled: vi.fn().mockImplementation((level) => level === 'error'), // Only accept error level
      } as any;
      
      const dependencies: LoggerDependencies = {
        maskingEngine: mockMasker,
        serializerRegistry: mockSerializer,
        contextManager: mockContextManager,
        syntropyLogInstance: mockSyntropyLog,
      };

      const localLogger = new Logger('multi-transport', [infoTransport, errorTransport], dependencies);
      localLogger.level = 'info'; // Logger allows info and above

      await localLogger.info('test info message'); // should only go to infoTransport

      expect(infoTransport.log).toHaveBeenCalledOnce();
      expect(errorTransport.log).not.toHaveBeenCalled();

      vi.clearAllMocks(); // Clear mocks for the next assertion

      await localLogger.error('test error message'); // should go to both

      expect(infoTransport.log).toHaveBeenCalledTimes(1); // Called only for error (info was already called)
      expect(errorTransport.log).toHaveBeenCalledOnce(); // Called only for error
      expect(infoTransport.isLevelEnabled).toHaveBeenCalledWith('error');
      expect(errorTransport.isLevelEnabled).toHaveBeenCalledWith('error');
      expect(errorTransport.isLevelEnabled).toHaveBeenCalledWith('error');
    });

    it('should allow changing the log level dynamically', async () => {
      // Initially, info is the level, so this gets logged
      await logger.info('this should be logged');
      expect(transports[0].log).toHaveBeenCalledOnce();

      vi.clearAllMocks(); // Reset for next part of test

      // Initially, debug is lower than info, so it's ignored
      await logger.debug('this should be ignored');
      expect(transports[0].log).not.toHaveBeenCalled();

      // Change level to allow debug logs
      logger.level = 'debug';
      transports[0].level = 'debug'; // Also update the transport's level for the test

      await logger.debug('this should be logged now');
      expect(transports[0].log).toHaveBeenCalledOnce();
    });
  });

  describe('Child Loggers', () => {
    it('should create a child logger with inherited properties', () => {
      const child = logger.child({ component: 'database' });
      expect(child).toBeInstanceOf(Logger);
      expect(child.level).toBe(logger.level);
    });

    it('child logger should include parent and its own context', async () => {
      // With the new architecture, context is passed at creation time.
      // 1. Create the "parent" with its base context.
      const parentLogger = new Logger(
        'parent-logger',
        transports,
        dependencies,
        { bindings: { serviceName: 'parent' } } // Initial context for the parent
      );
      parentLogger.level = 'info';

      // 2. The mock context manager should return both contexts when asked.
      // We simulate the context inheritance for this test.
      mockContextManager.getFilteredContext = vi.fn().mockReturnValue({
        traceId: 'test-trace-id',
        loggerName: 'parent', // from parent
        component: 'database', // from child
      });

      // 3. Create a child logger which will have its own context merged.
      const child = parentLogger.child({ component: 'database' });
      await child.info({ query: 'SELECT *' }, 'Query executed');

      expect(transports[0].log).toHaveBeenCalledOnce();
      const logEntry = transports[0].log.mock.calls[0][0];

      // 4. Assert that the final log entry contains the merged context.
      expect(logEntry).toMatchObject({
        loggerName: 'parent',
        component: 'database',
        query: 'SELECT *',
        traceId: 'test-trace-id',
      });
    });

    it('child logger should overwrite parent properties if `name` is not used', async () => {
      const child = logger.child({ name: 'child-logger' });
      await child.info('test info message');

      expect(transports[0].log).toHaveBeenCalledOnce();
      const logEntry = transports[0].log.mock.calls[0][0];
      expect(logEntry.name).toBe('child-logger');
    });

    it('should create a child logger with merged bindings', () => {
      const child = logger.child({ name: 'child-logger' });
      expect(child).toBeInstanceOf(Logger);
      expect(child.level).toBe(logger.level);
      // The child should inherit the parent's configuration and add its own bindings
    });
  });
});