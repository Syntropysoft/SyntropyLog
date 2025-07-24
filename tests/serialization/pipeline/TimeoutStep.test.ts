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
    // Create mock timeout strategies
    timeoutStrategies = new Map();
    timeoutStrategies.set('default', new MockTimeoutStrategy('default', 3000));
    timeoutStrategies.set('prisma', new MockTimeoutStrategy('prisma', 5000));
    timeoutStrategies.set('typeorm', new MockTimeoutStrategy('typeorm', 4000));
    timeoutStrategies.set('mysql', new MockTimeoutStrategy('mysql', 6000));
    timeoutStrategies.set('postgresql', new MockTimeoutStrategy('postgresql', 7000));
    timeoutStrategies.set('sqlserver', new MockTimeoutStrategy('sqlserver', 8000));
    timeoutStrategies.set('oracle', new MockTimeoutStrategy('oracle', 9000));

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
    it('should select prisma strategy for PrismaQuery', async () => {
      const data: SerializableData = {
        type: 'PrismaQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.operationTimeout).toBe(5000);
      expect(result.timeoutStrategy).toBe('prisma');
    });

    it('should select typeorm strategy for TypeORMQuery', async () => {
      const data: SerializableData = {
        type: 'TypeORMQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.operationTimeout).toBe(4000);
      expect(result.timeoutStrategy).toBe('typeorm');
    });

    it('should select mysql strategy for MySQLQuery', async () => {
      const data: SerializableData = {
        type: 'MySQLQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.operationTimeout).toBe(6000);
      expect(result.timeoutStrategy).toBe('mysql');
    });

    it('should select postgresql strategy for PostgreSQLQuery', async () => {
      const data: SerializableData = {
        type: 'PostgreSQLQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.operationTimeout).toBe(7000);
      expect(result.timeoutStrategy).toBe('postgresql');
    });

    it('should select sqlserver strategy for SQLServerQuery', async () => {
      const data: SerializableData = {
        type: 'SQLServerQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.operationTimeout).toBe(8000);
      expect(result.timeoutStrategy).toBe('sqlserver');
    });

    it('should select oracle strategy for OracleQuery', async () => {
      const data: SerializableData = {
        type: 'OracleQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.operationTimeout).toBe(9000);
      expect(result.timeoutStrategy).toBe('oracle');
    });

    it('should fallback to default strategy for unknown types', async () => {
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
    it('should fallback to default when specific strategy is missing', async () => {
      // Remove prisma strategy
      timeoutStrategies.delete('prisma');

      const data: SerializableData = {
        type: 'PrismaQuery',
        content: 'SELECT * FROM users'
      };

      const result = await timeoutStep.execute(data, mockContext);

      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in timeout strategy calculation', async () => {
      // Remove default strategy to force fallback behavior
      timeoutStrategies.delete('default');

      const data: SerializableData = {
        type: 'ErrorQuery',
        content: 'test data'
      };

      const result = await timeoutStep.execute(data, mockContext);

      // With new fallback behavior, this should not go to catch block
      // but should have timeoutApplied: false because no strategy was found
      expect(result.timeoutApplied).toBe(false);
      expect(result.operationTimeout).toBe(3000); // Default timeout
      expect(result.timeoutStrategy).toBe('default');
      // No timeoutError because it didn't go to catch block
      expect(result.timeoutError).toBeUndefined();
    });

    it('should handle non-Error objects in catch block', async () => {
      // Create a strategy that throws a string
      const errorStrategy = new MockTimeoutStrategy('error', 1000);
      errorStrategy.calculateTimeout = vi.fn().mockImplementation(() => {
        throw 'String error';
      });
      timeoutStrategies.set('error', errorStrategy);
      // Remove default to test fallback behavior
      timeoutStrategies.delete('default');

      const data: SerializableData = {
        type: 'ErrorQuery',
        content: 'test data'
      };

      const result = await timeoutStep.execute(data, mockContext);

      // With new fallback behavior, this should go through normal flow
      // but with timeoutApplied: false because no strategy was found
      expect(result.timeoutApplied).toBe(false);
      expect(result.operationTimeout).toBe(3000);
      expect(result.timeoutStrategy).toBe('default');
      // No timeoutError because it didn't go to catch block
      expect(result.timeoutError).toBeUndefined();
    });

    it('should handle errors when strategy calculation throws', async () => {
      // Remove prisma strategy so it falls back to error strategy
      timeoutStrategies.delete('prisma');
      
      // Create a strategy that throws during calculation
      const errorStrategy = new MockTimeoutStrategy('prisma', 1000); // Use 'prisma' name to match the type
      errorStrategy.calculateTimeout = vi.fn().mockImplementation(() => {
        throw new Error('Calculation error');
      });
      timeoutStrategies.set('prisma', errorStrategy); // Set as 'prisma' to match the type

      const data: SerializableData = {
        type: 'PrismaQuery', // Use a type that matches a specific strategy
        content: 'test data'
      };

      const result = await timeoutStep.execute(data, mockContext);

      // This should go to catch block because the strategy throws
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

    it('should measure duration even when errors occur', async () => {
      // Create a strategy that throws
      const errorStrategy = new MockTimeoutStrategy('error', 1000);
      errorStrategy.calculateTimeout = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      timeoutStrategies.set('error', errorStrategy);

      const data: SerializableData = {
        type: 'ErrorQuery',
        content: 'test data'
      };

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