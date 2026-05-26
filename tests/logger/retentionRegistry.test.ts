import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SyntropyLog,
  defineRetentionPolicies,
  RetentionPolicyNotFoundError,
} from '../../src/index';

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
