/**
 * FILE: tests/logger/Logger.test.ts
 * DESCRIPTION: Unit tests for the core Logger class.
 */
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { Logger, LoggerDependencies } from '../../src/logger/Logger';
import {
  Transport,
  type TransportOptions,
} from '../../src/logger/transports/Transport';
import type { LogEntry } from '../../src/types';
import { MaskingEngine } from '../../src/masking/MaskingEngine';
import { SerializerRegistry } from '../../src/serialization/SerializerRegistry';
import { IContextManager } from '../../src/context';
import { MockContextManager } from '../../src/context/MockContextManager';

// A concrete class for testing purposes that extends the abstract Transport
class SpyTransport extends Transport {
  constructor(options: TransportOptions) {
    super(options);
  }

  // The log method is what we want to spy on. We can implement it as a mock function directly.
  log = vi.fn<[LogEntry], Promise<void>>().mockResolvedValue(undefined);
}

// --- Mocks for Dependencies ---
vi.mock('../../src/masking/MaskingEngine');
vi.mock('../../src/serialization/SerializerRegistry');

describe('Logger', () => {
  let mockTransport: SpyTransport;
  let logger: Logger;
  let mockMasker: Mocked<MaskingEngine>;
  let mockSerializer: Mocked<SerializerRegistry>;
  let mockContextManager: Mocked<IContextManager>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mocks for each dependency
    mockMasker = new MaskingEngine({}) as Mocked<MaskingEngine>;
    mockMasker.process = vi.fn((obj) => Promise.resolve(obj)); // Must be async now

    mockSerializer = new SerializerRegistry({}) as Mocked<SerializerRegistry>;
    mockSerializer.process = vi.fn((obj) => obj);

    mockContextManager = new MockContextManager() as Mocked<IContextManager>;
    mockContextManager.getFilteredContext = vi
      .fn()
      .mockReturnValue({ traceId: 'test-trace-id' });

    const dependencies: LoggerDependencies = {
      maskingEngine: mockMasker,
      serializerRegistry: mockSerializer,
      contextManager: mockContextManager,
    };

    mockTransport = new SpyTransport({
      level: 'info',
      name: 'mock-transport',
    });

    // Create the Logger instance for testing with our mocked dependencies.
    logger = new Logger('test-logger', [mockTransport], dependencies);
    logger.level = 'info';
  });

  describe('Core Logging', () => {
    it('should format a basic log entry and pass it to the transport', async () => {
      await logger.info('hello world');

      // Verify the transport was called correctly.
      expect(mockTransport.log).toHaveBeenCalledOnce();
      // Verify the correct context was requested for the "info" level.
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('info');
      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry).toMatchObject({
        level: 'info',
        message: 'hello world',
        traceId: 'test-trace-id', // from mocked context
      });
    });

    it('should correctly merge a metadata object with a log message', async () => {
      await logger.info({ userId: 123, component: 'auth' }, 'user logged in');

      expect(mockTransport.log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('info');

      const logEntry = mockTransport.log.mock.calls[0][0];
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
        { message: 'hello %s' }, // this message should be overwritten
        'world',
      );

      expect(mockTransport.log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('info');

      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.message).toBe('hello world');
    });

    it('should format messages with placeholders (util.format style)', async () => {
      await logger.warn('event: %s, user: %s, success: %j', 'login', 'alice', true);

      expect(mockTransport.log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('warn');

      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.message).toBe('event: login, user: alice, success: true');
    });
  });

  describe('Processing Pipeline', async () => {
    it('should call the serializer and masker in the correct order', async () => {
      const logData = { user: { id: 1, password: 'password123' } };
      await logger.info(logData);

      expect(mockTransport.log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('info');

      // Verify that the processing methods were called
      expect(mockSerializer.process).toHaveBeenCalledOnce();
      expect(mockMasker.process).toHaveBeenCalledOnce();

      // Vitest's `vi.mock` allows us to check call order
      const serializerCallOrder =
        mockSerializer.process.mock.invocationCallOrder[0];
      const maskerCallOrder = mockMasker.process.mock.invocationCallOrder[0];
      const transportCallOrder = mockTransport.log.mock.invocationCallOrder[0];

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

      expect(mockTransport.log).not.toHaveBeenCalled();
    });

    it('should not log messages below the transport level', async () => {
      mockTransport.level = 'error';

      await logger.warn('should be ignored by transport');

      expect(mockTransport.log).not.toHaveBeenCalled();
    });

    it('should log messages at or above the logger level', async () => {
      // Logger is 'info', so it should log 'warn' and 'error'
      await Promise.all([
        logger.warn('warn message'),
        logger.error('error message'),
      ]);

      expect(mockTransport.log).toHaveBeenCalledTimes(2);
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('warn');
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith('error');
    });

    it('should respect the log level of individual transports', async () => {
      const infoTransport = new SpyTransport({
        level: 'info',
        name: 'info-only',
      });
      const errorTransport = new SpyTransport({
        level: 'error',
        name: 'error-only',
      });
      
      const dependencies: LoggerDependencies = {
        maskingEngine: mockMasker,
        serializerRegistry: mockSerializer,
        contextManager: mockContextManager,
      };

      const localLogger = new Logger('multi-transport', [infoTransport, errorTransport], dependencies);
      localLogger.level = 'info'; // Logger allows info and above

      await localLogger.info('test info message'); // should only go to infoTransport

      expect(infoTransport.log).toHaveBeenCalledOnce();
      expect(errorTransport.log).not.toHaveBeenCalled();

      vi.clearAllMocks(); // Clear mocks for the next assertion

      await localLogger.error('test error message'); // should go to both

      expect(infoTransport.log).toHaveBeenCalledOnce();
      expect(errorTransport.log).toHaveBeenCalledOnce();
    });

    it('should allow changing the log level dynamically', async () => {
      // Initially, info is the level, so this gets logged
      await logger.info('this should be logged');
      expect(mockTransport.log).toHaveBeenCalledOnce();

      vi.clearAllMocks(); // Reset for next part of test

      // Initially, debug is lower than info, so it's ignored
      await logger.debug('this should be ignored');
      expect(mockTransport.log).not.toHaveBeenCalled();

      // Change level to allow debug logs
      logger.level = 'debug';
      mockTransport.level = 'debug'; // Also update the transport's level for the test

      await logger.debug('this should be logged now');
      expect(mockTransport.log).toHaveBeenCalledOnce();
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
        [mockTransport],
        {
          maskingEngine: mockMasker,
          serializerRegistry: mockSerializer,
          contextManager: mockContextManager,
        },
        { service: 'api' }, // Initial context for the parent
      );
      parentLogger.level = 'info';

      // 2. The mock context manager should return both contexts when asked.
      // We simulate the context inheritance for this test.
      mockContextManager.getFilteredContext.mockReturnValue({
        traceId: 'test-trace-id',
        service: 'api', // from parent
        component: 'database', // from child
      });

      // 3. Create a child logger which will have its own context merged.
      // The Logger's `child` method should handle this internally now.
      const child = parentLogger.child({ component: 'database' });
      await child.info({ query: 'SELECT *' }, 'Query executed');

      expect(mockTransport.log).toHaveBeenCalledOnce();
      const logEntry = mockTransport.log.mock.calls[0][0];

      // 4. Assert that the final log entry contains the merged context.
      expect(logEntry).toMatchObject({
        service: 'api',
        component: 'database',
        query: 'SELECT *',
        traceId: 'test-trace-id',
      });
    });

    it('child logger should be able to overwrite parent properties', async () => {
      const child = logger.child({ name: 'child-logger' });
      await child.info('test info message');

      expect(mockTransport.log).toHaveBeenCalledOnce();
      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.name).toBe('child-logger');
    });
  });
});