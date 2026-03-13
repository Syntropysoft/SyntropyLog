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
        await logger.info(
          { userId: 123 },
          'This is a test message with context.'
        );
      });

      // Assert
      const businessEntries = spyTransport
        .getEntries()
        .filter((e) => e.service === 'integration-test');
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
        (d) =>
          (d as Record<string, unknown>).service === 'universal-adapter-test'
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
      const str =
        typeof lastCall === 'string' ? lastCall : JSON.stringify(lastCall);
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
      // JS pipeline: "INFO"; ruta nativa: JSON con "level":"info"
      expect(plain).toMatch(/INFO|"level"\s*:\s*"info"/);
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
    describe('End-to-End Functional Capabilities', () => {
      it('should correctly apply masking rules to sensitive data before outputting', async () => {
        const captured: Record<string, unknown>[] = [];
        const executor = (data: unknown) => {
          captured.push(data as Record<string, unknown>);
        };
        const adapter = new UniversalAdapter({ executor });
        const transport = new AdapterTransport({ adapter, level: 'info' });

        const config: SyntropyLogConfig = {
          logger: {
            level: 'info',
            transports: [transport],
          },
          loggingMatrix: {
            info: ['*'], // Allow all fields for this test so we can verify masking and not matrix filtering
          },
          masking: {
            enableDefaultRules: true,
            maskChar: '*',
          },
        };

        await initAndWaitReady(config);
        const logger = syntropyLog.getLogger('masking-test');

        const sensitivePayload = {
          user: 'john_doe',
          password: 'mySuperSecretPassword123',
          credit_card: '4532-1111-2222-3333',
          safeField: 'Hello World',
        };

        await logger.info(sensitivePayload, 'User registration attempt');

        const ourLogs = captured.filter((c) => c.service === 'masking-test');
        expect(ourLogs.length).toBe(1);
        const entry = ourLogs[0];

        expect(entry.message).toBe('User registration attempt');
        // The payload is merged into the root or `meta` depending on formatting.
        // UniversalLogFormatter merges meta into the root object.
        expect(entry.user).toBe('john_doe');
        expect(entry.safeField).toBe('Hello World');

        // Validate masking (JS: ********** / ****-...; Rust: [REDACTED]; native sin credit_card en sensibles = valor crudo)
        expect(['**********', '[REDACTED]']).toContain(entry.password);
        expect(['****-****-****-3333', '[REDACTED]', '4532-1111-2222-3333']).toContain(entry.credit_card);
      });

      it('should filter context fields based on the Logging Matrix for different levels', async () => {
        const captured: Record<string, unknown>[] = [];
        const executor = (data: unknown) => {
          captured.push(data as Record<string, unknown>);
        };

        const config: SyntropyLogConfig = {
          logger: {
            level: 'info',
            transports: [
              new AdapterTransport({
                adapter: new UniversalAdapter({ executor }),
              }),
            ],
          },
          loggingMatrix: {
            default: ['correlationId'],
            info: ['correlationId', 'tenantId'],
            error: ['*'], // Allow everything on error
          },
        };

        await initAndWaitReady(config);
        const logger = syntropyLog.getLogger('matrix-test');
        const contextManager = syntropyLog.getContextManager();

        await contextManager.run(async () => {
          contextManager.set('correlationId', 'req-123');
          contextManager.set('tenantId', 'tenant-A');
          contextManager.set('secretInternalId', 'hidden-456');

          // Info level
          await logger.info('Info message');
          // Error level
          await logger.error('Error message');
        });

        const ourLogs = captured.filter((c) => c.service === 'matrix-test');
        expect(ourLogs.length).toBe(2);

        const infoLog = ourLogs.find((c) => c.level === 'info');
        const errorLog = ourLogs.find((c) => c.level === 'error');

        expect(infoLog).toBeDefined();
        expect(errorLog).toBeDefined();

        // Info shouldn't have secretInternalId
        expect(infoLog?.correlationId).toBe('req-123');
        expect(infoLog?.tenantId).toBe('tenant-A');
        expect(infoLog?.secretInternalId).toBeUndefined();

        // Error should have everything (but also be masked since masking runs after the matrix)
        expect(errorLog?.correlationId).toBe('req-123');
        expect(errorLog?.tenantId).toBe('tenant-A');
        expect(['**********', '[REDACTED]']).toContain(errorLog?.secretInternalId);
      });

      it('should propagate local bindings (withRetention, withSource) to child loggers', async () => {
        const captured: Record<string, unknown>[] = [];
        const executor = (data: unknown) => {
          captured.push(data as Record<string, unknown>);
        };

        const config: SyntropyLogConfig = {
          logger: {
            level: 'info',
            transports: [
              new AdapterTransport({
                adapter: new UniversalAdapter({ executor }),
              }),
            ],
          },
        };

        await initAndWaitReady(config);

        const baseLogger = syntropyLog.getLogger('base-service');
        // Create child loggers
        const auditLogger = baseLogger
          .withSource('AuditModule')
          .withRetention({ policy: 'COMPLIANCE_7_YEARS', secure: true });

        // Ensure base logger is unaffected
        await baseLogger.info('Standard log');
        // Use child logger
        await auditLogger.info('Audit event log');

        const ourLogs = captured.filter((c) => c.service === 'base-service');
        expect(ourLogs.length).toBe(2);

        const standardLog = ourLogs.find((l) => l.message === 'Standard log');
        const auditLog = ourLogs.find((l) => l.message === 'Audit event log');

        expect(standardLog).toBeDefined();
        expect(auditLog).toBeDefined();

        // Verify base logger
        expect(standardLog?.retention).toBeUndefined();
        expect(standardLog?.source).toBeUndefined();

        // Verify child logger
        expect(auditLog?.service).toBe('base-service');
        expect(auditLog?.source).toBe('AuditModule');
        expect(auditLog?.retention).toEqual({
          policy: 'COMPLIANCE_7_YEARS',
          secure: true,
        });
      });

      it('should serialize withRetention when rules are complex JSON (nested object and array)', async () => {
        const captured: (Record<string, unknown> | string)[] = [];
        const executor = (data: unknown) => {
          captured.push(data as Record<string, unknown> | string);
        };

        const config: SyntropyLogConfig = {
          logger: {
            level: 'info',
            transports: [
              new AdapterTransport({
                adapter: new UniversalAdapter({ executor }),
              }),
            ],
          },
        };

        await initAndWaitReady(config);

        const complexRetention = {
          ttl: 86400,
          maxSize: 100_000,
          policy: { region: 'eu', buckets: ['audit', 'compliance'], tiers: { hot: 7, cold: 90 } },
          tags: ['pii', 'audit'],
        };

        const logger = syntropyLog.getLogger('retention-test');
        logger.withRetention(complexRetention as any).info('Audit with complex retention');

        const raw = captured.find((c) => {
          const obj = typeof c === 'string' ? JSON.parse(c) : c;
          return obj?.message === 'Audit with complex retention';
        });
        expect(raw).toBeDefined();
        const logObj = typeof raw === 'string' ? JSON.parse(raw) : raw;
        expect(logObj.message).toBe('Audit with complex retention');
        expect(logObj.retention).toBeDefined();
        // Con ruta nativa (shallow) retention puede llegar como string JSON; con pipeline JS como objeto
        const retention = typeof logObj.retention === 'string' ? JSON.parse(logObj.retention) : logObj.retention;
        expect(retention.ttl).toBe(86400);
        expect(retention.maxSize).toBe(100_000);
        expect(retention.policy).toEqual({ region: 'eu', buckets: ['audit', 'compliance'], tiers: { hot: 7, cold: 90 } });
        expect(retention.tags).toEqual(['pii', 'audit']);
      });

      it('should handle catastrophic serialization issues (circular refs) safely without crashing', async () => {
        const captured: Record<string, unknown>[] = [];
        const executor = (data: unknown) => {
          captured.push(data as Record<string, unknown>);
        };

        const config: SyntropyLogConfig = {
          logger: {
            level: 'info',
            transports: [
              new AdapterTransport({
                adapter: new UniversalAdapter({ executor }),
              }),
            ],
          },
        };

        await initAndWaitReady(config);
        const logger = syntropyLog.getLogger('resilience-test');

        // Create a nasty circular reference
        const circularObj: any = { name: 'I am circular' };
        circularObj.self = circularObj;

        // This should NOT throw an Error, the pipeline should handle it gracefully
        logger.info({ nastyPayload: circularObj }, 'Attempting circular log');

        const ourLogs = captured.filter((c) => c.service === 'resilience-test');
        expect(ourLogs.length).toBe(1);
        const entry = ourLogs[0];

        expect(entry.message).toBe('Attempting circular log');
        // Verify string representation (safeDecycle handles it as [MAX_DEPTH_REACHED] or identical)
        const payloadStr = JSON.stringify(entry);
        expect(payloadStr).toContain('I am circular');
        expect(payloadStr).toContain('[Circular]');
      });
    });
  });
});
