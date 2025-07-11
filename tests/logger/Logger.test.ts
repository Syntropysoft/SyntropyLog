/**
 * FILE: tests/logger/Logger.test.ts
 * DESCRIPTION: Unit tests for the core Logger class.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Logger, LoggerOptions } from '../../src/logger/Logger';
import { IContextManager } from '../../src/context';
import { Transport } from '../../src/logger/transports/Transport';
import { LogEntry } from '../../src/types';
import { SerializerRegistry } from '../../src/serialization/SerializerRegistry';
import { MaskingEngine } from '../../src/masking/MaskingEngine';
import { SanitizationEngine } from '../../src/sanitization/SanitizationEngine';
import { LogLevelName } from '../../src/logger/levels';

// --- Mocks ---

class MockTransport extends Transport {
  public log = vi.fn(async (entry: LogEntry): Promise<void> => {});
  constructor(level?: LogLevelName) {
    super();
    if (level) {
      this.level = level;
    }
  }
}

const mockContextManager: IContextManager = {
  getAll: vi.fn(() => ({ correlationId: 'ctx-123' })),
  get: vi.fn(),
  set: vi.fn(),
  run: vi.fn(),
  getCorrelationId: vi.fn(),
  getCorrelationIdHeaderName: vi.fn(),
  configure: vi.fn(),
  getTraceContextHeaders: vi.fn(),
};

const mockSerializerRegistry: SerializerRegistry = {
  process: vi.fn(async (meta) => ({ ...meta, serialized: true })),
} as unknown as SerializerRegistry;

const mockMaskingEngine: MaskingEngine = {
  process: vi.fn((meta) => ({ ...meta, masked: true })),
} as unknown as MaskingEngine;

const mockSanitizationEngine: SanitizationEngine =
  {} as unknown as SanitizationEngine;

// --- Tests ---

describe('Logger', () => {
  let mockTransport: MockTransport;
  let loggerOptions: LoggerOptions;

  beforeEach(() => {
    mockTransport = new MockTransport();
    loggerOptions = {
      contextManager: mockContextManager,
      transports: [mockTransport],
      level: 'trace',
      serviceName: 'test-service',
      serializerRegistry: mockSerializerRegistry,
      maskingEngine: mockMaskingEngine,
      sanitizationEngine: mockSanitizationEngine,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Core Logging', () => {
    it('should log a simple message and send it to the transport', async () => {
      const logger = new Logger(loggerOptions);
      logger.info('hello world');

      // Allow the async _log method to complete
      await vi.waitFor(() => {
        expect(mockTransport.log).toHaveBeenCalled();
      });

      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.msg).toBe('hello world');
      expect(logEntry.level).toBe('info');
      expect(logEntry.service).toBe('test-service');
      expect(logEntry.context).toEqual({ correlationId: 'ctx-123' });
    });

    it('should handle an object and a message', async () => {
      const logger = new Logger(loggerOptions);
      logger.info({ userId: 123 }, 'user logged in');

      await vi.waitFor(() => {
        expect(mockTransport.log).toHaveBeenCalled();
      });

      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.msg).toBe('user logged in');
      expect(logEntry.userId).toBe(123);
    });

    it('should merge message from metadata object', async () => {
      const logger = new Logger(loggerOptions);
      logger.info({ msg: 'message from meta' }, 'message from arg');

      await vi.waitFor(() => {
        expect(mockTransport.log).toHaveBeenCalled();
      });

      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.msg).toBe('message from meta message from arg');
    });

    it('should format messages using util.format style', async () => {
      const logger = new Logger(loggerOptions);
      logger.warn('Request failed with status %d', 404);

      await vi.waitFor(() => {
        expect(mockTransport.log).toHaveBeenCalled();
      });

      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.msg).toBe('Request failed with status 404');
    });
  });

  describe('Processing Pipeline', () => {
    it('should call serializer and masker in the correct order', async () => {
      const logger = new Logger(loggerOptions);
      const meta = { data: 'sensitive' };
      logger.info(meta, 'pipeline test');

      await vi.waitFor(() => {
        expect(mockSerializerRegistry.process).toHaveBeenCalledWith(meta, logger);
        expect(mockMaskingEngine.process).toHaveBeenCalledWith({
          ...meta,
          serialized: true,
        });
      });

      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.serialized).toBe(true);
      expect(logEntry.masked).toBe(true);
    });
  });

  describe('Log Level Filtering', () => {
    it('should not log messages below the logger level', () => {
      loggerOptions.level = 'info';
      const logger = new Logger(loggerOptions);
      logger.debug('this should not be logged');

      // It's async, but should return early, so we don't need to wait.
      expect(mockTransport.log).not.toHaveBeenCalled();
    });

    it('should log messages at or above the logger level', async () => {
      loggerOptions.level = 'warn';
      const logger = new Logger(loggerOptions);
      logger.warn('this should be logged');
      logger.error('this should also be logged');

      await vi.waitFor(() => {
        expect(mockTransport.log).toHaveBeenCalledTimes(2);
      });
    });

    it('should respect the log level of individual transports', async () => {
      const infoTransport = new MockTransport('info');
      const errorTransport = new MockTransport('error');
      loggerOptions.transports = [infoTransport, errorTransport];
      const logger = new Logger(loggerOptions);

      logger.warn('a warning');

      await vi.waitFor(() => {
        expect(infoTransport.log).toHaveBeenCalledOnce();
        expect(errorTransport.log).not.toHaveBeenCalled();
      });
    });

    it('should allow changing the log level dynamically', async () => {
      loggerOptions.level = 'fatal';
      const logger = new Logger(loggerOptions);
      logger.info('should not log');
      expect(mockTransport.log).not.toHaveBeenCalled();

      logger.setLevel('info');
      logger.info('should log now');
      await vi.waitFor(() => {
        expect(mockTransport.log).toHaveBeenCalledOnce();
      });
    });
  });

  describe('Child Loggers and Fluent API', () => {
    it('should create a child logger with merged bindings', async () => {
      loggerOptions.bindings = { parent: true };
      const parentLogger = new Logger(loggerOptions);
      const childLogger = parentLogger.child({ child: true, override: false });

      childLogger.info({ override: true }, 'test');

      await vi.waitFor(() => {
        expect(mockTransport.log).toHaveBeenCalled();
      });

      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.parent).toBe(true);
      expect(logEntry.child).toBe(true);
      expect(logEntry.override).toBe(true); // Meta from log call wins
    });

    it('should create a child logger using withSource', async () => {
      const logger = new Logger(loggerOptions);
      logger.withSource('database').error('connection failed');

      await vi.waitFor(() => {
        expect(mockTransport.log).toHaveBeenCalled();
      });

      const logEntry = mockTransport.log.mock.calls[0][0];
      expect(logEntry.source).toBe('database');
    });
  });

  describe('Asynchronous Behavior', () => {
    it('should be fire-and-forget and not wait for transports', async () => {
      let resolveTransport: (() => void) | undefined;
      const transportPromise = new Promise<void>(
        (resolve) => (resolveTransport = resolve)
      );
      mockTransport.log.mockReturnValue(transportPromise);

      const logger = new Logger(loggerOptions);
      const result = logger.info('testing fire and forget');

      // The public method should return void immediately
      expect(result).toBeUndefined();

      // Wait for the async call to the transport to happen
      await vi.waitFor(() => {
        // The transport log method should have been called, but not yet resolved
        expect(mockTransport.log).toHaveBeenCalledOnce();
      });

      // Manually resolve the transport promise to allow the test to exit cleanly
      if (resolveTransport) resolveTransport();
    });
  });
});