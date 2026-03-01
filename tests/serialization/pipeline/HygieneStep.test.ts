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
            enableDeepSanitization: true
        }
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
        expect(result.self).toBe(result);
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

    it('should handle failures gracefully', async () => {
        // Force an error by passing something that flatted might choke on (internal)
        // or just mock flatted if needed. For now, testing the catch block with a proxy that throws.
        const evil = new Proxy({}, {
            get() { throw new Error('Proxy error'); }
        });

        const result = await step.execute(evil, mockContext);
        expect(typeof result).toBe('string');
        expect(result).toContain('[HYGIENE_ERROR:');
    });
});
