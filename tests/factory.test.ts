import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSyntropyLog,
  SyntropyLog,
  SpyTransport,
  syntropyLog as globalSyntropyLog,
} from '../src/index';
import type { ISyntropyLog } from '../src/index';

/**
 * Tests for the `createSyntropyLog()` factory introduced in Phase 2A.
 *
 * The contract this suite locks in:
 *
 * - Each factory call returns a fresh instance with its own EventEmitter,
 *   LifecycleManager, StatsCollector, and config.
 * - The factory return type satisfies `ISyntropyLog`.
 * - The global `syntropyLog` singleton is unaffected by factory instances
 *   (and vice versa).
 * - Independent instances can be initialized with different configs and
 *   shut down independently; one instance's failures don't propagate.
 */
describe('createSyntropyLog factory', () => {
  beforeEach(() => {
    // Reset the singleton between tests so we don't accidentally observe leaked state.
    SyntropyLog.resetInstance();
  });

  afterEach(async () => {
    // Best-effort cleanup of the singleton if any test exercised it.
    if (SyntropyLog.getInstance().getState() === 'READY') {
      await SyntropyLog.getInstance().shutdown();
    }
    SyntropyLog.resetInstance();
  });

  describe('basic shape', () => {
    it('starts in NOT_INITIALIZED state', () => {
      const sl = createSyntropyLog();
      expect(sl.getState()).toBe('NOT_INITIALIZED');
    });

    it('reports zeroed stats before init() resolves', () => {
      const sl = createSyntropyLog();
      const stats = sl.getStats();
      expect(stats.state).toBe('NOT_INITIALIZED');
      expect(stats.initializedAt).toBeNull();
      expect(stats.uptimeMs).toBe(0);
      expect(stats.failures.log).toBe(0);
    });

    it('end-to-end: init → getLogger → log emits with the configured service name and metadata', async () => {
      // Proves a freshly created factory instance produces real log output —
      // not just that the methods exist on the type. If init() or the pipeline
      // regressed to a no-op for non-singleton instances, this test fails.
      const spy = new SpyTransport();
      const sl: ISyntropyLog = createSyntropyLog();

      await sl.init({
        logger: {
          serviceName: 'factory-e2e',
          level: 'info',
          transports: [spy],
        },
      });

      // Discard the framework's own init banner so we assert against our log.
      spy.clear();

      sl.getLogger().info({ userId: 42 }, 'hello from factory');

      const entry = spy.getFirstEntry();
      expect(entry).toBeDefined();
      expect(entry!.level).toBe('info');
      expect(entry!.message).toBe('hello from factory');
      expect((entry as unknown as { service: string }).service).toBe(
        'factory-e2e'
      );
      expect((entry as unknown as { userId: number }).userId).toBe(42);

      await sl.shutdown();
    });
  });

  describe('independence between instances', () => {
    it('two factory instances are distinct objects with separate state', async () => {
      const a = createSyntropyLog();
      const b = createSyntropyLog();

      expect(a).not.toBe(b);
      expect(a.getState()).toBe('NOT_INITIALIZED');
      expect(b.getState()).toBe('NOT_INITIALIZED');

      await a.init({ logger: { serviceName: 'a', level: 'info' } });
      expect(a.getState()).toBe('READY');
      expect(b.getState()).toBe('NOT_INITIALIZED');

      await a.shutdown();
      expect(a.getState()).toBe('SHUTDOWN');
      expect(b.getState()).toBe('NOT_INITIALIZED');
    });

    it('event listeners on one instance do not fire on another', async () => {
      const a = createSyntropyLog();
      const b = createSyntropyLog();

      const onAReady = vi.fn();
      const onBReady = vi.fn();
      a.on('ready', onAReady);
      b.on('ready', onBReady);

      await a.init({ logger: { serviceName: 'a', level: 'info' } });

      expect(onAReady).toHaveBeenCalledTimes(1);
      expect(onBReady).not.toHaveBeenCalled();

      await a.shutdown();
    });

    it('each instance accepts its own config — service names do not leak', async () => {
      const a = createSyntropyLog();
      const b = createSyntropyLog();

      await a.init({ logger: { serviceName: 'tenant-a', level: 'info' } });
      await b.init({ logger: { serviceName: 'tenant-b', level: 'warn' } });

      expect(a.getConfig().logger?.serviceName).toBe('tenant-a');
      expect(b.getConfig().logger?.serviceName).toBe('tenant-b');
      expect(a.getConfig().logger?.level).toBe('info');
      expect(b.getConfig().logger?.level).toBe('warn');

      await a.shutdown();
      await b.shutdown();
    });

    it('hook decoration tracks stats per instance', async () => {
      const a = createSyntropyLog();
      const b = createSyntropyLog();

      await a.init({ logger: { serviceName: 'a', level: 'info' } });
      await b.init({ logger: { serviceName: 'b', level: 'info' } });

      // Fire the wrapped log-failure hook on `a` only.
      a.getConfig().onLogFailure!(new Error('a-fault'), { msg: 'x' });
      a.getConfig().onLogFailure!(new Error('a-fault'), { msg: 'x' });

      expect(a.getStats().failures.log).toBe(2);
      expect(b.getStats().failures.log).toBe(0);

      await a.shutdown();
      await b.shutdown();
    });
  });

  describe('factory vs singleton independence', () => {
    it('factory instance does not become the singleton', () => {
      const factory = createSyntropyLog();
      const singleton = SyntropyLog.getInstance();
      expect(factory).not.toBe(singleton);
      expect(factory).not.toBe(globalSyntropyLog);
    });

    it('initializing a factory instance does not affect the singleton state', async () => {
      const factory = createSyntropyLog();
      const singleton = SyntropyLog.getInstance();

      await factory.init({ logger: { serviceName: 'factory', level: 'info' } });

      expect(factory.getState()).toBe('READY');
      expect(singleton.getState()).toBe('NOT_INITIALIZED');

      await factory.shutdown();
    });

    it('shutting down a factory instance does not shut down the singleton', async () => {
      const factory = createSyntropyLog();
      const singleton = SyntropyLog.getInstance();

      await singleton.init({
        logger: { serviceName: 'singleton', level: 'info' },
      });
      await factory.init({ logger: { serviceName: 'factory', level: 'info' } });

      await factory.shutdown();

      expect(factory.getState()).toBe('SHUTDOWN');
      expect(singleton.getState()).toBe('READY');

      await singleton.shutdown();
    });
  });

  describe('error isolation', () => {
    it('user hooks on instance A are not called for events on instance B', async () => {
      const userOnLogFailureA = vi.fn();
      const userOnLogFailureB = vi.fn();

      const a = createSyntropyLog();
      const b = createSyntropyLog();

      await a.init({
        logger: { serviceName: 'a', level: 'info' },
        onLogFailure: userOnLogFailureA,
      });
      await b.init({
        logger: { serviceName: 'b', level: 'info' },
        onLogFailure: userOnLogFailureB,
      });

      a.getConfig().onLogFailure!(new Error('a-only'), { msg: 'x' });

      expect(userOnLogFailureA).toHaveBeenCalledTimes(1);
      expect(userOnLogFailureB).not.toHaveBeenCalled();

      await a.shutdown();
      await b.shutdown();
    });
  });
});
