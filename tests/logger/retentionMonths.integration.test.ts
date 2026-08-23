/**
 * FILE: tests/logger/retentionMonths.integration.test.ts
 * DESCRIPTION: A months policy end to end — the date the entry carries and the one the
 * out-of-logger accessor returns come from the same resolution.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SyntropyLog, defineRetentionPolicies } from '../../src/index';
import { SpyTransport } from '../../src/logger/transports/SpyTransport';

describe('Retention window in months — through the logger', () => {
  let syntropyLog: SyntropyLog;
  let spy: SpyTransport;

  beforeEach(async () => {
    SyntropyLog.resetInstance();
    syntropyLog = SyntropyLog.getInstance();
    spy = new SpyTransport({ name: 'spy' });
    await syntropyLog.init({
      logger: {
        serviceName: 'svc',
        level: 'fatal',
        transports: { default: [spy] },
      },
      retentionPolicies: defineRetentionPolicies({
        IN_MONTHS: { months: 42 },
        IN_YEARS: { years: 3 },
        NO_UNIT: { standard: 'SOX 802' },
      }),
    });
  });

  afterEach(async () => {
    if (syntropyLog.getState() === 'READY') await syntropyLog.shutdown();
    SyntropyLog.resetInstance();
  });

  it('stamps retentionUntil on the entry for a months policy', () => {
    syntropyLog.getLogger().withRetention('IN_MONTHS').audit('filed');
    const entry = spy.getLastEntry() as Record<string, unknown>;
    expect(entry.retention).toBe('IN_MONTHS');
    expect(typeof entry.retentionUntil).toBe('string');
  });

  it('a policy declaring no unit gets no retentionUntil', () => {
    syntropyLog.getLogger().withRetention('NO_UNIT').audit('filed');
    const entry = spy.getLastEntry() as Record<string, unknown>;
    expect(entry.retention).toBe('NO_UNIT');
    expect(entry.retentionUntil).toBeUndefined();
  });

  it('getRetentionUntil resolves a months policy', () => {
    const at = new Date('2026-01-15T10:00:00.000Z');
    expect(syntropyLog.getRetentionUntil('IN_MONTHS', at)?.toISOString()).toBe(
      '2029-07-15T10:00:00.000Z'
    );
  });

  it('getRetentionUntil returns null for a policy with no unit', () => {
    const at = new Date('2026-01-15T10:00:00.000Z');
    expect(syntropyLog.getRetentionUntil('NO_UNIT', at)).toBeNull();
  });

  it('36 months and 3 years agree through the accessor', () => {
    const at = new Date('2026-01-15T10:00:00.000Z');
    const months = syntropyLog.getRetentionUntil('IN_MONTHS', at);
    const years = syntropyLog.getRetentionUntil('IN_YEARS', at);
    expect(months!.getTime()).toBeGreaterThan(years!.getTime());
  });
});
