import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SerializationManager } from '../../src/serialization/SerializationManager';
import { ISerializer, SerializationComplexity } from '../../src/serialization/types';

// Mock serializers for testing
const createMockPrismaSerializer = (): ISerializer => ({
  name: 'prisma',
  priority: 100,
  canSerialize: vi.fn().mockImplementation(data => data.type === 'PrismaQuery'),
  getComplexity: vi.fn().mockReturnValue('simple'),
  serialize: vi.fn().mockResolvedValue({
    success: true,
    data: { type: 'PrismaQuery', action: 'findFirst', serialized: true },
    serializer: 'prisma',
    duration: 5,
    complexity: 'simple'
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
    if (manager) {
      manager.resetMetrics();
    }
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultManager = new SerializationManager();
      const metrics = defaultManager.getMetrics();
      expect(metrics.totalSerializations).toBe(0);
    });
  });

  describe('Serialization Process', () => {
    it('should serialize data successfully using a registered serializer', async () => {
      const serializer: ISerializer = {
        name: 'test-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        getComplexity: vi.fn().mockReturnValue('simple'),
        serialize: vi.fn().mockResolvedValue({
          success: true,
          data: { id: 1, serialized: true },
          serializer: 'test-serializer',
          duration: 2,
          complexity: 'simple'
        })
      };

      manager.register(serializer);
      const result = await manager.serialize({ id: 1 });

      expect(result.success).toBe(true);
      expect(result.data.serialized).toBe(true);
      expect(result.metadata.serializer).toBe('test-serializer');
    });

    it('should fall back to raw serialization (hygiene) if no serializer matches', async () => {
      // No serializers registered
      const data = { id: 1, name: 'Normal Data' };
      const result = await manager.serialize(data);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject(data);
      // In the new architecture, if no custom serializer is found, 
      // it just passes through hygiene/sanitization.
    });

    it('should handle serializer errors by returning a failing result', async () => {
      const failingSerializer: ISerializer = {
        name: 'failing',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        getComplexity: vi.fn().mockReturnValue('simple'),
        serialize: vi.fn().mockRejectedValue(new Error('Internal failure'))
      };

      manager.register(failingSerializer);
      const result = await manager.serialize({ id: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal failure');
    });
  });

  describe('Metrics Tracking', () => {
    it('should track metrics for successful serializations', async () => {
      const serializer = createMockPrismaSerializer();
      manager.register(serializer);

      await manager.serialize({ type: 'PrismaQuery' });

      const metrics = manager.getMetrics();
      expect(metrics.totalSerializations).toBe(1);
      expect(metrics.successfulSerializations).toBe(1);
      expect(metrics.serializerDistribution['prisma']).toBe(1);
    });
  });
});