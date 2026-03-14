/**
 * FILE: tests/masking/MaskingEngine.test.ts
 * DESCRIPTION: Unit tests for the MaskingEngine class with JSON flattening strategy.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MaskingEngine,
  MaskingEngineOptions,
  MaskingRule,
  MaskingStrategy,
} from '../../src/masking/MaskingEngine';

// Mock regex-test to avoid spawning child processes during tests
vi.mock('regex-test', () => {
  return {
    default: class MockRegexTest {
      constructor() {}
      test(regex: RegExp, input: string) {
        return Promise.resolve(regex.test(input));
      }
      cleanWorker() {}
    },
  };
});

describe('MaskingEngine', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  describe('Constructor and Options', () => {
    it('should use default options when none are provided', async () => {
      const engine = new MaskingEngine();
      const result = (await engine.process({ password: '123' })) as any;
      // Default rules should mask password
      expect(result.password).toBe('***');
    });

    it('should use a custom maskChar', async () => {
      const options: MaskingEngineOptions = {
        maskChar: '[REDACTED]',
        enableDefaultRules: false,
      };
      const engine = new MaskingEngine(options);
      const result = (await engine.process({ secret: 'value' })) as any;
      // No rules defined, so no masking should occur
      expect(result.secret).toBe('value');
    });

    it('should enable default rules by default', async () => {
      const engine = new MaskingEngine();
      const result = (await engine.process({
        password: 'secret123',
        email: 'test@example.com',
        credit_card: '4111-1111-1111-1111',
      })) as any;

      expect(result.password).toBe('*********');
      expect(result.email).toBe('t***@example.com');
      expect(result.credit_card).toBe('****-****-****-1111');
    });

    it('should disable default rules when specified', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      const result = (await engine.process({
        password: 'secret123',
        email: 'test@example.com',
      })) as any;

      expect(result.password).toBe('secret123');
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('Custom Rules', () => {
    it('should add and apply custom rules', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });

      engine.addRule({
        pattern: /api_key/i,
        strategy: MaskingStrategy.TOKEN,
        preserveLength: true,
        maskChar: '*',
      });

      const result = (await engine.process({
        api_key: 'sk_test_1234567890abcdef',
        public_key: 'pk_test_1234567890abcdef',
      })) as any;

      // Should preserve original length - first 4 chars + asterisks + last 5 chars
      expect(result.api_key).toBe('sk_t***************bcdef');
      expect(result.public_key).toBe('pk_test_1234567890abcdef');
    });

    it('should apply custom masking function', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });

      engine.addRule({
        pattern: /custom_field/i,
        strategy: MaskingStrategy.CUSTOM,
        customMask: (value: string) => `CUSTOM_${value.length}_MASK`,
      });

      const result = (await engine.process({
        custom_field: 'hello world',
        normal_field: 'unchanged',
      })) as any;

      expect(result.custom_field).toBe('CUSTOM_11_MASK');
      expect(result.normal_field).toBe('unchanged');
    });
  });

  describe('JSON Flattening Strategy', () => {
    it('should handle deeply nested objects', async () => {
      const engine = new MaskingEngine();

      const complexData = {
        user: {
          profile: {
            personal: {
              ssn: '123-45-6789',
              email: 'john@example.com',
            },
            preferences: {
              notifications: {
                email: 'alerts@example.com',
              },
            },
          },
          orders: [
            {
              payment: {
                card_number: '5555-5555-5555-5555',
              },
            },
            {
              payment: {
                card_number: '6666-6666-6666-6666',
              },
            },
          ],
        },
      };

      const result = (await engine.process(complexData)) as any;

      // Check that nested fields are masked (preserving original length)
      expect(result.user.profile.personal.ssn).toBe('***-**-6789');
      expect(result.user.profile.personal.email).toBe('j***@example.com');
      expect(result.user.profile.preferences.notifications.email).toBe(
        'a*****@example.com'
      );
      expect(result.user.orders[0].payment.card_number).toBe(
        '****-****-****-5555'
      );
      expect(result.user.orders[1].payment.card_number).toBe(
        '****-****-****-6666'
      );
    });

    it('should handle arrays with nested objects', async () => {
      const engine = new MaskingEngine();

      const data = {
        users: [
          { name: 'John', password: 'secret' },
          { name: 'Jane', password: 'secret' },
          { name: 'Bob', password: 'secret' },
        ],
      };

      const result = (await engine.process(data)) as any;

      expect(result.users[0].name).toBe('John');
      expect(result.users[0].password).toBe('******');
      expect(result.users[1].name).toBe('Jane');
      expect(result.users[1].password).toBe('******');
      expect(result.users[2].name).toBe('Bob');
      expect(result.users[2].password).toBe('******');
    });

    it('should preserve non-string values', async () => {
      const engine = new MaskingEngine();

      const data = {
        user_id: 12345,
        is_active: true,
        score: 95.5,
        tags: ['admin', 'premium'],
        metadata: null,
      };

      const result = (await engine.process(data)) as any;

      expect(result.user_id).toBe(12345);
      expect(result.is_active).toBe(true);
      expect(result.score).toBe(95.5);
      expect(result.tags).toEqual(['admin', 'premium']);
      expect(result.metadata).toBe(null);
    });
  });

  describe('Masking Strategies', () => {
    it('should apply credit card masking correctly', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });

      engine.addRule({
        pattern: /credit_card/i,
        strategy: MaskingStrategy.CREDIT_CARD,
        preserveLength: true,
      });

      const result = (await engine.process({
        credit_card: '4111-1111-1111-1111',
      })) as any;

      // Should preserve original length and format
      expect(result.credit_card).toBe('****-****-****-1111');
    });

    it('should apply SSN masking correctly', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });

      engine.addRule({
        pattern: /ssn/i,
        strategy: MaskingStrategy.SSN,
        preserveLength: true,
      });

      const result = (await engine.process({
        ssn: '123-45-6789',
      })) as any;

      // Should preserve original length and format
      expect(result.ssn).toBe('***-**-6789');
    });

    it('should apply email masking correctly', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });

      engine.addRule({
        pattern: /email/i,
        strategy: MaskingStrategy.EMAIL,
        preserveLength: true,
      });

      const result = (await engine.process({
        email: 'john.doe@example.com',
      })) as any;

      // Should preserve original length - first char + asterisks + @domain
      expect(result.email).toBe('j*******@example.com');
    });

    it('should apply phone masking correctly', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });

      engine.addRule({
        pattern: /phone/i,
        strategy: MaskingStrategy.PHONE,
        preserveLength: true,
      });

      const result = (await engine.process({
        phone: '555-123-4567',
      })) as any;

      // Should preserve original length and format
      expect(result.phone).toBe('***-***-4567');
    });

    it('should apply token masking correctly', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });

      engine.addRule({
        pattern: /token/i,
        strategy: MaskingStrategy.TOKEN,
        preserveLength: true,
      });

      const result = (await engine.process({
        token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      })) as any;

      // Should preserve original length - first 4 chars + asterisks + last 4 chars
      expect(result.token).toMatch(/^eyJh.*ssw5c$/);
    });
  });

  describe('Error Handling', () => {
    it('should return safe fallback (no raw payload) when masking fails', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });

      engine.addRule({
        pattern: /test/i,
        strategy: MaskingStrategy.CUSTOM,
        customMask: () => {
          throw new Error('Masking failed');
        },
      });

      const originalData = { test: 'value', normal: 'data' };
      const result = await engine.process(originalData);

      // Should NOT return original data: safe fallback to avoid leaking sensitive payload
      expect(result).toHaveProperty('_maskingFailed', true);
      expect(result).toHaveProperty('_maskingFailedMessage');
      expect(result._maskingFailedMessage).toContain(
        'Masking could not be applied'
      );
      expect(result).not.toHaveProperty('test');
      expect(result).not.toHaveProperty('normal');
    });

    it('should not expose any user data on masking failure (only redaction marker)', async () => {
      const onMaskingError = vi.fn();
      const engine = new MaskingEngine({
        enableDefaultRules: false,
        onMaskingError,
      });
      engine.addRule({
        pattern: /level/i,
        strategy: MaskingStrategy.CUSTOM,
        customMask: () => {
          throw new Error('Masking failed');
        },
      });

      const originalData = {
        level: 'info',
        timestamp: '2024-01-01T00:00:00Z',
        message: 'test',
        service: 'my-service',
        secret: 'sensitive',
      };
      const result = await engine.process(originalData);

      expect(result).toHaveProperty('_maskingFailed', true);
      expect(result).toHaveProperty('_maskingFailedMessage');
      expect(result._maskingFailedMessage).toContain(
        'Masking could not be applied'
      );
      // No user/meta data returned to avoid leaking sensitive content
      expect(result).not.toHaveProperty('level');
      expect(result).not.toHaveProperty('timestamp');
      expect(result).not.toHaveProperty('message');
      expect(result).not.toHaveProperty('service');
      expect(result).not.toHaveProperty('secret');
      expect(onMaskingError).toHaveBeenCalledTimes(1);
      expect(onMaskingError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle circular references gracefully', async () => {
      const engine = new MaskingEngine();

      const circular: any = { name: 'test' };
      circular.self = circular;

      const result = await engine.process(circular);

      // Should not crash and should return some result
      expect(result).toBeDefined();
    });
  });

  describe('Statistics and State', () => {
    it('should provide correct statistics', async () => {
      const engine = new MaskingEngine();

      // Process some data to initialize the engine
      await engine.process({ test: 'data' });

      const stats = engine.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.totalRules).toBeGreaterThan(0);
      expect(stats.defaultRules).toBeGreaterThan(0);
      expect(stats.customRules).toBe(0);
      expect(stats.strategies).toContain(MaskingStrategy.PASSWORD);
      expect(stats.strategies).toContain(MaskingStrategy.EMAIL);
    });

    it('should track initialization state', async () => {
      const engine = new MaskingEngine();

      expect(engine.isInitialized()).toBe(false);

      await engine.process({ test: 'data' });

      expect(engine.isInitialized()).toBe(true);
    });

    it('should shutdown correctly', () => {
      const engine = new MaskingEngine();

      engine.shutdown();

      expect(engine.isInitialized()).toBe(false);
      expect(engine.getStats().totalRules).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should handle large objects efficiently', async () => {
      const engine = new MaskingEngine();

      // Create a large object with many items but reasonable depth
      const largeObject: any = {};

      for (let i = 0; i < 100; i++) {
        largeObject[`level${i}`] = {
          password: `secret${i}`,
          email: `user${i}@example.com`,
        };
      }

      const startTime = Date.now();
      const result = (await engine.process(largeObject)) as any;
      const endTime = Date.now();

      // Should complete in reasonable time (less than 100ms)
      // Note: async overhead might increase this slightly, but should still be fast
      expect(endTime - startTime).toBeLessThan(200);

      // Should mask sensitive data
      // Should mask sensitive data (preserving original length)
      expect(result.level0.password).toBe('*******');
      expect(result.level0.email).toBe('u****@example.com');
      expect(result.level99.password).toBe('********');
      expect(result.level99.email).toBe('u*****@example.com');
    });
  });

  describe('Non-preserveLength branches', () => {
    it('should apply credit card masking without preserveLength', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /cc/i,
        strategy: MaskingStrategy.CREDIT_CARD,
        preserveLength: false,
        maskChar: '*',
      });
      const result = (await engine.process({
        cc: '4111-1111-1111-1111',
      })) as any;
      expect(result.cc).toBe('****-****-****-1111');
    });

    it('should apply SSN masking without preserveLength', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /ssn/i,
        strategy: MaskingStrategy.SSN,
        preserveLength: false,
      });
      const result = (await engine.process({ ssn: '123-45-6789' })) as any;
      expect(result.ssn).toBe('***-**-6789');
    });

    it('should apply phone masking without preserveLength', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /phone/i,
        strategy: MaskingStrategy.PHONE,
        preserveLength: false,
        maskChar: '*',
      });
      const result = (await engine.process({ phone: '555-123-4567' })) as any;
      expect(result.phone).toBe('***-***-4567');
    });

    it('should apply email masking without preserveLength', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /email/i,
        strategy: MaskingStrategy.EMAIL,
        preserveLength: false,
      });
      const result = (await engine.process({
        email: 'john@example.com',
      })) as any;
      expect(result.email).toBe('j***@example.com');
    });

    it('should mask email with single-char username (no char to preserve)', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /email/i,
        strategy: MaskingStrategy.EMAIL,
        preserveLength: true,
        maskChar: '*',
      });
      const result = (await engine.process({ email: 'a@example.com' })) as any;
      // single char username => maskChar.repeat(1)
      expect(result.email).toBe('*@example.com');
    });

    it('should mask email without @ (fallback to maskDefault)', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /email/i,
        strategy: MaskingStrategy.EMAIL,
        preserveLength: true,
        maskChar: '*',
      });
      const result = (await engine.process({ email: 'invalidemail' })) as any;
      // no @ → maskDefault with preserveLength=true → repeat(length)
      expect(result.email).toBe('************');
    });

    it('should mask short token without preserveLength (<=8 chars)', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /tok/i,
        strategy: MaskingStrategy.TOKEN,
        preserveLength: false,
        maskChar: '*',
      });
      const result = (await engine.process({ tok: 'short' })) as any;
      // short value (<=8 chars), no preserveLength → maskChar repeat(length)
      expect(result.tok).toBe('*****');
    });

    it('should mask token without preserveLength (>8 chars)', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /tok/i,
        strategy: MaskingStrategy.TOKEN,
        preserveLength: false,
        maskChar: '*',
      });
      const result = (await engine.process({
        tok: 'someLongToken1234',
      })) as any;
      // > 8 chars: first 4 + '...' + last 5 → 'some' + '...' + 'n1234'
      expect(result.tok).toBe('some...n1234');
    });

    it('should apply maskDefault without preserveLength (capped at 8 chars)', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /myfield/i,
        strategy: MaskingStrategy.EMAIL, // Triggers maskDefault via bad email (no @)
        preserveLength: false,
        maskChar: '*',
      });
      const result = (await engine.process({ myfield: 'toolongvalue' })) as any;
      // maskDefault without preserveLength → repeat(min(length, 8))
      expect(result.myfield.length).toBeLessThanOrEqual(8);
    });
  });

  describe('ReDoS Guard', () => {
    it('should skip regex test on keys longer than 256 chars', async () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      engine.addRule({
        pattern: /password/i,
        strategy: MaskingStrategy.PASSWORD,
        maskChar: '*',
      });
      const longKey = 'a'.repeat(300);
      const data: any = { [longKey]: 'should-not-be-masked' };
      const result = (await engine.process(data)) as any;
      // Key is >256 chars so regex is skipped → no masking applied
      expect(result[longKey]).toBe('should-not-be-masked');
    });
  });
});
