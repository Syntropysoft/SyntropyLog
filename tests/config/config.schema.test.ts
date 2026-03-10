/**
 * Tests for config schema validators (pure predicates and valibot custom messages).
 */
import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { syntropyLogConfigSchema } from '../../src/config.schema';
import { MaskingStrategy } from '../../src/masking/MaskingEngine';

describe('config.schema', () => {
  it('should export the main config schema', () => {
    expect(syntropyLogConfigSchema).toBeDefined();
    expect(syntropyLogConfigSchema.type).toBe('object');
  });

  it('should accept an empty config object', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {});
    expect(result.success).toBe(true);
  });

  it('should accept a valid logger config with level', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      logger: { level: 'info' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid log level', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      logger: { level: 'verbose' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject serializerTimeoutMs less than 1', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      logger: { serializerTimeoutMs: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid masking config', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      masking: {
        enableDefaultRules: true,
        maskChar: '*',
        rules: [{ pattern: /password/i, strategy: MaskingStrategy.PASSWORD }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject regexTimeoutMs less than 1', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      masking: { regexTimeoutMs: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid loggingMatrix config', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      loggingMatrix: {
        info: ['correlationId', 'userId'],
        error: ['*'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid shutdownTimeout', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      shutdownTimeout: 3000,
    });
    expect(result.success).toBe(true);
  });

  it('should reject shutdownTimeout less than 1', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      shutdownTimeout: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid context config', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      context: {
        correlationIdHeader: 'x-request-id',
        transactionIdHeader: 'x-trace-id',
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept masking rule with customMask function', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      masking: {
        rules: [
          {
            pattern: /field/i,
            strategy: MaskingStrategy.CUSTOM,
            customMask: (val: string) => `masked_${val}`,
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject customMask that is not a function', () => {
    const result = v.safeParse(syntropyLogConfigSchema, {
      masking: {
        rules: [
          {
            pattern: /field/i,
            strategy: MaskingStrategy.CUSTOM,
            customMask: 'not-a-function',
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });
});
