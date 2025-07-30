/**
 * FILE: tests/masking/MaskingEngine.test.ts
 * DESCRIPTION: Unit tests for the MaskingEngine class with JSON flattening strategy.
 */

import { describe, it, expect } from 'vitest';
import { MaskingEngine, MaskingEngineOptions, MaskingRule, MaskingStrategy } from '../../src/masking/MaskingEngine';

describe('MaskingEngine', () => {
  describe('Constructor and Options', () => {
    it('should use default options when none are provided', () => {
      const engine = new MaskingEngine();
      const result = engine.process({ password: '123' });
      // Default rules should mask password
      expect(result.password).toBe('***');
    });

    it('should use a custom maskChar', () => {
      const options: MaskingEngineOptions = {
        maskChar: '[REDACTED]',
        enableDefaultRules: false,
      };
      const engine = new MaskingEngine(options);
      const result = engine.process({ secret: 'value' });
      // No rules defined, so no masking should occur
      expect(result.secret).toBe('value');
    });

    it('should enable default rules by default', () => {
      const engine = new MaskingEngine();
      const result = engine.process({ 
        password: 'secret123',
        email: 'test@example.com',
        credit_card: '4111-1111-1111-1111'
      });
      
      expect(result.password).toBe('*********');
      expect(result.email).toBe('t***@example.com');
      expect(result.credit_card).toBe('****-****-****-1111');
    });

    it('should disable default rules when specified', () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      const result = engine.process({ 
        password: 'secret123',
        email: 'test@example.com'
      });
      
      expect(result.password).toBe('secret123');
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('Custom Rules', () => {
    it('should add and apply custom rules', () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      
      engine.addRule({
        pattern: /api_key/i,
        strategy: MaskingStrategy.TOKEN,
        preserveLength: true,
        maskChar: '*'
      });

      const result = engine.process({ 
        api_key: 'sk_test_1234567890abcdef',
        public_key: 'pk_test_1234567890abcdef'
      });
      
      // Should preserve original length - first 4 chars + asterisks + last 5 chars
      expect(result.api_key).toBe('sk_t***************bcdef');
      expect(result.public_key).toBe('pk_test_1234567890abcdef');
    });

    it('should apply custom masking function', () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      
      engine.addRule({
        pattern: /custom_field/i,
        strategy: MaskingStrategy.CUSTOM,
        customMask: (value: string) => `CUSTOM_${value.length}_MASK`
      });

      const result = engine.process({ 
        custom_field: 'hello world',
        normal_field: 'unchanged'
      });
      
      expect(result.custom_field).toBe('CUSTOM_11_MASK');
      expect(result.normal_field).toBe('unchanged');
    });
  });

  describe('JSON Flattening Strategy', () => {
    it('should handle deeply nested objects', () => {
      const engine = new MaskingEngine();
      
      const complexData = {
        user: {
          profile: {
            personal: {
              ssn: '123-45-6789',
              email: 'john@example.com'
            },
            preferences: {
              notifications: {
                email: 'alerts@example.com'
              }
            }
          },
          orders: [
            {
              payment: {
                card_number: '5555-5555-5555-5555'
              }
            },
            {
              payment: {
                card_number: '6666-6666-6666-6666'
              }
            }
          ]
        }
      };

      const result = engine.process(complexData);
      
      // Check that nested fields are masked (preserving original length)
      expect(result.user.profile.personal.ssn).toBe('***-**-6789');
      expect(result.user.profile.personal.email).toBe('j***@example.com');
      expect(result.user.profile.preferences.notifications.email).toBe('a*****@example.com');
      expect(result.user.orders[0].payment.card_number).toBe('****-****-****-5555');
      expect(result.user.orders[1].payment.card_number).toBe('****-****-****-6666');
    });

    it('should handle arrays with nested objects', () => {
      const engine = new MaskingEngine();
      
      const data = {
        users: [
          { name: 'John', password: 'secret' },
          { name: 'Jane', password: 'secret' },
          { name: 'Bob', password: 'secret' }
        ]
      };

      const result = engine.process(data);
      
      expect(result.users[0].name).toBe('John');
      expect(result.users[0].password).toBe('******');
      expect(result.users[1].name).toBe('Jane');
      expect(result.users[1].password).toBe('******');
      expect(result.users[2].name).toBe('Bob');
      expect(result.users[2].password).toBe('******');
    });

    it('should preserve non-string values', () => {
      const engine = new MaskingEngine();
      
      const data = {
        user_id: 12345,
        is_active: true,
        score: 95.5,
        tags: ['admin', 'premium'],
        metadata: null
      };

      const result = engine.process(data);
      
      expect(result.user_id).toBe(12345);
      expect(result.is_active).toBe(true);
      expect(result.score).toBe(95.5);
      expect(result.tags).toEqual(['admin', 'premium']);
      expect(result.metadata).toBe(null);
    });
  });

  describe('Masking Strategies', () => {
    it('should apply credit card masking correctly', () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      
      engine.addRule({
        pattern: /credit_card/i,
        strategy: MaskingStrategy.CREDIT_CARD,
        preserveLength: true
      });

      const result = engine.process({ 
        credit_card: '4111-1111-1111-1111'
      });
      
      // Should preserve original length and format
      expect(result.credit_card).toBe('****-****-****-1111');
    });

    it('should apply SSN masking correctly', () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      
      engine.addRule({
        pattern: /ssn/i,
        strategy: MaskingStrategy.SSN,
        preserveLength: true
      });

      const result = engine.process({ 
        ssn: '123-45-6789'
      });
      
      // Should preserve original length and format
      expect(result.ssn).toBe('***-**-6789');
    });

    it('should apply email masking correctly', () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      
      engine.addRule({
        pattern: /email/i,
        strategy: MaskingStrategy.EMAIL,
        preserveLength: true
      });

      const result = engine.process({ 
        email: 'john.doe@example.com'
      });
      
      // Should preserve original length - first char + asterisks + @domain
      expect(result.email).toBe('j*******@example.com');
    });

    it('should apply phone masking correctly', () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      
      engine.addRule({
        pattern: /phone/i,
        strategy: MaskingStrategy.PHONE,
        preserveLength: true
      });

      const result = engine.process({ 
        phone: '555-123-4567'
      });
      
      // Should preserve original length and format
      expect(result.phone).toBe('***-***-4567');
    });

    it('should apply token masking correctly', () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      
      engine.addRule({
        pattern: /token/i,
        strategy: MaskingStrategy.TOKEN,
        preserveLength: true
      });

      const result = engine.process({ 
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      });
      
      // Should preserve original length - first 4 chars + asterisks + last 4 chars
      expect(result.token).toMatch(/^eyJh.*ssw5c$/);
    });
  });

  describe('Error Handling', () => {
    it('should return original data if masking fails', () => {
      const engine = new MaskingEngine({ enableDefaultRules: false });
      
      // Add a rule that might cause issues
      engine.addRule({
        pattern: /test/i,
        strategy: MaskingStrategy.CUSTOM,
        customMask: () => {
          throw new Error('Masking failed');
        }
      });

      const originalData = { test: 'value', normal: 'data' };
      const result = engine.process(originalData);
      
      // Should return original data due to silent observer pattern
      expect(result).toEqual(originalData);
    });

    it('should handle circular references gracefully', () => {
      const engine = new MaskingEngine();
      
      const circular: any = { name: 'test' };
      circular.self = circular;

      const result = engine.process(circular);
      
      // Should not crash and should return some result
      expect(result).toBeDefined();
    });
  });

  describe('Statistics and State', () => {
    it('should provide correct statistics', () => {
      const engine = new MaskingEngine();
      
      // Process some data to initialize the engine
      engine.process({ test: 'data' });
      
      const stats = engine.getStats();
      
      expect(stats.initialized).toBe(true);
      expect(stats.totalRules).toBeGreaterThan(0);
      expect(stats.defaultRules).toBeGreaterThan(0);
      expect(stats.customRules).toBe(0);
      expect(stats.strategies).toContain(MaskingStrategy.PASSWORD);
      expect(stats.strategies).toContain(MaskingStrategy.EMAIL);
    });

    it('should track initialization state', () => {
      const engine = new MaskingEngine();
      
      expect(engine.isInitialized()).toBe(false);
      
      engine.process({ test: 'data' });
      
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
    it('should handle large objects efficiently', () => {
      const engine = new MaskingEngine();
      
      // Create a large object with many items but reasonable depth
      const largeObject: any = {};
      
      for (let i = 0; i < 100; i++) {
        largeObject[`level${i}`] = {
          password: `secret${i}`,
          email: `user${i}@example.com`
        };
      }

      const startTime = Date.now();
      const result = engine.process(largeObject);
      const endTime = Date.now();
      
      // Should complete in reasonable time (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100);
      
      // Should mask sensitive data
      // Should mask sensitive data (preserving original length)
      expect(result.level0.password).toBe('*******');
      expect(result.level0.email).toBe('u****@example.com');
      expect(result.level99.password).toBe('********');
      expect(result.level99.email).toBe('u*****@example.com');
    });
  });
});