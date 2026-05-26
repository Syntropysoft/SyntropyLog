import './setup';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Injectable, Logger, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  createSyntropyLog,
  SpyTransport,
  type ILogger,
  type ISyntropyLog,
} from '../../src/index';
import {
  SyntropyLogModule,
  SyntropyNestLoggerService,
  InjectLogger,
} from '../../src/nestjs/index';

/**
 * End-to-end tests for the NestJS sub-package. Each test spins up a real
 * NestJS testing module configured with SyntropyLogModule.forRoot(...) and
 * a SpyTransport so we can assert against what actually got logged.
 *
 * Per testing principle: every assertion must catch a regression that
 * matters. We do NOT assert that providers exist — we exercise them and
 * assert on the captured log entries.
 */
describe('@syntropylog/nestjs — integration', () => {
  let sl: ISyntropyLog;
  let spy: SpyTransport;

  beforeEach(async () => {
    // The SpyTransport defaults to `level: 'info'`, which would filter trace/debug
    // before the entry reaches us. Configure it to capture everything so the
    // verbose→trace mapping test can observe what the service emitted.
    spy = new SpyTransport({ level: 'trace' });
    sl = createSyntropyLog();
    await sl.init({
      logger: {
        serviceName: 'nestjs-test',
        level: 'trace',
        transports: [spy],
      },
    });
  });

  afterEach(async () => {
    if (sl.getState() === 'READY') await sl.shutdown();
  });

  describe('SyntropyNestLoggerService as NestJS LoggerService', () => {
    it('routes a Nest service.log(msg) call through SyntropyLog with the right level and nestContext', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [SyntropyLogModule.forRoot({ syntropyLog: sl })],
      }).compile();

      const nestLogger = moduleRef.get(SyntropyNestLoggerService);
      spy.clear(); // drop the framework's init banner

      nestLogger.log('order processed', 'OrderService');

      const entry = spy.getLastEntry() as unknown as {
        level: string;
        message: string;
        nestContext: string;
      };
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('order processed');
      expect(entry.nestContext).toBe('OrderService');
    });

    it('maps Nest verbose → SyntropyLog trace', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [SyntropyLogModule.forRoot({ syntropyLog: sl })],
      }).compile();

      const nestLogger = moduleRef.get(SyntropyNestLoggerService);
      spy.clear();

      nestLogger.verbose('detailed trace info', 'AppCtx');

      const entry = spy.getLastEntry();
      expect(entry?.level).toBe('trace');
      expect(entry?.message).toBe('detailed trace info');
    });

    it('error(): preserves Error message and stack instead of {} (the Error-serialization regression guard)', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [SyntropyLogModule.forRoot({ syntropyLog: sl })],
      }).compile();

      const nestLogger = moduleRef.get(SyntropyNestLoggerService);
      spy.clear();

      const err = new Error('payment declined');
      nestLogger.error(err, 'PaymentService');

      const entry = spy.getLastEntry();
      expect(entry?.level).toBe('error');
      // Message must contain the actual error info, not "{\"value\":{}}".
      const serialized = String(entry?.message);
      expect(serialized).toContain('payment declined');
      expect(serialized).not.toBe('{}');
    });

    it('honors loggerName option — Nest logs route through the named SyntropyLog logger', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          SyntropyLogModule.forRoot({
            syntropyLog: sl,
            loggerName: 'nest-internal',
          }),
        ],
      }).compile();

      const nestLogger = moduleRef.get(SyntropyNestLoggerService);
      spy.clear();

      nestLogger.log('platform message', 'AppCtx');

      // The SyntropyLog logger name becomes the entry's `service` field via the framework.
      const entry = spy.getLastEntry() as unknown as { service: string };
      expect(entry.service).toBe('nest-internal');
    });
  });

  describe('@InjectLogger() with INQUIRER', () => {
    it('returns a logger pre-bound with the injecting class name as source', async () => {
      @Injectable()
      class PaymentService {
        constructor(@InjectLogger() readonly log: ILogger) {}
      }

      @Module({
        imports: [SyntropyLogModule.forRoot({ syntropyLog: sl })],
        providers: [PaymentService],
        exports: [PaymentService],
      })
      class TestModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [TestModule],
      }).compile();

      const svc = await moduleRef.resolve(PaymentService);
      spy.clear();

      svc.log.info({ orderId: 'ord_1' }, 'charged');

      const entry = spy.getLastEntry() as unknown as {
        message: string;
        source: string;
        orderId: string;
      };
      expect(entry.message).toBe('charged');
      expect(entry.source).toBe('PaymentService');
      expect(entry.orderId).toBe('ord_1');
    });

    it('different services receive different pre-bound loggers (transient scope)', async () => {
      @Injectable()
      class A {
        constructor(@InjectLogger() readonly log: ILogger) {}
      }
      @Injectable()
      class B {
        constructor(@InjectLogger() readonly log: ILogger) {}
      }

      @Module({
        imports: [SyntropyLogModule.forRoot({ syntropyLog: sl })],
        providers: [A, B],
        exports: [A, B],
      })
      class TestModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [TestModule],
      }).compile();

      const a = await moduleRef.resolve(A);
      const b = await moduleRef.resolve(B);
      spy.clear();

      a.log.info('from A');
      b.log.info('from B');

      const entries = spy.getEntries();
      const sources = entries.map(
        (e) => (e as unknown as { source: string }).source
      );
      expect(sources).toContain('A');
      expect(sources).toContain('B');
      // No leak across consumers:
      const fromA = entries.find((e) => e.message === 'from A') as unknown as {
        source: string;
      };
      const fromB = entries.find((e) => e.message === 'from B') as unknown as {
        source: string;
      };
      expect(fromA.source).toBe('A');
      expect(fromB.source).toBe('B');
    });
  });

  describe('forRoot({ syntropyLog }) — instance isolation', () => {
    it('two NestJS apps with different SyntropyLog instances do not cross-talk', async () => {
      const spyA = new SpyTransport();
      const spyB = new SpyTransport();
      const slA = createSyntropyLog();
      const slB = createSyntropyLog();
      await slA.init({
        logger: { serviceName: 'app-a', level: 'info', transports: [spyA] },
      });
      await slB.init({
        logger: { serviceName: 'app-b', level: 'info', transports: [spyB] },
      });

      const modA = await Test.createTestingModule({
        imports: [SyntropyLogModule.forRoot({ syntropyLog: slA })],
      }).compile();
      const modB = await Test.createTestingModule({
        imports: [SyntropyLogModule.forRoot({ syntropyLog: slB })],
      }).compile();

      const loggerA = modA.get(SyntropyNestLoggerService);
      const loggerB = modB.get(SyntropyNestLoggerService);
      spyA.clear();
      spyB.clear();

      loggerA.log('hello from A', 'AppA');
      loggerB.log('hello from B', 'AppB');

      const messagesA = spyA.getEntries().map((e) => e.message);
      const messagesB = spyB.getEntries().map((e) => e.message);

      expect(messagesA).toContain('hello from A');
      expect(messagesA).not.toContain('hello from B');
      expect(messagesB).toContain('hello from B');
      expect(messagesB).not.toContain('hello from A');

      await slA.shutdown();
      await slB.shutdown();
    });
  });

  describe('integration: Nest Logger() class routed through the service', () => {
    it('new Logger("ModName").log("msg") routes through SyntropyLog when the service is registered as the app-level logger', async () => {
      // The shipped service is installable as Nest's app-level LoggerService:
      // `NestFactory.create(App, { logger: serviceInstance })`. We simulate
      // that here by registering the service against Logger's static API.
      const moduleRef = await Test.createTestingModule({
        imports: [SyntropyLogModule.forRoot({ syntropyLog: sl })],
      }).compile();

      const nestLogger = moduleRef.get(SyntropyNestLoggerService);
      Logger.overrideLogger(nestLogger);
      spy.clear();

      // Real Nest usage pattern — somewhere in a service:
      const log = new Logger('CheckoutController');
      log.warn('cart abandoned');

      const entry = spy.getLastEntry() as unknown as {
        level: string;
        message: string;
        nestContext: string;
      };
      expect(entry.level).toBe('warn');
      expect(entry.message).toBe('cart abandoned');
      expect(entry.nestContext).toBe('CheckoutController');

      // Restore default for other tests.
      Logger.overrideLogger(undefined as never);
    });
  });
});
