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

  describe('isNativeAddonInUse', () => {
    it('returns false when getNativeAddon returns null', () => {
      expect((manager as any).getNativeAddon()).toBe(null);
      expect(manager.isNativeAddonInUse()).toBe(false);
    });

    it('returns true when getNativeAddon returns a fake addon', () => {
      const fakeAddon = {
        fastSerialize: vi.fn().mockReturnValue('{}'),
        configureNative: vi.fn(),
      };
      (manager as any).getNativeAddon = vi.fn().mockReturnValue(fakeAddon);
      (manager as any).nativeAddon = fakeAddon;
      (manager as any).nativeChecked = true;
      expect(manager.isNativeAddonInUse()).toBe(true);
    });
  });

  describe('serializeDirect', () => {
    it('should use JS pipeline when native addon is null and return entry with level, message, service and metadata', () => {
      const ts = 1700000000000;
      const result = manager.serializeDirect(
        'info',
        'test message',
        ts,
        'test-service',
        { key: 1 }
      );
      expect(result.success).toBe(true);
      expect(result.serializer).toBeDefined();
      const data = result.data as Record<string, unknown>;
      expect(data).toBeDefined();
      expect(data.level).toBe('info');
      expect(data.message).toBe('test message');
      expect(data.service).toBe('test-service');
      expect(data.key).toBe(1);
      expect(data.timestamp).toBe(ts);
    });

    it('should call onSerializationFallback when native addon throws and then return JS pipeline result', () => {
      const onSerializationFallback = vi.fn();
      const m = new SerializationManager({ onSerializationFallback });
      const fakeAddon = {
        fastSerialize: vi.fn().mockImplementation(() => {
          throw new Error('native crash');
        }),
        configureNative: vi.fn(),
      };
      (m as any).getNativeAddon = vi.fn().mockReturnValue(fakeAddon);
      (m as any).nativeChecked = true;

      const result = m.serializeDirect('info', 'msg', 123, 'svc', {});

      expect(onSerializationFallback).toHaveBeenCalledWith(expect.any(Error));
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)?.message).toBe('msg');
      expect((result.data as Record<string, unknown>)?.level).toBe('info');
    });

    it('should use fastSerializeFromJson when available and metadata is serializable, then return native result', () => {
      const m = new SerializationManager();
      const nativeLine =
        '{"level":"info","message":"hi","service":"svc","timestamp":"2024-01-01T00:00:00.000Z","a":1}';
      const fastSerializeFromJson = vi.fn().mockReturnValue(nativeLine);
      const fastSerialize = vi.fn();
      const fakeAddon = {
        fastSerialize,
        fastSerializeFromJson,
        configureNative: vi.fn(),
      };
      (m as any).getNativeAddon = vi.fn().mockReturnValue(fakeAddon);
      (m as any).nativeChecked = true;

      const result = m.serializeDirect('info', 'hi', 1704067200000, 'svc', {
        a: 1,
      });

      expect(fastSerializeFromJson).toHaveBeenCalledWith(
        'info',
        'hi',
        1704067200000,
        'svc',
        '{"a":1}'
      );
      expect(fastSerialize).not.toHaveBeenCalled();
      expect(result.serializedNative).toBe(nativeLine);
      expect(result.success).toBe(true);
    });

    it('should fall back to fastSerialize when fastSerializeFromJson returns error prefix', () => {
      const m = new SerializationManager();
      const fallbackLine =
        '{"level":"info","message":"hi","service":"svc","timestamp":"2024-01-01T00:00:00.000Z"}';
      const fastSerializeFromJson = vi
        .fn()
        .mockReturnValue('[SYNTROPYLOG_NATIVE_ERROR] invalid metadata json');
      const fastSerialize = vi.fn().mockReturnValue(fallbackLine);
      const fakeAddon = {
        fastSerialize,
        fastSerializeFromJson,
        configureNative: vi.fn(),
      };
      (m as any).getNativeAddon = vi.fn().mockReturnValue(fakeAddon);
      (m as any).nativeChecked = true;

      const result = m.serializeDirect('info', 'hi', 1704067200000, 'svc', {
        x: 1,
      });

      expect(fastSerializeFromJson).toHaveBeenCalled();
      expect(fastSerialize).toHaveBeenCalledWith(
        'info',
        'hi',
        1704067200000,
        'svc',
        { x: 1 }
      );
      expect(result.serializedNative).toBe(fallbackLine);
    });

    it('should fall back to JS pipeline when native returns SYNTROPYLOG_NATIVE_ERROR and return pipeline output (no onSerializationFallback)', () => {
      const onSerializationFallback = vi.fn();
      const m = new SerializationManager({ onSerializationFallback });
      const fakeAddon = {
        fastSerialize: vi
          .fn()
          .mockReturnValue('[SYNTROPYLOG_NATIVE_ERROR] something failed'),
        configureNative: vi.fn(),
      };
      (m as any).getNativeAddon = vi.fn().mockReturnValue(fakeAddon);
      (m as any).nativeChecked = true;

      const result = m.serialize({ level: 'info', message: 'x', service: 's' });

      expect(onSerializationFallback).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.serializer).not.toBe('native');
      expect((result.data as Record<string, unknown>)?.message).toBe('x');
      expect((result.data as Record<string, unknown>)?.service).toBe('s');
    });

    it('should call onSerializationFallback when native addon throws in serialize() and then return pipeline result', () => {
      const onSerializationFallback = vi.fn();
      const m = new SerializationManager({ onSerializationFallback });
      const fakeAddon = {
        fastSerialize: vi.fn().mockImplementation(() => {
          throw new Error('native serialize failed');
        }),
        configureNative: vi.fn(),
      };
      (m as any).getNativeAddon = vi.fn().mockReturnValue(fakeAddon);
      (m as any).nativeChecked = true;

      const result = m.serialize({ level: 'info', message: 'x', service: 's' });

      expect(onSerializationFallback).toHaveBeenCalledOnce();
      expect(onSerializationFallback).toHaveBeenCalledWith(expect.any(Error));
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)?.message).toBe('x');
    });
  });

  describe('getRegisteredSerializers and getPipelineMetrics', () => {
    it('should return only the names of currently registered serializers', () => {
      expect(manager.getRegisteredSerializers()).toEqual([]);
      const a = createMockDefaultSerializer();
      a.name = 'custom-a';
      manager.register(a);
      expect(manager.getRegisteredSerializers()).toContain('custom-a');
      const b = createMockDefaultSerializer();
      b.name = 'custom-b';
      manager.register(b);
      expect(manager.getRegisteredSerializers()).toContain('custom-a');
      expect(manager.getRegisteredSerializers()).toContain('custom-b');
    });

    it('should return pipeline metrics with stepDurations, totalDuration and timeoutStrategy after a serialize', () => {
      manager.serialize({ level: 'info', message: 'hi', service: 'svc' });
      const metrics = manager.getPipelineMetrics();
      expect(metrics).not.toBeNull();
      expect(metrics).toHaveProperty('stepDurations');
      expect(metrics).toHaveProperty('totalDuration');
      expect(metrics).toHaveProperty('timeoutStrategy');
      expect(metrics!.stepDurations).toHaveProperty('serialization');
      expect(metrics!.stepDurations).toHaveProperty('hygiene');
      expect(metrics!.stepDurations).toHaveProperty('sanitization');
      expect(metrics!.stepDurations).toHaveProperty('timeout');
      expect(typeof metrics!.totalDuration).toBe('number');
      expect(metrics!.timeoutStrategy).toBe('default');
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
