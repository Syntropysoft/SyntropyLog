/**
 * FILE: tests/logger/retentionBridge.test.ts
 * DESCRIPTION: The bridge — retention is decided per record and enforced per container, so the
 * entry must carry (a) the class name, as a low-cardinality string every downstream mechanism
 * can route on, and (b) the end of the mandatory window, materialized so a sweep is a range
 * scan. The rules object is opt-in, for consumers that cannot resolve a name themselves.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SyntropyLog,
  defineRetentionPolicies,
  retentionUntil,
} from '../../src/index';
import { SpyTransport } from '../../src/logger/transports/SpyTransport';

const POLICIES = defineRetentionPolicies({
  OPERACIONES: { years: 6, standard: 'BCRA A7724 9.1' },
  EFIMERO: { ttl: 86_400 },
});

const entriesOf = (spy: SpyTransport) =>
  (spy as unknown as { entries: Record<string, unknown>[] }).entries;

describe('Retention as a declarative bridge', () => {
  let syntropyLog: SyntropyLog;
  let spy: SpyTransport;

  beforeEach(() => {
    SyntropyLog.resetInstance();
    syntropyLog = SyntropyLog.getInstance();
    spy = new SpyTransport();
  });

  afterEach(async () => {
    if (syntropyLog.getState() === 'READY') await syntropyLog.shutdown();
    SyntropyLog.resetInstance();
  });

  const init = (retention?: Record<string, unknown>) =>
    syntropyLog.init({
      logger: {
        serviceName: 'bridge-test',
        level: 'info',
        transports: { default: [spy] },
      },
      retentionPolicies: POLICIES,
      ...(retention ? { retention } : {}),
    });

  const emit = async (policy: string, message: string) => {
    await syntropyLog.getLogger().withRetention(policy).info(message);
    return entriesOf(spy).find((e) => e.message === message);
  };

  it('puts the class name on the entry as a string, not the rules object', async () => {
    await init();
    const entry = await emit('OPERACIONES', 'tagged');

    expect(entry?.retention).toBe('OPERACIONES');
    expect(typeof entry?.retention).toBe('string');
    // The rules are not on the entry by default: an in-process consumer resolves them.
    expect(entry?.retentionRules).toBeUndefined();
  });

  it('materializes the end of the mandatory window as a scalar', async () => {
    await init();
    const before = new Date();
    const entry = await emit('OPERACIONES', 'until');

    const until = new Date(entry?.retentionUntil as string);
    expect(until.getUTCFullYear()).toBe(before.getUTCFullYear() + 6);
  });

  it('emits the rules, stamped with the policy version, when asked', async () => {
    await init({ emitRules: true, version: 'E6-1' });
    const entry = await emit('OPERACIONES', 'rules');

    expect(entry?.retention).toBe('OPERACIONES');
    expect(entry?.retentionRules).toEqual({
      years: 6,
      standard: 'BCRA A7724 9.1',
      policyVersion: 'E6-1',
    });
  });

  it('omits retentionUntil for a policy with no whole years — never guesses', async () => {
    await init();
    const entry = await emit('EFIMERO', 'no-years');

    expect(entry?.retention).toBe('EFIMERO');
    expect(entry?.retentionUntil).toBeUndefined();
  });

  it('keeps `retention` a string even for inline rules (no mapping conflict downstream)', async () => {
    await init();
    await syntropyLog
      .getLogger()
      .withRetention({ years: 2, policy: 'ad-hoc' })
      .info('inline');
    const entry = entriesOf(spy).find((e) => e.message === 'inline');

    expect(entry?.retention).toBeUndefined();
    expect(entry?.retentionRules).toEqual({ years: 2, policy: 'ad-hoc' });
    // Inline rules still get a window: the years are right there.
    expect(entry?.retentionUntil).toBeTruthy();
  });

  it('leaves untagged entries untouched', async () => {
    await init();
    await syntropyLog.getLogger().info('plain');
    const entry = entriesOf(spy).find((e) => e.message === 'plain');

    expect(entry?.retention).toBeUndefined();
    expect(entry?.retentionUntil).toBeUndefined();
  });

  describe('getRetentionUntil(name, at) — the same computation for the domain path', () => {
    it('resolves the policy and returns the end of the window', async () => {
      await init();
      const at = new Date('2026-08-20T12:00:00.000Z');

      expect(syntropyLog.getRetentionUntil('OPERACIONES', at)).toEqual(
        new Date('2032-08-20T12:00:00.000Z')
      );
    });

    it('returns null when the policy declares no usable years', async () => {
      await init();
      expect(syntropyLog.getRetentionUntil('EFIMERO', new Date())).toBeNull();
    });

    it('throws on an unknown policy, like every other resolution path', async () => {
      await init();
      expect(() => syntropyLog.getRetentionUntil('NOPE', new Date())).toThrow();
    });
  });

  describe('retentionUntil(at, years) — the pure helper', () => {
    it('keeps a leap-day record one day longer, never one day short', () => {
      const until = retentionUntil(new Date('2024-02-29T00:00:00.000Z'), 6);
      // 29-Feb + 6y lands in a non-leap year: 1-Mar, i.e. the window ends later.
      expect(until?.toISOString()).toBe('2030-03-01T00:00:00.000Z');
    });

    it('rejects anything that would put a wrong date in a compliance column', () => {
      expect(
        retentionUntil(new Date('2026-01-01T00:00:00.000Z'), 0)
      ).toBeNull();
      expect(
        retentionUntil(new Date('2026-01-01T00:00:00.000Z'), -1)
      ).toBeNull();
      expect(
        retentionUntil(new Date('2026-01-01T00:00:00.000Z'), 1.5)
      ).toBeNull();
      expect(retentionUntil(new Date('nope'), 6)).toBeNull();
    });
  });
});
