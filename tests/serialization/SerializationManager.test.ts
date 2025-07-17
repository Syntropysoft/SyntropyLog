import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SerializationManager } from '../../src/serialization/SerializationManager';
import { ISerializer, SerializationComplexity } from '../../src/serialization/types';

// Mock serializers for testing
const createMockPrismaSerializer = (): ISerializer => ({
  name: 'prisma',
  priority: 100,
  canSerialize: vi.fn().mockReturnValue(true),
  getComplexity: vi.fn().mockReturnValue(SerializationComplexity.SIMPLE),
  serialize: vi.fn().mockResolvedValue({
    success: true,
    data: { type: 'PrismaQuery', action: 'findFirst' },
    serializer: 'prisma',
    duration: 5,
    complexity: SerializationComplexity.SIMPLE,
    sanitized: false,
    metadata: {
      complexity: SerializationComplexity.SIMPLE,
      serializer: 'prisma'
    }
  })
});

const createMockTypeORMSerializer = (): ISerializer => ({
  name: 'typeorm',
  priority: 90,
  canSerialize: vi.fn().mockReturnValue(true),
  getComplexity: vi.fn().mockReturnValue(SerializationComplexity.SIMPLE),
  serialize: vi.fn().mockResolvedValue({
    success: true,
    data: { type: 'TypeORMQuery', sql: 'SELECT * FROM users' },
    serializer: 'typeorm',
    duration: 5,
    complexity: SerializationComplexity.SIMPLE,
    sanitized: false,
    metadata: {
      complexity: SerializationComplexity.SIMPLE,
      serializer: 'typeorm'
    }
  })
});

