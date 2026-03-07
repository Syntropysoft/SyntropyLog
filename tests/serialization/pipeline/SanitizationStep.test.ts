import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SanitizationStep } from '../../../src/serialization/pipeline/SanitizationStep';
import { DataSanitizer } from '../../../src/serialization/utils/DataSanitizer';
import { SerializationPipelineContext } from '../../../src/types';

const mockContext: SerializationPipelineContext = {
  serializationContext: {
    depth: 0,
    maxDepth: 5,
    sensitiveFields: [],
    sanitize: true,
  },
  sanitizeSensitiveData: true,
  enableMetrics: true,
  sanitizationContext: {
    sensitiveFields: [],
    redactPatterns: [],
    maxStringLength: 1000,
    enableDeepSanitization: true,
  },
};

describe('SanitizationStep', () => {
  describe('guard: sanitization disabled', () => {
    it('should return data unchanged with sanitized: false when sanitizeSensitiveData is false', async () => {
      const step = new SanitizationStep();
      const context: SerializationPipelineContext = {
        ...mockContext,
        sanitizeSensitiveData: false,
      };
      const data = { a: 1, password: 'secret' };

      const result = await step.execute(data, context);

      expect(result).toMatchObject({
        a: 1,
        password: 'secret',
        sanitized: false,
        sanitizationDuration: expect.any(Number),
      });
    });
  });

  describe('success path', () => {
    it('should sanitize data and return with sanitized: true and duration', async () => {
      const step = new SanitizationStep();
      const data = { a: 1, password: 'secret' };
      const contextWithSensitive = {
        ...mockContext,
        sanitizationContext: {
          ...mockContext.sanitizationContext,
          sensitiveFields: ['password'],
        },
      };

      const result = await step.execute(data, contextWithSensitive);

      expect(result).toMatchObject({
        a: 1,
        password: '[REDACTED]',
        sanitized: true,
        sanitizationDuration: expect.any(Number),
      });
      expect((result as any).sanitizationError).toBeUndefined();
    });

    it('should return primitives with sanitized: true when enabled', async () => {
      const step = new SanitizationStep();
      const context = { ...mockContext, sanitizeSensitiveData: true };

      expect(await step.execute(42, context)).toMatchObject({
        sanitized: true,
        sanitizationDuration: expect.any(Number),
      });
      expect(await step.execute('hello', context)).toMatchObject({
        sanitized: true,
        sanitizationDuration: expect.any(Number),
      });
    });
  });

  describe('error path (Silent Observer)', () => {
    it('should return original data with sanitized: false and sanitizationError when sanitizer throws', async () => {
      const sanitizer = {
        sanitize: vi.fn().mockImplementation(() => {
          throw new Error('Sanitizer broke');
        }),
      };
      const step = new SanitizationStep(sanitizer as unknown as DataSanitizer);
      const data = { keep: 'this' };

      const result = await step.execute(data, mockContext);

      expect(result).toMatchObject({
        keep: 'this',
        sanitized: false,
        sanitizationDuration: expect.any(Number),
        sanitizationError: 'Sanitizer broke',
      });
    });

    it('should normalize non-Error throw to string message', async () => {
      const sanitizer = {
        sanitize: vi.fn().mockImplementation(() => {
          throw 'string throw';
        }),
      };
      const step = new SanitizationStep(sanitizer as unknown as DataSanitizer);
      const data = { x: 1 };

      const result = await step.execute(data, mockContext);

      expect((result as any).sanitizationError).toBe('string throw');
      expect((result as any).sanitized).toBe(false);
    });
  });

  describe('dependency injection', () => {
    it('should use injected sanitizer when provided', async () => {
      const sanitizer = {
        sanitize: vi.fn().mockReturnValue({ injected: true }),
      };
      const step = new SanitizationStep(sanitizer as unknown as DataSanitizer);

      const result = await step.execute({ foo: 'bar' }, mockContext);

      expect(sanitizer.sanitize).toHaveBeenCalledWith(
        { foo: 'bar' },
        mockContext.sanitizationContext
      );
      expect(result).toMatchObject({ injected: true, sanitized: true });
    });
  });
});
