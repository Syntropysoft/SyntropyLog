import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SerializationStep } from '../../../src/serialization/pipeline/SerializationStep';
import { PipelineContext } from '../../../src/serialization/SerializationPipeline';
import { ISerializer, SerializationContext as SerializerContext } from '../../../src/serialization/types';

describe('SerializationStep', () => {
  let step: SerializationStep;
  let context: PipelineContext;

  beforeEach(() => {
    step = new SerializationStep();
    context = {
      serializationContext: {},
      sanitizeSensitiveData: true,
      enableMetrics: true
    };
  });

  describe('Serializer Management', () => {
    it('should add serializer with priority ordering', () => {
      const highPrioritySerializer = {
        name: 'high-priority',
        priority: 100,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'HighPriorityData' },
          serializer: 'high-priority',
          duration: 5,
          complexity: 'simple'
        })
      };

      const lowPrioritySerializer = {
        name: 'low-priority',
        priority: 10,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'LowPriorityData' },
          serializer: 'low-priority',
          duration: 5,
          complexity: 'simple'
        })
      };

      step.addSerializer(lowPrioritySerializer);
      step.addSerializer(highPrioritySerializer);

      const serializers = step.getRegisteredSerializers();
      expect(serializers[0]).toBe('high-priority');
      expect(serializers[1]).toBe('low-priority');
    });

    it('should register serializers correctly', () => {
      const testSerializer = {
        name: 'test-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'TestData' },
          serializer: 'test-serializer',
          duration: 5,
          complexity: 'simple'
        })
      };

      step.addSerializer(testSerializer);
      
      const serializers = step.getRegisteredSerializers();
      expect(serializers).toContain('test-serializer');
    });
  });

  describe('Serialization Execution', () => {
    it('should serialize data successfully', async () => {
      const testSerializer = {
        name: 'test-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'TestData', id: 1 },
          serializer: 'test-serializer',
          duration: 5,
          complexity: 'simple'
        })
      };

      step.addSerializer(testSerializer);
      
      const testData = { id: 1, name: 'test' };
      
      const result = await step.execute(testData, context);

      expect(result).toMatchObject({
        type: 'TestData',
        id: 1,
        serializationDuration: expect.any(Number),
        serializer: 'test-serializer',
        serializationComplexity: 'simple'
      });
      expect(testSerializer.serialize).toHaveBeenCalledWith(testData, context.serializationContext);
    });

    it('should handle data without matching serializer', async () => {
      const data = { type: 'UnknownType' };
      
      await expect(step.execute(data, {} as PipelineContext))
        .rejects.toThrow('No se encontró serializador para los datos proporcionados');
    });

    it('should enforce ultra-fast serialization timeout', async () => {
      const slowSerializer = {
        name: 'slow',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 60)); // Más de 50ms
          return {
            success: true,
            data: { type: 'SlowData' },
            serializer: 'slow',
            duration: 60,
            complexity: 'simple',
            sanitized: false,
            metadata: { complexity: 'simple', serializer: 'slow' }
          };
        })
      };

      step.addSerializer(slowSerializer);
      const data = { type: 'SlowData' };

      await expect(step.execute(data, {} as PipelineContext))
        .rejects.toThrow('Serialización lenta');
    });

    it('should handle serializer errors gracefully', async () => {
      const failingSerializer = {
        name: 'failing',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockRejectedValue(new Error('Serialization failed'))
      };

      step.addSerializer(failingSerializer);
      const data = { type: 'FailingData' };

      await expect(step.execute(data, {} as PipelineContext))
        .rejects.toThrow('Serialization failed');
    });

    it('should measure serialization duration accurately', async () => {
      const fastSerializer = {
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
        })
      };

      step = new SerializationStep([fastSerializer]);
      
      const startTime = Date.now();
      const result = await step.execute({ id: 1 }, context);
      const endTime = Date.now();

      expect(result.serializationDuration).toBeGreaterThanOrEqual(4);
      expect(result.serializationDuration).toBeLessThanOrEqual(endTime - startTime);
    });
  });

  describe('Performance Validation', () => {
    it('should reject serializations taking more than 50ms', async () => {
      const slowSerializer = {
        name: 'slow-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 60));
          return {
            success: true,
            data: { type: 'SlowData' },
            metadata: { complexity: 'low', duration: 60 }
          };
        })
      };

      step = new SerializationStep([slowSerializer]);
      
      // La excepción debe propagarse
      await expect(step.execute({ id: 1 }, context)).rejects.toThrow('Serialización lenta');
    });

    it('should accept serializations under 50ms', async () => {
      const fastSerializer = {
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
        })
      };

      step = new SerializationStep([fastSerializer]);
      
      const result = await step.execute({ id: 1 }, context);

      expect(result.type).toBe('FastData');
      expect(result.serializationDuration).toBeLessThanOrEqual(50);
    });
  });

  describe('Serializer Selection', () => {
    it('should select first matching serializer by priority', async () => {
      const lowPrioritySerializer = {
        name: 'low-priority',
        priority: 10,
        canSerialize: vi.fn().mockReturnValue(false),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'LowPriorityData' },
          serializer: 'low-priority',
          duration: 5,
          complexity: 'simple'
        })
      };

      const highPrioritySerializer = {
        name: 'high-priority',
        priority: 100,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'HighPriorityData' },
          serializer: 'high-priority',
          duration: 5,
          complexity: 'simple'
        })
      };

      // Agregar en cualquier orden, el método addSerializer los ordenará por prioridad
      step.addSerializer(lowPrioritySerializer);
      step.addSerializer(highPrioritySerializer);

      await step.execute({ id: 1 }, context);

      expect(highPrioritySerializer.serialize).toHaveBeenCalled();
      expect(lowPrioritySerializer.serialize).not.toHaveBeenCalled();
    });

    it('should skip serializers that cannot serialize the data', async () => {
      const cannotSerialize = {
        name: 'cannot-serialize',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(false),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'CannotSerializeData' },
          serializer: 'cannot-serialize',
          duration: 5,
          complexity: 'simple'
        })
      };

      const canSerialize = {
        name: 'can-serialize',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'CanSerializeData' },
          serializer: 'can-serialize',
          duration: 5,
          complexity: 'simple'
        })
      };

      // Agregar en cualquier orden, el método addSerializer los ordenará por prioridad
      step.addSerializer(cannotSerialize);
      step.addSerializer(canSerialize);

      await step.execute({ id: 1 }, context);

      expect(cannotSerialize.serialize).not.toHaveBeenCalled();
      expect(canSerialize.serialize).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle non-Error exceptions', async () => {
      const throwingSerializer = {
        name: 'throwing-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockRejectedValue('String error')
      };

      step = new SerializationStep([throwingSerializer]);
      
      // La excepción debe propagarse
      await expect(step.execute({ id: 1 }, context)).rejects.toBe('String error');
    });

    it('should handle timeout race conditions', async () => {
      const timeoutSerializer = {
        name: 'timeout-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 60));
          return {
            success: true,
            data: { type: 'TimeoutData' },
            metadata: { complexity: 'low', duration: 60 }
          };
        })
      };

      step = new SerializationStep([timeoutSerializer]);
      
      // La excepción debe propagarse
      await expect(step.execute({ id: 1 }, context)).rejects.toThrow('Serialización lenta');
    });
  });

  describe('Real Serialization Tests', () => {
    it('should actually serialize JSON data correctly', async () => {
      const jsonSerializer = {
        name: 'json-serializer',
        priority: 50,
        canSerialize: vi.fn().mockImplementation((data) => {
          return typeof data === 'object' && data !== null;
        }),
        serialize: vi.fn().mockImplementation(async (data) => {
          // Simular serialización real de JSON
          const serialized = JSON.stringify(data);
          return {
            success: true,
            data: {
              type: 'JSONData',
              content: serialized,
              size: serialized.length,
              originalType: typeof data
            },
            metadata: {
              complexity: 'simple',
              duration: 1
            }
          };
        })
      };

      step = new SerializationStep([jsonSerializer]);
      
      const testData = { id: 1, name: 'test', nested: { value: 'deep' } };
      const result = await step.execute(testData, context);

      // Verificar que realmente se serializó
      expect(result.type).toBe('JSONData');
      expect(result.content).toBe('{"id":1,"name":"test","nested":{"value":"deep"}}');
      expect(result.size).toBe(result.content.length);
      expect(result.originalType).toBe('object');
      expect(jsonSerializer.serialize).toHaveBeenCalledWith(testData, context.serializationContext);
    });

    it('should handle complex data structures', async () => {
      const complexSerializer = {
        name: 'complex-serializer',
        priority: 50,
        canSerialize: vi.fn().mockImplementation((data) => {
          return data && typeof data === 'object' && Object.keys(data).length > 2;
        }),
        serialize: vi.fn().mockImplementation(async (data) => {
          // Simular serialización de estructuras complejas
          const keys = Object.keys(data);
          const values = Object.values(data);
          const complexity = keys.length * values.length;
          
          return {
            success: true,
            data: {
              type: 'ComplexData',
              keyCount: keys.length,
              valueCount: values.length,
              complexity,
              hasNestedObjects: values.some(v => typeof v === 'object' && v !== null),
              estimatedSize: JSON.stringify(data).length
            },
            metadata: {
              complexity: 'complex',
              duration: 2
            }
          };
        })
      };

      step = new SerializationStep([complexSerializer]);
      
      const complexData = {
        users: [
          { id: 1, name: 'Alice', roles: ['admin', 'user'] },
          { id: 2, name: 'Bob', roles: ['user'] }
        ],
        metadata: {
          total: 2,
          created: new Date().toISOString()
        },
        settings: {
          theme: 'dark',
          language: 'es'
        }
      };

      const result = await step.execute(complexData, context);

      // Verificar que se analizó correctamente la complejidad
      expect(result.type).toBe('ComplexData');
      expect(result.keyCount).toBe(3); // users, metadata, settings
      expect(result.valueCount).toBe(3);
      expect(result.hasNestedObjects).toBe(true);
      expect(result.complexity).toBe(9); // 3 * 3
      expect(result.estimatedSize).toBeGreaterThan(100);
    });

    it('should fail gracefully with invalid data', async () => {
      const invalidData = { /* datos sin campos requeridos */ };
      
      await expect(step.execute(invalidData, {} as PipelineContext))
        .rejects.toThrow('No se encontró serializador para los datos proporcionados');
    });

    it('should handle multiple serializers with different capabilities', async () => {
      const simpleSerializer = {
        name: 'simple-serializer',
        priority: 10,
        canSerialize: vi.fn().mockImplementation((data) => {
          return data && typeof data === 'string';
        }),
        serialize: vi.fn().mockImplementation(async (data) => {
          return {
            success: true,
            data: {
              type: 'StringData',
              length: data.length,
              uppercase: data.toUpperCase(),
              lowercase: data.toLowerCase()
            },
            metadata: { complexity: 'simple', duration: 1 }
          };
        })
      };

      const objectSerializer = {
        name: 'object-serializer',
        priority: 50,
        canSerialize: vi.fn().mockImplementation((data) => {
          return data && typeof data === 'object' && !Array.isArray(data);
        }),
        serialize: vi.fn().mockImplementation(async (data) => {
          return {
            success: true,
            data: {
              type: 'ObjectData',
              keys: Object.keys(data),
              values: Object.values(data),
              size: Object.keys(data).length
            },
            metadata: { complexity: 'medium', duration: 2 }
          };
        })
      };

      step = new SerializationStep([simpleSerializer, objectSerializer]);

      // Probar con string - debe usar simpleSerializer
      const stringResult = await step.execute('Hello World', context);
      expect(stringResult.type).toBe('StringData');
      expect(stringResult.length).toBe(11);
      expect(stringResult.uppercase).toBe('HELLO WORLD');
      expect(simpleSerializer.serialize).toHaveBeenCalledWith('Hello World', context.serializationContext);

      // Reset mocks
      simpleSerializer.serialize.mockClear();
      objectSerializer.serialize.mockClear();

      // Probar con objeto - debe usar objectSerializer
      const objectResult = await step.execute({ id: 1, name: 'test' }, context);
      expect(objectResult.type).toBe('ObjectData');
      expect(objectResult.keys).toEqual(['id', 'name']);
      expect(objectResult.values).toEqual([1, 'test']);
      expect(objectResult.size).toBe(2);
      expect(objectSerializer.serialize).toHaveBeenCalledWith({ id: 1, name: 'test' }, context.serializationContext);
      expect(simpleSerializer.serialize).not.toHaveBeenCalled();
    });
  });
}); 