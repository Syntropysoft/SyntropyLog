import { describe, it, expect } from 'vitest';
import { HygieneStep } from '../../../src/serialization/pipeline/HygieneStep';
import { SerializationPipelineContext } from '../../../src/types';

describe('HygieneStep', () => {
  const step = new HygieneStep();
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

  it('should return non-object data as is', async () => {
    expect(await step.execute(null, mockContext)).toBeNull();
    expect(await step.execute(123, mockContext)).toBe(123);
    expect(await step.execute('string', mockContext)).toBe('string');
    expect(await step.execute(true, mockContext)).toBe(true);
  });

  it('should handle circular references', async () => {
    const circular: any = { a: 1 };
    circular.self = circular;

    const result: any = await step.execute(circular, mockContext);
    expect(result).toBeDefined();
    expect(result.a).toBe(1);
    expect(result.self).toBe('[Circular]');
  });

  it('should format Error objects correctly', async () => {
    const error = new Error('Test error');
    (error as any).code = 'ERR_TEST';

    const result: any = await step.execute(error, mockContext);
    expect(result.message).toBe('Test error');
    expect(result.name).toBe('Error');
    expect(result.code).toBe('ERR_TEST');
    expect(result.stack).toBeDefined();
  });

  it('should handle nested objects', async () => {
    const data = { a: { b: { c: 1 } } };
    const result = await step.execute(data, mockContext);
    expect(result).toEqual(data);
  });

  it('should handle arrays without modification when no circular refs', async () => {
    const data = [1, 'hello', { safe: true }];
    const result = await step.execute(data as any, mockContext);
    expect(result).toEqual(data);
  });

  it('should handle circular references inside arrays', async () => {
    const inner: any = { name: 'inner' };
    inner.self = inner;
    const data = [inner, { safe: 'value' }];

    const result: any = await step.execute(data as any, mockContext);
    expect(result[0].name).toBe('inner');
    expect(result[0].self).toBe('[Circular]');
    expect(result[1].safe).toBe('value');
  });

  it('should handle objects whose toString/valueOf throws in outer catch', async () => {
    // Proxy that throws on JSON.stringify and safeDecycle
    let throwCount = 0;
    const evil = new Proxy(
      {},
      {
        get(_t, key) {
          // Allow WeakSet operations
          if (typeof key === 'symbol' || key === 'then') return undefined;
          throwCount++;
          if (throwCount > 2) throw new Error('get failed');
          return undefined;
        },
        ownKeys() {
          throw new Error('ownKeys failed');
        },
      }
    );
    const result = await step.execute(evil as any, mockContext);
    expect(typeof result).toBe('string');
  });
});