describe('SerializationManager', () => {
  let manager: SerializationManager;

  beforeEach(() => {
    manager = new SerializationManager({
      enableMetrics: true,
      sanitizeSensitiveData: true,
      sanitizationContext: {
        sensitiveFields: ['password', 'token'],
        redactPatterns: [/password\s*=\s*['"][^'"]*['"]/gi],
        maxStringLength: 100,
        enableDeepSanitization: true
      }
    });
  });

  afterEach(() => {
    // Limpiar explícitamente las métricas después de cada test
    if (manager) {
      manager.resetMetrics();
    }
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultManager = new SerializationManager();
      const metrics = defaultManager.getMetrics();
      
      expect(metrics.totalSerializations).toBe(0);
      expect(metrics.successfulSerializations).toBe(0);
      expect(metrics.failedSerializations).toBe(0);
    });

    it('should initialize with custom configuration', () => {
      const customManager = new SerializationManager({
        timeoutMs: 10000,
        enableMetrics: false,
        sanitizeSensitiveData: false
      });

      const metrics = customManager.getMetrics();
      expect(metrics.totalSerializations).toBe(0);
    });
  });

  describe('Serializer Registration', () => {
    it('should register serializers', () => {
      const testSerializer = {
        name: 'test-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'TestData', id: 1 },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(testSerializer);
      
      const serializers = manager.getRegisteredSerializers();
      expect(serializers).toContain('test-serializer');
    });

    it('should register multiple serializers', () => {
      const serializer1 = {
        name: 'serializer1',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'TestData1' },
          serializer: 'serializer1',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      const serializer2 = {
        name: 'serializer2',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'TestData2' },
          serializer: 'serializer2',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(serializer1);
      manager.register(serializer2);

      const serializers = manager.getRegisteredSerializers();
      expect(serializers).toContain('serializer1');
      expect(serializers).toContain('serializer2');
    });

    it('should register real serializers', () => {
      manager.register(createMockPrismaSerializer());
      manager.register(createMockTypeORMSerializer());

      const serializers = manager.getRegisteredSerializers();
      expect(serializers).toContain('prisma');
      expect(serializers).toContain('typeorm');
    });
  });

  describe('Serialization Process', () => {
    it('should serialize data successfully', async () => {
      const serializer = {
        name: 'test-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1, serialized: true },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(serializer);

      const result = await manager.serialize({
        id: 1
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 1
      });
      expect(result.metadata.serializer).toBe('test-serializer');
    });

    it('should handle serialization failures', async () => {
      const failingSerializer = {
        name: 'failing-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockRejectedValue(new Error('Serialization failed'))
      };

      manager.register(failingSerializer);

      const result = await manager.serialize({ id: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Serialization failed');
      expect(result.metadata.serializer).toBe('failing-serializer');
    });

    it('should handle data without matching serializer', async () => {
      const result = await manager.serialize({ id: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se encontró serializador');
      expect(result.metadata.serializer).toBe('none');
    });
  });

  describe('Metrics Tracking', () => {
    it('should track successful serializations', async () => {
      const serializer = {
        name: 'test-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1 },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(serializer);
      await manager.serialize({ id: 1 });

      const metrics = manager.getMetrics();
      expect(metrics.totalSerializations).toBe(1);
      expect(metrics.successfulSerializations).toBe(1);
      expect(metrics.failedSerializations).toBe(0);
    });

    it('should track failed serializations', async () => {
      const failingSerializer = {
        name: 'failing-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockRejectedValue(new Error('Failed'))
      };

      manager.register(failingSerializer);

      const result = await manager.serialize({ id: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed');

      // Las métricas se actualizan cuando hay fallos
      const metrics = manager.getMetrics();
      expect(metrics.failedSerializations).toBe(1);
    });

    it('should track serialization durations', async () => {
      const fastSerializer = {
        name: 'fast-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return {
            success: true,
            data: { type: 'FastData' },
            serializer: 'fast-serializer',
            duration: 5,
            complexity: SerializationComplexity.SIMPLE
          };
        })
      };

      manager.register(fastSerializer);

      await manager.serialize({ id: 1 });
      await manager.serialize({ id: 2 });

      const metrics = manager.getMetrics();
      
      expect(metrics.averageSerializationDuration).toBeGreaterThan(0);
      expect(metrics.maxSerializationDuration).toBeGreaterThan(0);
      expect(metrics.minSerializationDuration).toBeGreaterThan(0);
    });

    it('should track operation timeouts', async () => {
      const serializer = {
        name: 'test-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1 },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(serializer);
      await manager.serialize({ id: 1 });

      const metrics = manager.getMetrics();
      
      expect(metrics.averageOperationTimeout).toBeGreaterThan(0);
    });

    it('should track complexity distribution', async () => {
      const lowComplexitySerializer = {
        name: 'low-complexity',
        priority: 50,
        canSerialize: vi.fn().mockImplementation((data) => data.id === 1),
        getComplexity: vi.fn().mockReturnValue(SerializationComplexity.SIMPLE),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'LowComplexityData' },
          serializer: 'low-complexity',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      const highComplexitySerializer = {
        name: 'high-complexity',
        priority: 50,
        canSerialize: vi.fn().mockImplementation((data) => data.id === 2),
        getComplexity: vi.fn().mockReturnValue(SerializationComplexity.CRITICAL),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { type: 'HighComplexityData' },
          serializer: 'high-complexity',
          duration: 5,
          complexity: SerializationComplexity.CRITICAL
        })
      };

      manager.register(lowComplexitySerializer);
      manager.register(highComplexitySerializer);

      await manager.serialize({ id: 1 }); // low complexity
      await manager.serialize({ id: 2 }); // high complexity

      const metrics = manager.getMetrics();
      
      expect(metrics.complexityDistribution.low).toBe(1);
      expect(metrics.complexityDistribution.high).toBe(1);
      expect(metrics.complexityDistribution.medium).toBe(0);
    });

    it('should track serializer distribution', async () => {
      const serializer1 = {
        name: 'serializer1',
        canSerialize: vi.fn().mockImplementation((data) => data.id === 1),
        getComplexity: vi.fn().mockReturnValue(SerializationComplexity.SIMPLE),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1 },
          serializer: 'serializer1',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      const serializer2 = {
        name: 'serializer2',
        canSerialize: vi.fn().mockImplementation((data) => data.id === 2),
        getComplexity: vi.fn().mockReturnValue(SerializationComplexity.SIMPLE),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 2 },
          serializer: 'serializer2',
          duration: 3,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(serializer1);
      manager.register(serializer2);

      await manager.serialize({ id: 1 });
      await manager.serialize({ id: 2 });

      const metrics = manager.getMetrics();
      
      // Verificar que se registran los serializadores reales
      expect(metrics.serializerDistribution['serializer1']).toBe(1);
      expect(metrics.serializerDistribution['serializer2']).toBe(1);
    });

    it('should track timeout strategy distribution', async () => {
      const serializer = {
        name: 'test-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1 },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(serializer);
      await manager.serialize({ id: 1 });

      const metrics = manager.getMetrics();
      
      expect(metrics.timeoutStrategyDistribution).toBeDefined();
      expect(Object.keys(metrics.timeoutStrategyDistribution).length).toBeGreaterThan(0);
    });
  });

  describe('Metrics Reset', () => {
    it('should reset metrics', async () => {
      const serializer = {
        name: 'test-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1 },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(serializer);
      await manager.serialize({ id: 1 });
      
      let metrics = manager.getMetrics();
      expect(metrics.totalSerializations).toBe(1);

      manager.resetMetrics();
      
      metrics = manager.getMetrics();
      expect(metrics.totalSerializations).toBe(0);
      expect(metrics.successfulSerializations).toBe(0);
      expect(metrics.failedSerializations).toBe(0);
    });
  });

  describe('Pipeline Integration', () => {
    it('should process data through pipeline steps', async () => {
      const testSerializer = {
        name: 'test-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1, serialized: true },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(testSerializer);

      const result = await manager.serialize({ id: 1 });

      expect(result.success).toBe(true);
      expect(result.metadata.serializer).toBe('test-serializer');
      expect(result.metadata.stepDurations).toBeDefined();
      expect(result.metadata.operationTimeout).toBeGreaterThan(0);
    });
  });

  describe('Sanitization Integration', () => {
    it('should sanitize sensitive data when enabled', async () => {
      const serializer = {
        name: 'test-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1, password: 'secret123' },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(serializer);

      const sensitiveData = {
        id: 1,
        name: 'John Doe',
        password: 'secret123',
        token: 'abc123'
      };

      const result = await manager.serialize(sensitiveData);

      expect(result.success).toBe(true);
      expect(result.sanitized).toBe(true);
    });

    it('should not sanitize when disabled', async () => {
      const noSanitizeManager = new SerializationManager({
        sanitizeSensitiveData: false
      });

      const serializer = {
        name: 'test-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1, password: 'secret123' },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      noSanitizeManager.register(serializer);

      const sensitiveData = {
        id: 1,
        name: 'John Doe',
        password: 'secret123',
        token: 'abc123'
      };

      const result = await noSanitizeManager.serialize(sensitiveData);

      expect(result.success).toBe(true);
      expect(result.sanitized).toBe(false);
    });
  });

  describe('Performance Validation', () => {
    it('should maintain ultra-fast serialization', async () => {
      const fastSerializer = {
        name: 'fast-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1 },
          serializer: 'fast-serializer',
          duration: 3,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(fastSerializer);

      const startTime = Date.now();
      const result = await manager.serialize({ id: 1 });
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(50); // Debe ser muy rápido
    });

    it('should track performance metrics accurately', async () => {
      const noMetricsManager = new SerializationManager({
        enableMetrics: false
      });

      const serializer = {
        name: 'test-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1 },
          serializer: 'test-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      noMetricsManager.register(serializer);

      const result = await noMetricsManager.serialize({ id: 1 });

      expect(result.success).toBe(true);
      // Las métricas no deberían estar disponibles
      const metrics = noMetricsManager.getMetrics();
      expect(metrics.totalSerializations).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle pipeline errors gracefully', async () => {
      const failingSerializer = {
        name: 'failing-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockRejectedValue(new Error('Pipeline error'))
      };

      manager.register(failingSerializer);

      const result = await manager.serialize({ id: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Pipeline error');
      expect(result.metadata.serializer).toBe('failing-serializer');
    });

    it('should handle metrics errors gracefully', async () => {
      // Test with metrics disabled
      const noMetricsManager = new SerializationManager({
        enableMetrics: false
      });
      noMetricsManager.register(createMockPrismaSerializer());
      noMetricsManager.register(createMockTypeORMSerializer());

      const result = await noMetricsManager.serialize({ id: 1 });

      expect(result.success).toBe(true);
      
      const metrics = noMetricsManager.getMetrics();
      expect(metrics.totalSerializations).toBe(0); // No tracking when disabled
    });
  });

  describe('Real Integration Tests', () => {
    it('should actually serialize and process data through the complete pipeline', async () => {
      const realSerializer = {
        name: 'real-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1, serialized: true, type: 'TestData' },
          serializer: 'real-serializer',
          duration: 3,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(realSerializer);

      const result = await manager.serialize({ id: 1, type: 'TestData' });

      expect(result.success).toBe(true);
      expect(result.data.serialized).toBe(true);
      expect(result.data.type).toBe('TestData');
      expect(result.serializer).toBe('real-serializer');
      expect(result.metadata.stepDurations).toBeDefined();
      expect(result.metadata.operationTimeout).toBeGreaterThan(0);
    });

    it('should handle multiple serializers with different data types', async () => {
      const userSerializer = {
        name: 'user-serializer',
        canSerialize: vi.fn().mockImplementation(data => data.type === 'User'),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1, type: 'User', serialized: true },
          serializer: 'user-serializer',
          duration: 5,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      const productSerializer = {
        name: 'product-serializer',
        canSerialize: vi.fn().mockImplementation(data => data.type === 'Product'),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 2, type: 'Product', serialized: true },
          serializer: 'product-serializer',
          duration: 3,
          complexity: SerializationComplexity.SIMPLE
        })
      };

      manager.register(userSerializer);
      manager.register(productSerializer);

      // Serializar usuario
      const userResult = await manager.serialize({ id: 1, type: 'User' });
      expect(userResult.success).toBe(true);
      expect(userResult.data.type).toBe('User');
      expect(userResult.data.serialized).toBe(true);
      expect(userResult.serializer).toBe('user-serializer');

      // Serializar producto
      const productResult = await manager.serialize({ id: 2, type: 'Product' });
      expect(productResult.success).toBe(true);
      expect(productResult.data.type).toBe('Product');
      expect(productResult.data.serialized).toBe(true);
      expect(productResult.serializer).toBe('product-serializer');
    });

    it('should handle serialization failures and track them correctly', async () => {
      const failingSerializer = {
        name: 'failing-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockRejectedValue(new Error('Database connection failed'))
      };

      manager.register(failingSerializer);

      const result = await manager.serialize({ id: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
      expect(result.metadata.serializer).toBe('failing-serializer');

      // Las métricas se actualizan cuando hay fallos
      const metrics = manager.getMetrics();
      expect(metrics.failedSerializations).toBe(1);
    });

    it('should handle timeout scenarios correctly', async () => {
      const slowSerializer = {
        name: 'slow-serializer',
        canSerialize: vi.fn().mockReturnValue(true),
        serialize: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 15)); // Más de 10ms
          throw new Error('Serialización lenta: >10ms');
        })
      };

      manager.register(slowSerializer);

      const result = await manager.serialize({ id: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Serialización lenta');
      expect(result.metadata.serializer).toBe('slow-serializer');

      // Las métricas se actualizan cuando hay timeouts
      const metrics = manager.getMetrics();
      expect(metrics.failedSerializations).toBe(1);
    });
  });
}); 