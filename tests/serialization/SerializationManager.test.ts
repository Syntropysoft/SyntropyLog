import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SerializationManager } from '../../src/serialization/SerializationManager';
import {
  ISerializer,
  SerializationComplexity,
} from '../../src/serialization/types';

// Mock serializer for testing (generic, no adapter-specific types)
const createMockDefaultSerializer = (): ISerializer => ({
  name: 'default',
  priority: 100,
  canSerialize: vi
    .fn()
    .mockImplementation((data: any) => data.type === 'Query'),
  getComplexity: vi.fn().mockReturnValue('simple'),
  serialize: vi.fn().mockReturnValue({
    success: true,
    data: { type: 'Query', action: 'execute', serialized: true },
    serializer: 'default',
    duration: 5,
    complexity: 'simple',
    sanitized: false,
    metadata: {},
  }),
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
        enableDeepSanitization: true,
      },
    });
    // Forzar pipeline JS en tests (sin addon) para que se usen los serializers registrados.
    (manager as any).getNativeAddon = vi.fn().mockReturnValue(null);
    (manager as any).nativeChecked = true;
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
    it('should serialize data successfully using a registered serializer', () => {
      const serializer: ISerializer = {
        name: 'test-serializer',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        getComplexity: vi.fn().mockReturnValue('simple'),
        serialize: vi.fn().mockReturnValue({
          success: true,
          data: { id: 1, serialized: true },
          serializer: 'test-serializer',
          duration: 2,
          complexity: 'simple',
          sanitized: false,
          metadata: {},
        }),
      };

      manager.register(serializer);
      const result = manager.serialize({ id: 1 });

      expect(result.success).toBe(true);
      expect(result.data.serialized).toBe(true);
      expect(result.metadata.serializer).toBe('test-serializer');
    });

    it('should fall back to raw serialization (hygiene) if no serializer matches', () => {
      // No serializers registered
      const data = { id: 1, name: 'Normal Data' };
      const result = manager.serialize(data);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject(data);
      // In the new architecture, if no custom serializer is found,
      // it just passes through hygiene/sanitization.
    });

    it('should handle serializer errors by returning a failing result', () => {
      const failingSerializer: ISerializer = {
        name: 'failing',
        priority: 50,
        canSerialize: vi.fn().mockReturnValue(true),
        getComplexity: vi.fn().mockReturnValue('simple'),
        serialize: vi.fn().mockImplementation(() => {
          throw new Error('Internal failure');
        }),
      };

      manager.register(failingSerializer);
      const result = manager.serialize({ id: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal failure');
    });
  });

  describe('Metrics Tracking', () => {
    it('should track metrics for successful serializations', async () => {
      const serializer = createMockDefaultSerializer();
      manager.register(serializer);

      manager.serialize({ type: 'Query' });

      const metrics = manager.getMetrics();
      expect(metrics.totalSerializations).toBe(1);
      expect(metrics.successfulSerializations).toBe(1);
      expect(metrics.serializerDistribution['default']).toBe(1);
    });
  });
});
