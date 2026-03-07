/**
 * Tests for config schema validators (pure predicates and Zod custom messages).
 */
import { describe, it, expect } from 'vitest';
import { syntropyLogConfigSchema } from '../../src/config.schema';

describe('config.schema', () => {
  it('should export the main config schema', () => {
    expect(syntropyLogConfigSchema).toBeDefined();
    expect(typeof syntropyLogConfigSchema.parse).toBe('function');
  });
});
