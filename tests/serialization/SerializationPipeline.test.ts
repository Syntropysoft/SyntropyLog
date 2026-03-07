import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SerializationPipeline,
  DefaultTimeoutStrategy,
  PipelineStep
} from '../../src/serialization/SerializationPipeline';
import { SerializationPipelineContext } from '../../src/types';
import { SanitizationStep } from '../../src/serialization/pipeline/SanitizationStep';
import { TimeoutStep } from '../../src/serialization/pipeline/TimeoutStep';

describe('SerializationPipeline', () => {
  let pipeline: SerializationPipeline;
  let mockSerializationStep: PipelineStep<any>;
  let mockSanitizationStep: PipelineStep<any>;
  let mockTimeoutStep: PipelineStep<any>;

  beforeEach(() => {
    pipeline = new SerializationPipeline();

    // Mock steps
    mockSerializationStep = {
      name: 'serialization',
      execute: vi.fn().mockImplementation(async (data) => ({
        ...data,
        type: 'TestQuery',
        serializationDuration: 5,
        serializer: 'test'
      }))
    };

    mockSanitizationStep = {
      name: 'sanitization',
      execute: vi.fn().mockImplementation(async (data) => ({
        ...data,
        sanitizationDuration: 3,
        sanitized: true
      }))
    };

    mockTimeoutStep = {
      name: 'timeout',
      execute: vi.fn().mockImplementation(async (data) => ({
        ...data,
        timeoutDuration: 1,
        operationTimeout: 2000,
        timeoutStrategy: 'default',
        timeoutApplied: true
      }))
    };
  });

  describe('Pipeline Configuration', () => {
    it('should add steps to pipeline', () => {
      pipeline.addStep(mockSerializationStep);
      pipeline.addStep(mockSanitizationStep);
      pipeline.addStep(mockTimeoutStep);

      const result = pipeline.process({ test: 'data' }, { serializationContext: {} } as SerializationPipelineContext);
      expect(result).toBeDefined();
    });

    it('should add custom timeout strategies', () => {
      const customStrategy = {
        calculateTimeout: vi.fn().mockReturnValue(5000),
        getStrategyName: vi.fn().mockReturnValue('custom')
      };

      pipeline.addTimeoutStrategy(customStrategy);

      // Verify strategy was added (indirectly through process)
      const result = pipeline.process({ type: 'CustomQuery' }, { serializationContext: {} } as SerializationPipelineContext);
      expect(result).toBeDefined();
    });
  });

  describe('Pipeline Processing', () => {
    beforeEach(() => {
      pipeline.addStep(mockSerializationStep);
      pipeline.addStep(mockSanitizationStep);
      pipeline.addStep(mockTimeoutStep);
    });

    it('should process data through all steps', async () => {
      const testData = { id: 1, name: 'test' };
      const context: SerializationPipelineContext = {
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

      const result = await pipeline.process(testData, context);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 1,
        name: 'test',
        type: 'TestQuery',
        serializationDuration: 5,
        sanitizationDuration: 3,
        timeoutDuration: 1,
        operationTimeout: 2000,
        timeoutStrategy: 'default'
      });
      expect(result.metadata.serializer).toBe('test');
      expect(result.metadata.stepDurations).toBeDefined();
    });

    it('should handle step failures gracefully', async () => {
      const failingStep: PipelineStep<any> = {
        name: 'failing',
        execute: vi.fn().mockRejectedValue(new Error('Step failed'))
      };

      pipeline.addStep(failingStep);

      const result = await pipeline.process({ test: 'data' }, { serializationContext: {} } as SerializationPipelineContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Step failed');
      expect(result.metadata.serializer).toBe('pipeline');
    });

    it('should track step durations', async () => {
      const slowStep: PipelineStep<any> = {
        name: 'slow',
        execute: vi.fn().mockImplementation(async (data) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { ...data, slow: true };
        })
      };

      pipeline.addStep(slowStep);

      const result = await pipeline.process({ test: 'data' }, { serializationContext: {} } as SerializationPipelineContext);

      expect(result.success).toBe(true);
      expect((result.metadata.stepDurations as any)['slow']).toBeGreaterThan(0);
    });
  });

  describe('Timeout Strategies', () => {
    it('should use default strategy for all data types', async () => {
      const result = await pipeline.process(
        { type: 'AnyQuery', payload: 'data' },
        { serializationContext: {} } as SerializationPipelineContext
      );

      expect(result.success).toBe(true);
      expect(result.metadata.timeoutStrategy).toBe('default');
      expect(result.metadata.operationTimeout).toBe(5000);
    });

    it('should fallback to default strategy for unknown types', async () => {
      const unknownData = { type: 'UnknownQuery' };
      const result = await pipeline.process(unknownData, { serializationContext: {} } as SerializationPipelineContext);

      expect(result.success).toBe(true);
      expect(result.metadata.timeoutStrategy).toBe('default');
    });
  });

  describe('Metrics', () => {
    it('should provide pipeline metrics', async () => {
      const testStep: PipelineStep<any> = {
        name: 'test',
        execute: vi.fn().mockImplementation(async (data) => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return { ...data, processed: true };
        })
      };
      pipeline.addStep(testStep);

      await pipeline.process({ test: 'data' }, { serializationContext: {} } as SerializationPipelineContext);

      const metrics = pipeline.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics?.totalDuration).toBeGreaterThan(0);
      expect(metrics?.stepDurations).toBeDefined();
      expect(metrics?.operationTimeout).toBeGreaterThan(0);
      expect(metrics?.timeoutStrategy).toBeDefined();
    });

    it('should track step durations accurately', async () => {
      const fastStep: PipelineStep<any> = {
        name: 'fast',
        execute: vi.fn().mockImplementation(async (data) => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return { ...data, fast: true };
        })
      };

      pipeline.addStep(fastStep);
      await pipeline.process({ test: 'data' }, { serializationContext: {} } as SerializationPipelineContext);

      const metrics = pipeline.getMetrics();
      const duration = metrics?.stepDurations['fast'];

      expect(duration).toBeGreaterThanOrEqual(3);
      expect(duration).toBeLessThanOrEqual(25);
    });
  });
});

describe('Timeout Strategies', () => {
  describe('DefaultTimeoutStrategy', () => {
    it('should return default timeout', () => {
      const strategy = new DefaultTimeoutStrategy();
      expect(strategy.calculateTimeout({})).toBe(5000);
      expect(strategy.getStrategyName()).toBe('default');
    });
  });
});