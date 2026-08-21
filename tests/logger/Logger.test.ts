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
import { AdapterTransport } from '../../src/logger/transports/AdapterTransport';
import { DurableAdapterTransport } from '../../src/logger/transports/DurableAdapterTransport';
import { ConsoleTransport } from '../../src/logger/transports/ConsoleTransport';
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

const createMockTransport = (options: {
  level: LogLevel;
  name: string;
}): Transport => {
  const t = {
    log: vi.fn().mockResolvedValue(undefined),
    level: options.level,
    name: options.name,
    isLevelEnabled: vi.fn().mockImplementation((level: LogLevel) => {
      // Simple implementation for testing
      const levels: LogLevel[] = [
        'trace',
        'debug',
        'info',
        'audit',
        'warn',
        'error',
        'fatal',
      ];
      const targetIdx = levels.indexOf(options.level);
      const currentIdx = levels.indexOf(level);
      return currentIdx >= targetIdx;
    }),
    flush: vi.fn().mockResolvedValue(undefined),
  } as unknown as Transport;
  return t;
};

const createMockPipelineComponents = () => {
  const mockSerializationManager = {
    serialize: vi.fn().mockImplementation((data: any) => ({
      success: true,
      data,
      metadata: { serializer: 'test', stepDurations: {} },
    })),
    serializeDirect: vi.fn(),
  };

  mockSerializationManager.serializeDirect.mockImplementation(
    (level, message, timestamp, service, metadata) => {
      const data = { level, message, timestamp, service, ...metadata };
      return mockSerializationManager.serialize(data);
    }
  );

  return {
    mockMasker: {
      process: vi.fn().mockImplementation((entry: any) => entry),
    },
    mockSerializationManager,
  };
};

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
    mockSerializationManager =
      pipelineComponents.mockSerializationManager as any;
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
      transportPool: undefined,
    };

    transports = [
      createMockTransport({ level: 'info', name: 'test-transport-1' }),
      createMockTransport({ level: 'debug', name: 'test-transport-2' }),
    ];

    logger = new Logger('test-logger', transports, dependencies);
  });

  describe('argument routing — masking safety (footgun guard)', () => {
    const lastCall = () =>
      mockSerializationManager.serializeDirect.mock.calls.at(-1)!;

    it('routes a trailing plain object (message-first) to METADATA so it gets masked, not inlined into the message', () => {
      logger.info('User signed up', { email: 'real@x.com' });
      const [, message, , , metadata] = lastCall();
      expect(message).toBe('User signed up'); // object NOT concatenated into the message
      expect(metadata).toMatchObject({ email: 'real@x.com' }); // → goes through masking
    });

    it('keeps util.format for an Error (not promoted to metadata)', () => {
      logger.info('failed', new Error('boom'));
      const [, message] = lastCall();
      expect(message).toContain('failed');
      expect(message).toContain('boom'); // Error stays inlined as before
    });

    it('keeps printf interpolation when format args are used', () => {
      logger.info('user %s logged in', 'alice');
      const [, message] = lastCall();
      expect(message).toBe('user alice logged in');
    });

    it('still supports metadata-first calls', () => {
      logger.info({ email: 'real@x.com' }, 'signup');
      const [, message, , , metadata] = lastCall();
      expect(message).toBe('signup');
      expect(metadata).toMatchObject({ email: 'real@x.com' });
    });
  });

  describe('Logging methods', () => {
    it('should set initial level correctly', () => {
      expect(logger.level).toBe('info');
    });

    it('should format a basic log entry and pass it to the transport', () => {
      logger.info('hello world');

      expect(transports[0].log).toHaveBeenCalledOnce();
      expect(mockContextManager.getFilteredContext).toHaveBeenCalledWith(
        'info'
      );
      const logEntry = (transports[0].log as any).mock.calls[0][0];
      expect(logEntry).toMatchObject({
        level: 'info',
        message: 'hello world',
        traceId: 'test-trace-id',
      });
    });

    it('should correctly merge a metadata object with a log message', () => {
      logger.info({ userId: 123, component: 'auth' }, 'user logged in');

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
    it('should call the serializer and masker in the correct order', () => {
      const logData = { user: { id: 1, password: 'password123' } };
      logger.info(logData);

      expect(mockSerializationManager.serialize).toHaveBeenCalledOnce();
      expect(mockMasker.process).toHaveBeenCalledOnce();

      const serializerCallOrder = (mockSerializationManager.serialize as any)
        .mock.invocationCallOrder[0];
      const maskerCallOrder = (mockMasker.process as any).mock
        .invocationCallOrder[0];
      const transportCallOrder = (transports[0].log as any).mock
        .invocationCallOrder[0];

      expect(serializerCallOrder).toBeLessThan(maskerCallOrder);
      expect(maskerCallOrder).toBeLessThan(transportCallOrder);
    });
  });

  describe('Log Level Filtering', () => {
    it('should not log messages below the current level', () => {
      logger.level = 'warn';
      logger.info('should be ignored');
      expect(transports[0].log).not.toHaveBeenCalled();
    });

    it('should respect the log level of individual transports', () => {
      const infoTransport = createMockTransport({
        level: 'info',
        name: 'info-only',
      });
      const errorTransport = createMockTransport({
        level: 'error',
        name: 'error-only',
      });

      const localLogger = new Logger(
        'multi-transport',
        [infoTransport, errorTransport],
        dependencies
      );
      localLogger.level = 'info';

      localLogger.info('test info message');

      expect(infoTransport.log).toHaveBeenCalledOnce();
      expect(errorTransport.log).not.toHaveBeenCalled();

      vi.clearAllMocks();

      localLogger.error('test error message');

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

    it('child logger should include parent context', () => {
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
      child.info({ query: 'SELECT *' }, 'Query executed');

      expect(transports[0].log).toHaveBeenCalledOnce();
      const logEntry = (transports[0].log as any).mock.calls[0][0];

      expect(logEntry).toMatchObject({
        loggerName: 'parent',
        component: 'database',
        query: 'SELECT *',
      });
    });
  });

  describe('Additional Methods', () => {
    it('should log fatal messages', () => {
      logger.fatal('system crash');
      expect(transports[0].log).toHaveBeenCalledOnce();
      const logEntry = (transports[0].log as any).mock.calls[0][0];
      expect(logEntry.level).toBe('fatal');
    });

    it('should allow setting log level dynamically', () => {
      logger.setLevel('error');
      expect(logger.level).toBe('error');
    });

    it('should support withSource fluent method', () => {
      const loggerWithSource = logger.withSource('auth-module');
      expect(loggerWithSource).toBeInstanceOf(Logger);
      expect((loggerWithSource as any).bindings.source).toBe('auth-module');
    });

    it('binds inline rules under retentionRules, leaving retention free for the class name', () => {
      const rules = { days: 30 };
      const loggerWithRetention = logger.withRetention(rules as any);
      expect(loggerWithRetention).toBeInstanceOf(Logger);
      // Inline rules have no name to route on: they travel as the object alone, and
      // `retention` stays a string field on every entry the framework emits.
      expect((loggerWithRetention as any).bindings.retentionRules).toEqual(
        rules
      );
      expect((loggerWithRetention as any).bindings.retention).toBeUndefined();
    });

    it('should store retention by reference (no deep clone)', () => {
      const rules = { ttl: 3600 };
      const transport = createMockTransport({ level: 'info', name: 't1' });
      const log = new Logger('ref-test', [transport], dependencies);
      log.level = 'info';
      const child = log.withRetention(rules as any);
      child.info('first');
      rules.ttl = 7200;
      child.info('second');
      expect(transport.log).toHaveBeenCalledTimes(2);
      const secondCall = (transport.log as any).mock.calls[1][0];
      const entry =
        typeof secondCall === 'string' ? JSON.parse(secondCall) : secondCall;
      const retention =
        typeof entry?.retentionRules === 'string'
          ? JSON.parse(entry.retentionRules)
          : entry?.retentionRules;
      expect(retention?.ttl).toBe(7200);
    });

    it('should support withTransactionId fluent method', () => {
      const loggerWithTxId = logger.withTransactionId('tx-123');
      expect(loggerWithTxId).toBeInstanceOf(Logger);
      expect((loggerWithTxId as any).bindings.transactionId).toBe('tx-123');
    });
  });

  describe('override / add / remove (per-call routing)', () => {
    it('should send log only to overridden transport when override() is used', () => {
      const t1 = createMockTransport({ level: 'info', name: 't1' });
      const t2 = createMockTransport({ level: 'info', name: 't2' });
      const pool = new Map<string, Transport>([
        ['t1', t1],
        ['t2', t2],
      ]);
      const depsWithPool = { ...dependencies, transportPool: pool };
      const loggerWithPool = new Logger('test', [t1, t2], depsWithPool);
      loggerWithPool.level = 'info';

      loggerWithPool.override('t2').info('only to t2');

      expect(t2.log).toHaveBeenCalledOnce();
      expect(t1.log).not.toHaveBeenCalled();
    });

    it('should add and remove transports for next call only', () => {
      const t1 = createMockTransport({ level: 'info', name: 't1' });
      const t2 = createMockTransport({ level: 'info', name: 't2' });
      const pool = new Map<string, Transport>([
        ['t1', t1],
        ['t2', t2],
      ]);
      const depsWithPool = { ...dependencies, transportPool: pool };
      const loggerWithPool = new Logger('test', [t1, t2], depsWithPool);
      loggerWithPool.level = 'info';

      loggerWithPool.add('t2').info('first');
      expect(t1.log).toHaveBeenCalled();
      expect(t2.log).toHaveBeenCalled();
      vi.clearAllMocks();

      loggerWithPool.remove('t1').info('second');
      expect(t1.log).not.toHaveBeenCalled();
      expect(t2.log).toHaveBeenCalled();
    });
  });

  describe('audit and level bypass', () => {
    it('should log audit even when level is error (audit bypasses level filter)', () => {
      logger.level = 'error';
      logger.audit('audit event');

      expect(transports[0].log).toHaveBeenCalledOnce();
      const logEntry = (transports[0].log as any).mock.calls[0][0];
      expect(logEntry.level).toBe('audit');
    });
  });

  describe('format args (util.format)', () => {
    it('should format message with format args (message, ...args)', () => {
      logger.info('hello %s', 'world');

      expect(transports[0].log).toHaveBeenCalledOnce();
      const logEntry = (transports[0].log as any).mock.calls[0][0];
      expect(logEntry.message).toBe('hello world');
    });

    it('should format message when first arg is metadata (metadata, message, ...args)', () => {
      logger.info({ reqId: 1 }, 'status %s', 'ok');

      expect(transports[0].log).toHaveBeenCalledOnce();
      const logEntry = (transports[0].log as any).mock.calls[0][0];
      expect(logEntry.message).toBe('status ok');
      expect(logEntry.reqId).toBe(1);
    });
  });

  describe('trace level', () => {
    it('should log trace when level allows', () => {
      const traceTransport = createMockTransport({
        level: 'trace',
        name: 'trace-transport',
      });
      const traceLogger = new Logger('test', [traceTransport], dependencies);
      traceLogger.level = 'trace';

      traceLogger.trace('trace message');

      expect(traceTransport.log).toHaveBeenCalledOnce();
      const logEntry = (traceTransport.log as any).mock.calls[0][0];
      expect(logEntry.level).toBe('trace');
    });
  });

  describe('error hooks (onLogFailure, onTransportError)', () => {
    it('should call onLogFailure when serialization fails', () => {
      const onLogFailure = vi.fn();
      (mockSerializationManager.serializeDirect as any).mockImplementationOnce(
        () => {
          throw new Error('serialize failed');
        }
      );
      const loggerWithHook = new Logger('test', transports, {
        ...dependencies,
        onLogFailure,
      });
      loggerWithHook.level = 'info';

      loggerWithHook.info('msg');

      expect(onLogFailure).toHaveBeenCalledTimes(1);
      expect(onLogFailure).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('logging failed'),
          service: 'test',
        })
      );
    });

    it('should call onTransportError when transport.log throws while writing error entry', () => {
      const onTransportError = vi.fn();
      (mockSerializationManager.serializeDirect as any).mockImplementationOnce(
        () => {
          throw new Error('serialize failed');
        }
      );
      const failingTransport = createMockTransport({
        level: 'error',
        name: 'failing',
      });
      (failingTransport.log as any).mockImplementationOnce(() => {
        throw new Error('transport write failed');
      });
      const loggerWithHook = new Logger('test', [failingTransport], {
        ...dependencies,
        onTransportError,
      });
      loggerWithHook.level = 'info';

      loggerWithHook.info('msg');

      expect(onTransportError).toHaveBeenCalledWith(expect.any(Error), 'log');
    });

    it('should skip transports that do not have error level enabled when logging error entry after failure', () => {
      const onLogFailure = vi.fn();
      (mockSerializationManager.serializeDirect as any).mockImplementationOnce(
        () => {
          throw new Error('serialize failed');
        }
      );
      const errorOnlyTransport = createMockTransport({
        level: 'error',
        name: 'error-only',
      });
      const infoOnlyTransport = createMockTransport({
        level: 'info',
        name: 'info-only',
      });
      (infoOnlyTransport.isLevelEnabled as any).mockImplementation(
        (level: LogLevel) => level !== 'error'
      );
      const loggerWithHook = new Logger(
        'test',
        [infoOnlyTransport, errorOnlyTransport],
        { ...dependencies, onLogFailure }
      );
      loggerWithHook.level = 'info';

      loggerWithHook.info('msg');

      expect(onLogFailure).toHaveBeenCalledTimes(1);
      expect(errorOnlyTransport.log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('logging failed'),
        })
      );
      expect(infoOnlyTransport.log).not.toHaveBeenCalled();
    });
  });

  describe('native path — object-consuming transports (wantsObject)', () => {
    const NATIVE_LINE = JSON.stringify({
      level: 'audit',
      message: 'pago',
      service: 'test-logger',
      timestamp: '2026-08-08T00:00:00+00:00',
      retention: { years: 10, immediate: true },
      eventType: 'OrderPaid',
    });

    const makeTransport = (name: string, wantsObject: boolean) => {
      const log = vi.fn();
      const transport = {
        level: 'trace' as LogLevel,
        name,
        isLevelEnabled: () => true,
        log,
        flush: vi.fn(),
        get wantsObject() {
          return wantsObject;
        },
      } as unknown as Transport;
      return { transport, log };
    };

    const nativeResult = (line: string) =>
      ({
        serializedNative: line,
        data: null,
        serializer: 'native',
        duration: 0,
        complexity: 'low',
        sanitized: true,
        success: true,
        metadata: null,
      }) as unknown as ReturnType<
        (typeof mockSerializationManager)['serializeDirect']
      >;

    it('hands the parsed OBJECT to wantsObject transports and the STRING to the rest, parsing once', () => {
      mockSerializationManager.serializeDirect.mockReturnValueOnce(
        nativeResult(NATIVE_LINE)
      );
      const objT = makeTransport('durable', true);
      const strT = makeTransport('console', false);
      const log = new Logger(
        'test-logger',
        [objT.transport, strT.transport],
        dependencies
      );

      log.info('pago');

      // Object-consumer (durable/adapter/OTLP) receives a parsed object with retention.
      expect(objT.log).toHaveBeenCalledTimes(1);
      const objArg = objT.log.mock.calls[0][0];
      expect(typeof objArg).toBe('object');
      expect(objArg).toMatchObject({
        eventType: 'OrderPaid',
        retention: { years: 10 },
      });

      // Console-style transport keeps the fast path: the raw serialized string.
      expect(strT.log).toHaveBeenCalledTimes(1);
      expect(strT.log.mock.calls[0][0]).toBe(NATIVE_LINE);
    });

    it('falls back to the raw string when the native line is not valid JSON (never drops the log)', () => {
      mockSerializationManager.serializeDirect.mockReturnValueOnce(
        nativeResult('not-json{')
      );
      const objT = makeTransport('durable', true);
      const log = new Logger('t', [objT.transport], dependencies);

      log.info('x');

      expect(objT.log).toHaveBeenCalledTimes(1);
      expect(typeof objT.log.mock.calls[0][0]).toBe('string');
    });
  });

  describe('native path — REAL object-consuming transports (functional)', () => {
    const NATIVE_LINE = JSON.stringify({
      level: 'audit',
      message: 'pago',
      service: 'test-logger',
      timestamp: '2026-08-08T00:00:00+00:00',
      retention: { years: 10, immediate: true },
      eventType: 'OrderPaid',
    });

    const stubNative = (line: string) =>
      mockSerializationManager.serializeDirect.mockReturnValueOnce({
        serializedNative: line,
        data: null,
        serializer: 'native',
        duration: 0,
        complexity: 'low',
        sanitized: true,
        success: true,
        metadata: null,
      } as unknown as ReturnType<
        (typeof mockSerializationManager)['serializeDirect']
      >);

    it('wantsObject: real adapters are true, console is false', () => {
      expect(new AdapterTransport({ adapter: { log() {} } }).wantsObject).toBe(
        true
      );
      expect(new DurableAdapterTransport({ executor() {} }).wantsObject).toBe(
        true
      );
      expect(new ConsoleTransport().wantsObject).toBe(false);
    });

    it('a real AdapterTransport receives the parsed OBJECT on the native path, not the string', () => {
      stubNative(NATIVE_LINE);
      const received: unknown[] = [];
      const transport = new AdapterTransport({
        name: 'adapter',
        level: 'trace',
        adapter: { log: (e: unknown) => received.push(e) },
      });

      new Logger('test-logger', [transport], dependencies).info('pago');

      expect(received).toHaveLength(1);
      expect(typeof received[0]).toBe('object');
      expect(received[0]).toMatchObject({
        eventType: 'OrderPaid',
        retention: { years: 10 },
      });
    });

    it('a real DurableAdapterTransport routes by retention and its executor receives the OBJECT', async () => {
      stubNative(NATIVE_LINE);
      const seen: Array<Record<string, unknown>> = [];
      const transport = new DurableAdapterTransport({
        name: 'durable',
        level: 'trace',
        durableOnlyForRetention: true,
        flushTimeoutMs: 200,
        executor: (e: unknown) => {
          if (e && typeof e === 'object')
            seen.push(e as Record<string, unknown>);
        },
      });

      new Logger('test-logger', [transport], dependencies).info('pago');
      await transport.flush();

      const withRetention = seen.filter((e) => 'retention' in e);
      expect(withRetention).toHaveLength(1);
      expect(withRetention[0]).toMatchObject({ eventType: 'OrderPaid' });
    });

    it('parses the native line once and shares the SAME object across object-consumers', () => {
      stubNative(NATIVE_LINE);
      const a: unknown[] = [];
      const b: unknown[] = [];
      const tA = new AdapterTransport({
        name: 'a',
        level: 'trace',
        adapter: { log: (e: unknown) => a.push(e) },
      });
      const tB = new AdapterTransport({
        name: 'b',
        level: 'trace',
        adapter: { log: (e: unknown) => b.push(e) },
      });

      new Logger('test-logger', [tA, tB], dependencies).info('pago');

      expect(typeof a[0]).toBe('object');
      expect(a[0]).toBe(b[0]); // same reference → parsed once, shared across consumers
    });

    it('skips a transport not enabled for the log level (native path)', () => {
      stubNative(NATIVE_LINE);
      const received: unknown[] = [];
      const transport = new AdapterTransport({
        name: 'errors-only',
        level: 'error', // above 'info' → the info log must not reach it
        adapter: { log: (e: unknown) => received.push(e) },
      });

      new Logger('test-logger', [transport], dependencies).info('pago');

      expect(received).toHaveLength(0);
    });

    it('a real AdapterTransport falls back to the raw string when the native line is not valid JSON', () => {
      stubNative('not-json{');
      const received: unknown[] = [];
      const transport = new AdapterTransport({
        name: 'adapter',
        level: 'trace',
        adapter: { log: (e: unknown) => received.push(e) },
      });

      new Logger('test-logger', [transport], dependencies).info('x');

      // Parse failed → the adapter still gets the raw line; a log is never dropped.
      expect(received).toHaveLength(1);
      expect(typeof received[0]).toBe('string');
    });
  });
});
