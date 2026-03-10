/**
 * FILE: tests/config/config.schema.test.ts
 * Tests for the ROP config validator — parseConfig() successes and failures.
 */
import { describe, it, expect } from 'vitest';
import {
  parseConfig,
  ConfigValidationError,
  Transport,
} from '../../src/config/config.validator';
import { MaskingStrategy } from '../../src/masking/MaskingEngine';

// Helper: valid config passes without throwing
const valid = (data: unknown) => () => parseConfig(data);

// Helper: invalid config must throw ConfigValidationError
const invalid = (data: unknown) => () => parseConfig(data);

describe('config.schema / parseConfig()', () => {
  describe('Valid configs', () => {
    it('should accept an empty config object', () => {
      expect(valid({})).not.toThrow();
    });

    it('should accept valid logger level', () => {
      expect(valid({ logger: { level: 'info' } })).not.toThrow();
    });

    it('should accept all valid log levels', () => {
      const levels = [
        'audit',
        'fatal',
        'error',
        'warn',
        'info',
        'debug',
        'trace',
        'silent',
      ];
      for (const level of levels) {
        expect(valid({ logger: { level } })).not.toThrow();
      }
    });

    it('should accept valid serializerTimeoutMs', () => {
      expect(valid({ logger: { serializerTimeoutMs: 50 } })).not.toThrow();
    });

    it('should accept valid shutdownTimeout', () => {
      expect(valid({ shutdownTimeout: 3000 })).not.toThrow();
    });

    it('should accept valid loggingMatrix config', () => {
      expect(
        valid({ loggingMatrix: { info: ['correlationId'], error: ['*'] } })
      ).not.toThrow();
    });

    it('should accept valid context config', () => {
      expect(
        valid({ context: { correlationIdHeader: 'x-request-id' } })
      ).not.toThrow();
    });

    it('should accept transport descriptors with env array', () => {
      class MockTransport extends Transport {
        async execute() {}
        log() {}
      }
      expect(
        valid({
          logger: {
            transports: [
              {
                transport: new MockTransport(),
                env: ['production', 'staging'],
              },
            ],
          },
        })
      ).not.toThrow();
    });

    it('should accept valid masking config', () => {
      expect(
        valid({
          masking: {
            enableDefaultRules: true,
            maskChar: '*',
            regexTimeoutMs: 100,
            rules: [
              { pattern: /password/i, strategy: MaskingStrategy.PASSWORD },
            ],
          },
        })
      ).not.toThrow();
    });

    it('should accept masking rule with customMask function', () => {
      expect(
        valid({
          masking: {
            rules: [
              {
                pattern: /field/i,
                strategy: MaskingStrategy.CUSTOM,
                customMask: (val: string) => `masked_${val}`,
              },
            ],
          },
        })
      ).not.toThrow();
    });

    it('should return a typed config with defaults intact', () => {
      const result = parseConfig({ logger: { level: 'debug' } });
      expect(result.logger?.level).toBe('debug');
    });
  });

  describe('Invalid configs — ConfigValidationError thrown', () => {
    it('should reject invalid log level', () => {
      expect(invalid({ logger: { level: 'verbose' } })).toThrow(
        ConfigValidationError
      );
    });

    it('should include a descriptive message for invalid level', () => {
      try {
        parseConfig({ logger: { level: 'verbose' } });
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigValidationError);
        expect((e as ConfigValidationError).issues.length).toBeGreaterThan(0);
        expect((e as ConfigValidationError).message).toContain(
          'Configuration validation failed'
        );
      }
    });

    it('should reject serializerTimeoutMs of 0', () => {
      expect(invalid({ logger: { serializerTimeoutMs: 0 } })).toThrow(
        ConfigValidationError
      );
    });

    it('should reject negative serializerTimeoutMs', () => {
      expect(invalid({ logger: { serializerTimeoutMs: -1 } })).toThrow(
        ConfigValidationError
      );
    });

    it('should reject shutdownTimeout of 0', () => {
      expect(invalid({ shutdownTimeout: 0 })).toThrow(ConfigValidationError);
    });

    it('should reject regexTimeoutMs of 0', () => {
      expect(invalid({ masking: { regexTimeoutMs: 0 } })).toThrow(
        ConfigValidationError
      );
    });

    it('should reject non-function customMask', () => {
      expect(
        invalid({
          masking: {
            rules: [
              {
                pattern: /field/i,
                strategy: MaskingStrategy.CUSTOM,
                customMask: 'not-a-function',
              },
            ],
          },
        })
      ).toThrow(ConfigValidationError);
    });

    it('should reject masking rule with invalid strategy', () => {
      expect(
        invalid({
          masking: {
            rules: [{ pattern: /field/i, strategy: 'invalid_strategy' }],
          },
        })
      ).toThrow(ConfigValidationError);
    });

    it('should reject non-array and non-object transports', () => {
      expect(invalid({ logger: { transports: 123 } })).toThrow(
        ConfigValidationError
      );
    });
  });
});
