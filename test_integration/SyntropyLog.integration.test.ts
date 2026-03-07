import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stripVTControlCharacters } from 'node:util';
import { syntropyLog } from '../src/SyntropyLog';
import { SpyTransport } from '../src/logger/transports/SpyTransport';
import { ConsoleTransport } from '../src/logger/transports/ConsoleTransport';
import { ColorfulConsoleTransport } from '../src/logger/transports/ColorfulConsoleTransport';
import { PrettyConsoleTransport } from '../src/logger/transports/PrettyConsoleTransport';
import { ClassicConsoleTransport } from '../src/logger/transports/ClassicConsoleTransport';
import { CompactConsoleTransport } from '../src/logger/transports/CompactConsoleTransport';
import { AdapterTransport } from '../src/logger/transports/AdapterTransport';
import { UniversalAdapter } from '../src/logger/adapters/UniversalAdapter';
import { SyntropyLogConfig } from '../src/config';

const resetSingleton = () => {
  (syntropyLog as any)._resetForTesting();
};

const initAndWaitReady = async (config: SyntropyLogConfig): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', (err) => reject(err));
    syntropyLog.init(config);
  });
};

describe('SyntropyLog Integration Tests', () => {
  beforeEach(() => {
    resetSingleton();
  });

  afterEach(async () => {
    if (syntropyLog.getState() === 'READY') {
      await syntropyLog.shutdown();
    }
  });

  describe('pipeline to SpyTransport (context propagation)', () => {
    it('should correctly propagate context to the final log message', async () => {
    const spyTransport = new SpyTransport();
    const config: SyntropyLogConfig = {
      // silent: true, // This is removed in favor of a more robust testing strategy.
      logger: {
        level: 'debug',
        transports: [spyTransport],
        serializerTimeoutMs: 1000,
      },
      // No redis/http/broker for this test to keep it focused.
    };

    await initAndWaitReady(config);

    const contextManager = syntropyLog.getContextManager();
    const logger = syntropyLog.getLogger('integration-test');
    const correlationId = `test-${Date.now()}`;

    // Clear any logs that might have been generated during initialization.
    spyTransport.clear();

    // Act
    await contextManager.run(async () => {
      contextManager.set('correlationId', correlationId);
      // Use pino-style logging: logger.info(metadata, message)
      await logger.info({ userId: 123 }, 'This is a test message with context.');
    });

    // Assert
    const businessEntries = spyTransport.getEntries().filter(e => e.service === 'integration-test');
    expect(businessEntries.length).toBe(1);
    const logObject = businessEntries[0];

    expect(logObject).toBeDefined();

    // With the check above, TypeScript knows logObject is defined, but we can be more explicit.
    if (logObject) {
      expect(logObject.level).toBe('info');
      expect(logObject.message).toBe('This is a test message with context.');
      expect(logObject.correlationId).toBe(correlationId);
      expect(logObject.userId).toBe(123);
    }
    });
  });

  describe('pipeline to UniversalAdapter', () => {
    it('should send serialized and masked entry to UniversalAdapter executor', async () => {
      const captured: unknown[] = [];
      const executor = (data: unknown) => {
        captured.push(data);
      };
      const adapter = new UniversalAdapter({ executor });
      const transport = new AdapterTransport({ adapter, level: 'info' });
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          transports: [transport],
          serializerTimeoutMs: 1000,
        },
      };

      await initAndWaitReady(config);
      const logger = syntropyLog.getLogger('universal-adapter-test');

      await logger.info({ reqId: 1 }, 'Pipeline to adapter');

      const ourEntries = captured.filter(
        (d) => (d as Record<string, unknown>).service === 'universal-adapter-test'
      );
      expect(ourEntries.length).toBe(1);
      const entry = ourEntries[0] as Record<string, unknown>;
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('Pipeline to adapter');
      expect(entry.reqId).toBe(1);
      expect(entry.service).toBe('universal-adapter-test');
      expect(entry.timestamp).toBeDefined();
    });
  });

  describe('pipeline to console transports', () => {
    it('should send pipeline output to ConsoleTransport (JSON)', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          transports: [new ConsoleTransport({ level: 'info' })],
          serializerTimeoutMs: 1000,
        },
      };

      await initAndWaitReady(config);
      const logger = syntropyLog.getLogger('console-test');
      await logger.info('ConsoleTransport message');

      expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      const lastCall = logSpy.mock.calls[logSpy.mock.calls.length - 1][0];
      const str = typeof lastCall === 'string' ? lastCall : JSON.stringify(lastCall);
      expect(str).toContain('ConsoleTransport message');
      expect(str).toContain('"level":"info"');
      logSpy.mockRestore();
    });

    it('should send pipeline output to ColorfulConsoleTransport', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          transports: [new ColorfulConsoleTransport({ level: 'info' })],
          serializerTimeoutMs: 1000,
        },
      };

      await initAndWaitReady(config);
      const logger = syntropyLog.getLogger('colorful-test');
      await logger.info('Colorful message');

      expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      const raw = String(logSpy.mock.calls[logSpy.mock.calls.length - 1][0]);
      const plain = stripVTControlCharacters(raw);
      expect(plain).toContain('Colorful message');
      expect(plain).toContain('INFO');
      logSpy.mockRestore();
    });

    it('should send pipeline output to PrettyConsoleTransport', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          transports: [new PrettyConsoleTransport({ level: 'info' })],
          serializerTimeoutMs: 1000,
        },
      };

      await initAndWaitReady(config);
      const logger = syntropyLog.getLogger('pretty-test');
      await logger.info('Pretty message');

      expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      const raw = String(logSpy.mock.calls[logSpy.mock.calls.length - 1][0]);
      const plain = stripVTControlCharacters(raw);
      expect(plain).toContain('Pretty message');
      logSpy.mockRestore();
    });

    it('should send pipeline output to ClassicConsoleTransport', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          transports: [new ClassicConsoleTransport({ level: 'info' })],
          serializerTimeoutMs: 1000,
        },
      };

      await initAndWaitReady(config);
      const logger = syntropyLog.getLogger('classic-test');
      await logger.info('Classic message');

      expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      const raw = String(logSpy.mock.calls[logSpy.mock.calls.length - 1][0]);
      const plain = stripVTControlCharacters(raw);
      expect(plain).toContain('Classic message');
      logSpy.mockRestore();
    });

    it('should send pipeline output to CompactConsoleTransport', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const config: SyntropyLogConfig = {
        logger: {
          level: 'info',
          transports: [new CompactConsoleTransport({ level: 'info' })],
          serializerTimeoutMs: 1000,
        },
      };

      await initAndWaitReady(config);
      const logger = syntropyLog.getLogger('compact-test');
      await logger.info('Compact message');

      expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      const raw = String(logSpy.mock.calls[logSpy.mock.calls.length - 1][0]);
      const plain = stripVTControlCharacters(raw);
      expect(plain).toContain('Compact message');
      logSpy.mockRestore();
    });
  });
}); 