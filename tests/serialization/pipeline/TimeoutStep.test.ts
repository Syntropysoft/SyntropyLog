import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TimeoutStep } from '../../../src/serialization/pipeline/TimeoutStep';
import { OperationTimeoutStrategy } from '../../../src/serialization/SerializationPipeline';
import { SerializableData, SerializationPipelineContext } from '../../../src/types';

// Mock timeout strategy
class MockTimeoutStrategy implements OperationTimeoutStrategy {
  constructor(
    private strategyName: string,
    private timeoutMs: number
  ) {}

  calculateTimeout(data: SerializableData): number {
    return this.timeoutMs;
  }

  getStrategyName(): string {
    return this.strategyName;
  }
}

describe('TimeoutStep', () => {
  let timeoutStep: TimeoutStep;
  let timeoutStrategies: Map<string, OperationTimeoutStrategy>;
  let mockContext: SerializationPipelineContext;

  beforeEach(() => {
    timeoutStrategies = new Map();
    timeoutStrategies.set('default', new MockTimeoutStrategy('default', 3000));

    timeoutStep = new TimeoutStep(timeoutStrategies);
    mockContext = {} as SerializationPipelineContext;
  });

  describe('Basic Functionality', () => {
    it('should have correct name', () => {
      expect(timeoutStep.name).toBe('timeout');
    });

    it('should execute successfully with default strategy', async () => {
      const data: SerializableData = {
        type: 'unknown',
        content: 'test data'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result).toBeDefined();
      expect(result.timeoutDuration).toBeDefined();
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
      expect(result.timeoutApplied).toBe(true);
      expect(result.timeoutError).toBeUndefined();
    });

    it('should preserve original data', async () => {
      const data: SerializableData = {
        type: 'unknown',
        content: 'test data',
        metadata: { key: 'value' }
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.type).toBe('unknown');
      expect(result.content).toBe('test data');
      expect(result.metadata).toEqual({ key: 'value' });
    });
  });

  describe('Timeout Strategy Selection', () => {
    it('should use default strategy for any data type', async () => {
      const data: SerializableData = {
        type: 'AnyQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
    });

    it('should use default strategy for unknown types', async () => {
      const data: SerializableData = {
        type: 'UnknownQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
    });
  });

  describe('Fallback Behavior', () => {
    it('should have timeoutApplied false when default strategy is missing', async () => {
      timeoutStrategies.delete('default');
      timeoutStep = new TimeoutStep(timeoutStrategies);

      const data: SerializableData = {
        type: 'AnyQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.timeoutApplied).toBe(false);
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
    });
  });

  describe('Error Handling', () => {
    it('should have timeoutApplied false when default strategy is missing', async () => {
      timeoutStrategies.delete('default');
      timeoutStep = new TimeoutStep(timeoutStrategies);

      const data: SerializableData = { type: 'AnyQuery', content: 'test data' };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.timeoutApplied).toBe(false);
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
      expect(result.timeoutError).toBeUndefined();
    });

    it('should handle non-Error objects when default strategy throws', async () => {
      const errorStrategy = new MockTimeoutStrategy('default', 1000);
      errorStrategy.calculateTimeout = vi.fn().mockImplementation(() => {
        throw 'String error';
      });
      timeoutStrategies.set('default', errorStrategy);
      timeoutStep = new TimeoutStep(timeoutStrategies);

      const data: SerializableData = { type: 'AnyQuery', content: 'test data' };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.timeoutApplied).toBe(false);
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
      expect(result.timeoutError).toBe('Timeout error');
    });

    it('should handle errors when default strategy calculation throws', async () => {
      const errorStrategy = new MockTimeoutStrategy('default', 1000);
      errorStrategy.calculateTimeout = vi.fn().mockImplementation(() => {
        throw new Error('Calculation error');
      });
      timeoutStrategies.set('default', errorStrategy);
      timeoutStep = new TimeoutStep(timeoutStrategies);

      const data: SerializableData = { type: 'AnyQuery', content: 'test data' };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.timeoutApplied).toBe(false);
      expect(result.timeoutError).toBe('Calculation error');
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
    });
  });

  describe('Performance Measurement', () => {
    it('should measure execution duration', async () => {
      const data: SerializableData = {
        type: 'unknown',
        content: 'test data'
      };

      const startTime = Date.now();
      const result = await timeoutStep.execute(data, mockContext);
      const endTime = Date.now();

      expect(result.timeoutDuration).toBeGreaterThanOrEqual(0);
      expect(result.timeoutDuration).toBeLessThanOrEqual(endTime - startTime + 10); // Allow small margin
    });

    it('should measure duration even when default strategy throws', async () => {
      const errorStrategy = new MockTimeoutStrategy('default', 1000);
      errorStrategy.calculateTimeout = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      timeoutStrategies.set('default', errorStrategy);
      timeoutStep = new TimeoutStep(timeoutStrategies);

      const data: SerializableData = { type: 'AnyQuery', content: 'test data' };

      const startTime = Date.now();
      const result = await timeoutStep.execute(data, mockContext);
      const endTime = Date.now();

      expect(result.timeoutDuration).toBeGreaterThanOrEqual(0);
      expect(result.timeoutDuration).toBeLessThanOrEqual(endTime - startTime + 10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null data', async () => {
      const data = null as any;

      const result = await timeoutStep.execute(data, mockContext);

      expect(result).toBeDefined();
      expect(result.timeoutApplied).toBe(true); // Should be true because default strategy exists
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
    });

    it('should handle undefined data', async () => {
      const data = undefined as any;

      const result = await timeoutStep.execute(data, mockContext);

      expect(result).toBeDefined();
      expect(result.timeoutApplied).toBe(true); // Should be true because default strategy exists
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
    });

    it('should handle data without type', async () => {
      const data: SerializableData = {
        content: 'test data without type'
      } as any;

      const result = await timeoutStep.execute(data, mockContext);

      expect(result).toBeDefined();
      expect(result.timeoutApplied).toBe(true); // Should be true because default strategy exists
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
    });

    it('should handle data without type when no default strategy', async () => {
      // Remove default strategy to test fallback
      timeoutStrategies.delete('default');

      const data: SerializableData = {
        content: 'test data without type'
      } as any;

      const result = await timeoutStep.execute(data, mockContext);

      expect(result).toBeDefined();
      expect(result.timeoutApplied).toBe(false); // Should be false because no strategy found
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
    });
  });
}); 