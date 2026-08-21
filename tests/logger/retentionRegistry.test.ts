import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SyntropyLog,
  defineRetentionPolicies,
  RetentionPolicyNotFoundError,
} from '../../src/index';
import { SpyTransport } from '../../src/logger/transports/SpyTransport';

describe('Retention policy registry', () => {
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

  describe('defineRetentionPolicies', () => {
    it('returns the input unchanged at runtime', () => {
      const policies = defineRetentionPolicies({
        SOX_AUDIT_TRAIL: { years: 5 },
        GDPR_ARTICLE_17: { years: 7, subjectIdField: 'userId' },
      });
      expect(policies).toEqual({
        SOX_AUDIT_TRAIL: { years: 5 },
        GDPR_ARTICLE_17: { years: 7, subjectIdField: 'userId' },
      });
    });

    it('preserves keys as literal types for use with `keyof typeof`', () => {
      const policies = defineRetentionPolicies({
        FOO: { x: 1 },
        BAR: { y: 2 },
      });
      type PolicyName = keyof typeof policies;
      const valid: PolicyName = 'FOO';
      expect(valid).toBe('FOO');
      // @ts-expect-error 'BAZ' is not a registered key
      const invalid: PolicyName = 'BAZ';
      expect(invalid).toBe('BAZ'); // runtime is loose; compile is strict
    });
  });

  describe('withRetention(name) — string lookup', () => {
    it('binds the registered policy as the `retention` field', async () => {
      const policies = defineRetentionPolicies({
        SOX_AUDIT_TRAIL: { years: 5, region: 'us-east-1' },
      });

      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
        retentionPolicies: policies,
      });

      const log = syntropyLog.getLogger();
      // withRetention returns a new logger with the binding; we don't have a
      // direct getter for bindings, but the contract is "the rules become the
      // retention payload on every log". Two loggers with different policies
      // must be independent instances.
      const auditLog = log.withRetention('SOX_AUDIT_TRAIL');
      expect(auditLog).toBeDefined();
      expect(auditLog).not.toBe(log);
    });

    it('throws RetentionPolicyNotFoundError when the name is not registered', async () => {
      const policies = defineRetentionPolicies({
        SOX_AUDIT_TRAIL: { years: 5 },
      });

      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
        retentionPolicies: policies,
      });

      const log = syntropyLog.getLogger();
      expect(() => log.withRetention('TYPO_POLICY')).toThrow(
        RetentionPolicyNotFoundError
      );
    });

    it('error message lists what IS registered, to help the developer', async () => {
      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
        retentionPolicies: {
          SOX_AUDIT_TRAIL: { years: 5 },
          PCI_DSS_REQ_10: { years: 1 },
        },
      });

      const log = syntropyLog.getLogger();
      try {
        log.withRetention('UNKNOWN');
        expect.fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(RetentionPolicyNotFoundError);
        const e = err as RetentionPolicyNotFoundError;
        expect(e.policy).toBe('UNKNOWN');
        expect(e.available).toEqual(['PCI_DSS_REQ_10', 'SOX_AUDIT_TRAIL']);
        expect(e.message).toContain('UNKNOWN');
        expect(e.message).toContain('SOX_AUDIT_TRAIL');
        expect(e.message).toContain('PCI_DSS_REQ_10');
      }
    });

    it('error message points to the missing-config case when no registry is set', async () => {
      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
        // no retentionPolicies
      });

      const log = syntropyLog.getLogger();
      try {
        log.withRetention('ANYTHING');
        expect.fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(RetentionPolicyNotFoundError);
        const e = err as RetentionPolicyNotFoundError;
        expect(e.available).toEqual([]);
        expect(e.message).toContain('No retention policies are registered');
      }
    });
  });

  describe('withRetention(object) — inline rules', () => {
    it('accepts an inline LogRetentionRules object (existing behavior preserved)', async () => {
      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
        retentionPolicies: { SOX_AUDIT_TRAIL: { years: 5 } },
      });

      const log = syntropyLog.getLogger();
      const customLog = log.withRetention({
        ttl: 86_400,
        archiveAfter: 3_600,
        policy: 'inline',
      });
      expect(customLog).toBeDefined();
      expect(customLog).not.toBe(log);
    });

    it('works even when no registry is configured (the inline path is independent)', async () => {
      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
      });

      const log = syntropyLog.getLogger();
      expect(() =>
        log.withRetention({ ttl: 86_400, policy: 'inline' })
      ).not.toThrow();
    });
  });

  // The registry is reachable outside the logging pipeline: a consumer whose write
  // path never touches a logger (an audit journal writing straight to Postgres) must
  // be able to resolve the very policy the framework would tag with, and store it on
  // the record. See docs/DESIGN-retention-resolution-api.md.
  describe('getRetentionPolicy(name) / getRetentionPolicies() — resolution outside the logger', () => {
    it('returns the registered policy, identical to what withRetention(name) binds', async () => {
      const spy = new SpyTransport();
      await syntropyLog.init({
        logger: {
          serviceName: 'retention-test',
          level: 'info',
          transports: { default: [spy] },
        },
        retentionPolicies: {
          'Operaciones eCheq': { years: 6, standard: 'BCRA A7724 9.1' },
        },
      });

      const resolved = syntropyLog.getRetentionPolicy('Operaciones eCheq');
      expect(resolved).toEqual({ years: 6, standard: 'BCRA A7724 9.1' });

      // The entry carries the class NAME — the low-cardinality string every downstream
      // mechanism routes on. The rules are what the resolution path hands the caller to
      // persist, resolved in-process from the same frozen registry.
      await syntropyLog
        .getLogger()
        .withRetention('Operaciones eCheq')
        .info('tagged');

      const entries = (spy as unknown as { entries: Record<string, unknown>[] })
        .entries;
      const tagged = entries.find((e) => e.message === 'tagged');
      expect(tagged?.retention).toBe('Operaciones eCheq');
      expect(
        syntropyLog.getRetentionPolicy(tagged?.retention as string)
      ).toEqual(resolved);
    });

    it('throws RetentionPolicyNotFoundError on an unknown name, with the sorted available list', async () => {
      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
        retentionPolicies: {
          SOX_AUDIT_TRAIL: { years: 5 },
          PCI_DSS_REQ_10: { years: 1 },
        },
      });

      try {
        syntropyLog.getRetentionPolicy('UNKNOWN');
        expect.fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(RetentionPolicyNotFoundError);
        const e = err as RetentionPolicyNotFoundError;
        expect(e.policy).toBe('UNKNOWN');
        expect(e.available).toEqual(['PCI_DSS_REQ_10', 'SOX_AUDIT_TRAIL']);
      }
    });

    it('throws the "no policies registered" variant when no registry was configured', async () => {
      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
      });

      try {
        syntropyLog.getRetentionPolicy('ANYTHING');
        expect.fail('expected throw');
      } catch (err) {
        const e = err as RetentionPolicyNotFoundError;
        expect(e.available).toEqual([]);
        expect(e.message).toContain('No retention policies are registered');
      }
      expect(syntropyLog.getRetentionPolicies()).toEqual({});
    });

    it('lists the whole registry, frozen', async () => {
      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
        retentionPolicies: { FOO: { years: 1 }, BAR: { years: 2 } },
      });

      const registry = syntropyLog.getRetentionPolicies();
      expect(Object.keys(registry).sort()).toEqual(['BAR', 'FOO']);
      expect(Object.isFrozen(registry)).toBe(true);
      expect(() => {
        (registry as Record<string, unknown>).BAZ = { years: 3 };
      }).toThrow();
    });

    it('fails like every other ready-gated accessor when called before init()', () => {
      expect(() => syntropyLog.getRetentionPolicy('FOO')).toThrow();
      expect(() => syntropyLog.getRetentionPolicies()).toThrow();
    });

    it('ignores mutations the caller makes to its own config object after init()', async () => {
      const policies = defineRetentionPolicies({ AUDIT: { years: 6 } });
      const config = {
        logger: { serviceName: 'retention-test', level: 'info' as const },
        retentionPolicies: policies,
      };

      await syntropyLog.init(config);

      // The caller mutates the object it passed; the framework resolves against its
      // own frozen copy, so registry additions after init() are not visible.
      (config.retentionPolicies as Record<string, unknown>).LATE = {
        years: 99,
      };

      expect(() => syntropyLog.getRetentionPolicy('LATE')).toThrow(
        RetentionPolicyNotFoundError
      );
      expect(() => syntropyLog.getLogger().withRetention('LATE')).toThrow(
        RetentionPolicyNotFoundError
      );
      expect(Object.keys(syntropyLog.getRetentionPolicies())).toEqual([
        'AUDIT',
      ]);
    });

    it('returns a nested policy intact — no normalization on the resolution path', async () => {
      await syntropyLog.init({
        logger: { serviceName: 'retention-test', level: 'info' },
        retentionPolicies: {
          NESTED: { years: 6, store: { tier: 'cold', region: 'sa-east-1' } },
        },
      });

      expect(syntropyLog.getRetentionPolicy('NESTED')).toEqual({
        years: 6,
        store: { tier: 'cold', region: 'sa-east-1' },
      });
    });
  });

  describe('config validation', () => {
    it('accepts a well-formed retentionPolicies registry', async () => {
      await expect(
        syntropyLog.init({
          logger: { serviceName: 'retention-test', level: 'info' },
          retentionPolicies: {
            FOO: { years: 1 },
            BAR: { ttl: 999 },
          },
        })
      ).resolves.toBeUndefined();
    });

    it('rejects retentionPolicies whose values are not objects', async () => {
      await expect(
        syntropyLog.init({
          logger: { serviceName: 'retention-test', level: 'info' },
          // Each value must be a record; a primitive should be rejected.
          retentionPolicies: { BAD: 42 as unknown as Record<string, unknown> },
        })
      ).rejects.toThrow();
    });
  });
});
