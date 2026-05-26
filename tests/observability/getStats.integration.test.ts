import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyntropyLog } from '../../src/SyntropyLog';

/**
 * Integration test: ensures the LifecycleManager wraps the user-provided hooks
 * so the StatsCollector counts each fire, and the user's own callback still runs.
 *
 * This pins down the contract documented for `syntropyLog.getStats()`:
 *   - Counters increment on each hook fire.
 *   - User callbacks are not swallowed.
 */
describe('syntropyLog.getStats — hook decoration', () => {
  let syntropyLog: SyntropyLog;

  beforeEach(() => {
    SyntropyLog.resetInstance();
    syntropyLog = SyntropyLog.getInstance();
  });

  afterEach(async () => {
    if (syntropyLog.getState() === 'READY') {
      await syntropyLog.shutdown();
    }
    SyntropyLog.resetInstance();
  });

  it('reports zeroed stats before init() resolves', () => {
    const stats = syntropyLog.getStats();
    expect(stats.state).toBe('NOT_INITIALIZED');
    expect(stats.initializedAt).toBeNull();
    expect(stats.uptimeMs).toBe(0);
    expect(stats.nativeAddonActive).toBe(false);
    expect(stats.failures.log).toBe(0);
    expect(stats.failures.transport).toBe(0);
  });

  it('stamps initializedAt after init() resolves and state goes READY', async () => {
    await syntropyLog.init({
      logger: { serviceName: 'stats-test', level: 'info' },
    });

    const stats = syntropyLog.getStats();
    expect(stats.state).toBe('READY');
    expect(stats.initializedAt).not.toBeNull();
    expect(typeof stats.initializedAt).toBe('number');
    expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it('increments failures.log and still calls the user onLogFailure', async () => {
    const userHook = vi.fn();
    await syntropyLog.init({
      logger: { serviceName: 'stats-test', level: 'info' },
      onLogFailure: userHook,
    });

    // Pull the wrapped hook out of the stored config and fire it,
    // simulating what the Logger does on a failed log.
    const wrapped = syntropyLog.getConfig().onLogFailure;
    expect(wrapped).toBeTypeOf('function');
    wrapped!(new Error('boom'), { msg: 'x' });

    expect(userHook).toHaveBeenCalledTimes(1);
    expect(userHook).toHaveBeenCalledWith(expect.any(Error), { msg: 'x' });
    expect(syntropyLog.getStats().failures.log).toBe(1);
  });

  it('increments failures.transport and still calls the user onTransportError with context', async () => {
    const userHook = vi.fn();
    await syntropyLog.init({
      logger: { serviceName: 'stats-test', level: 'info' },
      onTransportError: userHook,
    });

    const wrapped = syntropyLog.getConfig().onTransportError;
    wrapped!(new Error('flush failed'), 'flush');

    expect(userHook).toHaveBeenCalledWith(expect.any(Error), 'flush');
    expect(syntropyLog.getStats().failures.transport).toBe(1);
  });

  it('increments failures.serializationFallback and forwards the reason', async () => {
    const userHook = vi.fn();
    await syntropyLog.init({
      logger: { serviceName: 'stats-test', level: 'info' },
      onSerializationFallback: userHook,
    });

    const wrapped = syntropyLog.getConfig().onSerializationFallback;
    wrapped!('native-disabled');
    wrapped!('native-disabled');

    expect(userHook).toHaveBeenCalledTimes(2);
    expect(userHook).toHaveBeenLastCalledWith('native-disabled');
    expect(syntropyLog.getStats().failures.serializationFallback).toBe(2);
  });

  it('groups step errors by step name and still calls user onStepError', async () => {
    const userHook = vi.fn();
    await syntropyLog.init({
      logger: { serviceName: 'stats-test', level: 'info' },
      onStepError: userHook,
    });

    const wrapped = syntropyLog.getConfig().onStepError;
    wrapped!('hygiene', new Error('a'));
    wrapped!('hygiene', new Error('b'));
    wrapped!('sanitization', new Error('c'));

    expect(userHook).toHaveBeenCalledTimes(3);
    expect(syntropyLog.getStats().failures.step).toEqual({
      hygiene: 2,
      sanitization: 1,
    });
  });

  it('increments failures.masking and still calls user masking.onMaskingError', async () => {
    const userHook = vi.fn();
    await syntropyLog.init({
      logger: { serviceName: 'stats-test', level: 'info' },
      masking: { onMaskingError: userHook },
    });

    const wrapped = syntropyLog.getConfig().masking?.onMaskingError;
    wrapped!(new Error('regex timeout'));

    expect(userHook).toHaveBeenCalledTimes(1);
    expect(syntropyLog.getStats().failures.masking).toBe(1);
  });

  it('works with no user hooks provided (decorated hooks are still installed)', async () => {
    await syntropyLog.init({
      logger: { serviceName: 'stats-test', level: 'info' },
    });

    const wrapped = syntropyLog.getConfig().onLogFailure;
    expect(wrapped).toBeTypeOf('function');
    expect(() => wrapped!(new Error('boom'))).not.toThrow();
    expect(syntropyLog.getStats().failures.log).toBe(1);
  });
});
