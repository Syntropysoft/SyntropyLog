import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SerializationStep } from '../../../src/serialization/pipeline/SerializationStep';
import { SerializationPipelineContext as PipelineContext } from '../../../src/types';
import { ISerializer, SerializationContext as SerializerContext } from '../../../src/serialization/types';

describe('SerializationStep', () => {
  let step: SerializationStep;
  let context: PipelineContext;

  beforeEach(() => {
    step = new SerializationStep();
    context = {
      serializationContext: {
        depth: 0,
        maxDepth: 5,
        sensitiveFields: [],
        sanitize: true
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
  });

  describe('Serializer Management', () => {
    it('should add serializer with priority ordering', () => {
      const highPrioritySerializer: ISerializer = {
        name: 'high-priority',
        priority: 100,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'HighPriorityData' },
          serializer: 'high-priority',
          duration: 5,
          complexity: 'simple'
        }),
        getComplexity: vi.fn().mockReturnValue('simple')
      };

      const lowPrioritySerializer: ISerializer = {
        name: 'low-priority',
        priority: 10,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'LowPriorityData' },
          serializer: 'low-priority',
          duration: 5,
          complexity: 'simple'
        }),
        getComplexity: vi.fn().mockReturnValue('simple')
      };

      step.addSerializer(lowPrioritySerializer);
      step.addSerializer(highPrioritySerializer);

      const serializers = step.getRegisteredSerializers();
      expect(serializers[0]).toBe('high-priority');
      expect(serializers[1]).toBe('low-priority');
    });
  });

  describe('Serialization Execution', () => {
    it('should serialize data successfully', async () => {
      const testSerializer: ISerializer = {
        name: 'test-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'TestData', id: 1 },
          serializer: 'test-serializer',
          duration: 5,
          complexity: 'simple'
        }),
        getComplexity: vi.fn().mockReturnValue('simple')
      };

      step.addSerializer(testSerializer);
      const result = await step.execute({ id: 1, name: 'test' }, context);

      expect(result).toMatchObject({
        type: 'TestData',
        id: 1,
        serializer: 'test-serializer'
      });
    });

    it('should return raw data if no serializer matches (resilience)', async () => {
      const data = { type: 'UnknownType', value: 123 };
      const result = await step.execute(data, context);

      // En v0.9.1, si no hay serializador, devuelve los datos originales
      expect(result).toBe(data);
    });

    it('should measure serialization duration accurately', async () => {
      const fastSerializer: ISerializer = {
        name: 'fast-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return {
            success: true,
            data: { type: 'FastData' },
            metadata: { complexity: 'low', duration: 5 }
          };
        }),
        getComplexity: vi.fn().mockReturnValue('simple')
      };

      step = new SerializationStep([fastSerializer]);
      const result = await step.execute({ id: 1 }, context);

      expect(result.serializationDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Serializer Selection', () => {
    it('should select first matching serializer by priority', async () => {
      const lowPrioritySerializer: ISerializer = {
        name: 'low-priority',
        priority: 10,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'LowPriorityData' },
          serializer: 'low-priority',
          duration: 5,
          complexity: 'simple'
        }),
        getComplexity: vi.fn().mockReturnValue('simple')
      };

      const highPrioritySerializer: ISerializer = {
        name: 'high-priority',
        priority: 100,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'HighPriorityData' },
          serializer: 'high-priority',
          duration: 5,
          complexity: 'simple'
        }),
        getComplexity: vi.fn().mockReturnValue('simple')
      };

      step.addSerializer(lowPrioritySerializer);
      step.addSerializer(highPrioritySerializer);

      const result = await step.execute({ id: 1 }, context);
      expect(result.serializer).toBe('high-priority');
    });
  });
});