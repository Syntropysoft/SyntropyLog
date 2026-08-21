/**
 * FILE: tests/logger/withMeta.test.ts
 * DESCRIPTION: `withMeta(field, payload)` — the freeform metadata carrier, kept apart from
 * retention. The field name is explicit because the framework owns `retention` (the class
 * name) and `retentionUntil`; business metadata lands wherever the caller says, and never
 * opts an entry into the durable path by accident.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SyntropyLog, ReservedMetaFieldError } from '../../src/index';
import { SpyTransport } from '../../src/logger/transports/SpyTransport';

const entriesOf = (spy: SpyTransport) =>
  (spy as unknown as { entries: Record<string, unknown>[] }).entries;

describe('withMeta', () => {
  let syntropyLog: SyntropyLog;
  let spy: SpyTransport;

  beforeEach(async () => {
    SyntropyLog.resetInstance();
    syntropyLog = SyntropyLog.getInstance();
    spy = new SpyTransport();
    await syntropyLog.init({
      logger: {
        serviceName: 'meta-test',
        level: 'info',
        transports: { default: [spy] },
      },
    });
  });

  afterEach(async () => {
    if (syntropyLog.getState() === 'READY') await syntropyLog.shutdown();
    SyntropyLog.resetInstance();
  });

  const emit = async (build: () => void, message: string) => {
    build();
    return entriesOf(spy).find((e) => e.message === message);
  };

  it('binds the payload under the field the caller names', async () => {
    const entry = await emit(
      () =>
        syntropyLog
          .getLogger()
          .withMeta('tenant_ctx', { tenant: 'acme', region: 'eu-west' })
          .info('named'),
      'named'
    );

    expect(entry?.tenant_ctx).toEqual({ tenant: 'acme', region: 'eu-west' });
    // The framework's retention fields stay untouched: naming the field is what keeps
    // business metadata out of the durable path.
    expect(entry?.retention).toBeUndefined();
    expect(entry?.retentionUntil).toBeUndefined();
  });

  it('returns a new logger — chains stay independent', () => {
    const base = syntropyLog.getLogger();
    const tagged = base.withMeta('routing', { destination: 's3-cold' });

    expect(tagged).not.toBe(base);
  });

  it.each(['level', 'message', 'timestamp', 'service'])(
    'refuses to shadow the framework-owned field %s',
    (field) => {
      expect(() =>
        syntropyLog.getLogger().withMeta(field, { anything: true })
      ).toThrow(ReservedMetaFieldError);
    }
  );

  it('refuses an empty field name, and says what to pass instead', () => {
    try {
      syntropyLog.getLogger().withMeta('', { anything: true });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ReservedMetaFieldError);
      const e = err as ReservedMetaFieldError;
      expect(e.field).toBe('');
      expect(e.message).toContain("withMeta('myField', payload)");
    }
  });

  it('reports the reserved names, sorted, on a collision', () => {
    try {
      syntropyLog.getLogger().withMeta('timestamp', { x: 1 });
      expect.fail('expected throw');
    } catch (err) {
      const e = err as ReservedMetaFieldError;
      expect(e.field).toBe('timestamp');
      expect(e.reserved).toEqual(['level', 'message', 'service', 'timestamp']);
    }
  });

  it('keeps the deprecated one-argument form working — it writes to retention', async () => {
    const entry = await emit(
      () =>
        syntropyLog
          .getLogger()
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          .withMeta({ policy: 'legacy', years: 3 })
          .info('legacy'),
      'legacy'
    );

    // Back-compat only: this is the form that conflates business metadata with the
    // retention class, which is why it is deprecated in favour of naming the field.
    expect(entry?.retention).toEqual({ policy: 'legacy', years: 3 });
  });

  it('carries an explicitly named retention field without touching the framework one', async () => {
    const entry = await emit(
      () =>
        syntropyLog
          .getLogger()
          .withMeta('retencion_bcra', { years: 6, standard: 'A7724 9.1' })
          .info('own-column'),
      'own-column'
    );

    expect(entry?.retencion_bcra).toEqual({ years: 6, standard: 'A7724 9.1' });
    expect(entry?.retention).toBeUndefined();
  });
});
