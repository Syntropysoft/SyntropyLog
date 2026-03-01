import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SerializationPipeline,
  DefaultTimeoutStrategy,
  PrismaTimeoutStrategy,
  TypeORMTimeoutStrategy,
  MySQLTimeoutStrategy,
  PostgreSQLTimeoutStrategy,
  SQLServerTimeoutStrategy,
  OracleTimeoutStrategy,
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
        enableMetrics: true
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
      expect(result.metadata.stepDurations?.['slow']).toBeGreaterThan(0);
    });
  });

  describe('Timeout Strategies', () => {
    it('should select correct strategy for Prisma queries', async () => {
      const prismaData = { type: 'PrismaQuery', action: 'findMany' };
      const result = await pipeline.process(prismaData, { serializationContext: {} } as SerializationPipelineContext);

      expect(result.success).toBe(true);
      expect(result.metadata.timeoutStrategy).toBe('prisma');
    });

    it('should select correct strategy for TypeORM queries', async () => {
      const typeormData = { type: 'TypeORMQuery', sql: 'SELECT * FROM users' };
      const result = await pipeline.process(typeormData, { serializationContext: {} } as SerializationPipelineContext);

      expect(result.success).toBe(true);
      expect(result.metadata.timeoutStrategy).toBe('typeorm');
    });

    it('should select correct strategy for MySQL queries', async () => {
      const mysqlData = { type: 'MySQLQuery', sql: 'SELECT * FROM users' };
      const result = await pipeline.process(mysqlData, { serializationContext: {} } as SerializationPipelineContext);

      expect(result.success).toBe(true);
      expect(result.metadata.timeoutStrategy).toBe('mysql');
    });

    it('should select correct strategy for PostgreSQL queries', async () => {
      const postgresData = { type: 'PostgreSQLQuery', text: 'SELECT * FROM users' };
      const result = await pipeline.process(postgresData, { serializationContext: {} } as SerializationPipelineContext);

      expect(result.success).toBe(true);
      expect(result.metadata.timeoutStrategy).toBe('postgresql');
    });

    it('should select correct strategy for SQL Server queries', async () => {
      const sqlserverData = { type: 'SQLServerQuery', query: 'SELECT * FROM users' };
      const result = await pipeline.process(sqlserverData, { serializationContext: {} } as SerializationPipelineContext);

      expect(result.success).toBe(true);
      expect(result.metadata.timeoutStrategy).toBe('sqlserver');
    });

    it('should select correct strategy for Oracle queries', async () => {
      const oracleData = { type: 'OracleQuery', sql: 'SELECT * FROM users' };
      const result = await pipeline.process(oracleData, { serializationContext: {} } as SerializationPipelineContext);

      expect(result.success).toBe(true);
      expect(result.metadata.timeoutStrategy).toBe('oracle');
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

  describe('PrismaTimeoutStrategy', () => {
    let strategy: PrismaTimeoutStrategy;

    beforeEach(() => {
      strategy = new PrismaTimeoutStrategy();
    });

    it('should return correct timeout for findFirst', () => {
      const query = { type: 'PrismaQuery', operation: 'findFirst' };
      expect(strategy.calculateTimeout(query)).toBe(5000);
    });

    it('should return correct timeout for findMany with large take', () => {
      const query = { type: 'PrismaQuery', operation: 'findMany', args: { take: 200 } };
      expect(strategy.calculateTimeout(query)).toBe(10000);
    });

    it('should return correct timeout for aggregate', () => {
      const query = { type: 'PrismaQuery', operation: 'aggregate' };
      expect(strategy.calculateTimeout(query)).toBe(15000);
    });

    it('should return default timeout for non-Prisma data', () => {
      expect(strategy.calculateTimeout({ type: 'OtherQuery' })).toBe(8000);
    });
  });

  describe('TypeORMTimeoutStrategy', () => {
    let strategy: TypeORMTimeoutStrategy;

    beforeEach(() => {
      strategy = new TypeORMTimeoutStrategy();
    });

    it('should return correct timeout for simple select', () => {
      const query = { type: 'TypeORMQuery', operation: 'find' };
      expect(strategy.calculateTimeout(query)).toBe(8000);
    });

    it('should return correct timeout for insert', () => {
      const query = { type: 'TypeORMQuery', operation: 'save' };
      expect(strategy.calculateTimeout(query)).toBe(10000);
    });
  });

  describe('MySQLTimeoutStrategy', () => {
    let strategy: MySQLTimeoutStrategy;

    beforeEach(() => {
      strategy = new MySQLTimeoutStrategy();
    });

    it('should return correct timeout for DDL operations', () => {
      const query = { type: 'MySQLQuery', query: 'CREATE TABLE users (id INT)' };
      expect(strategy.calculateTimeout(query)).toBe(7000);
    });
  });

  describe('PostgreSQLTimeoutStrategy', () => {
    let strategy: PostgreSQLTimeoutStrategy;

    beforeEach(() => {
      strategy = new PostgreSQLTimeoutStrategy();
    });

    it('should return correct timeout for CTEs', () => {
      const query = {
        type: 'PostgreSQLQuery',
        query: 'WITH cte AS (SELECT * FROM users) SELECT * FROM cte'
      };
      expect(strategy.calculateTimeout(query)).toBe(18000);
    });
  });

  describe('SQLServerTimeoutStrategy', () => {
    let strategy: SQLServerTimeoutStrategy;

    beforeEach(() => {
      strategy = new SQLServerTimeoutStrategy();
    });

    it('should return correct timeout for stored procedures', () => {
      const query = { type: 'SQLServerQuery', query: 'EXEC GetUserData @id = 1' };
      expect(strategy.calculateTimeout(query)).toBe(9000);
    });
  });

  describe('OracleTimeoutStrategy', () => {
    let strategy: OracleTimeoutStrategy;

    beforeEach(() => {
      strategy = new OracleTimeoutStrategy();
    });

    it('should return correct timeout for PL/SQL', () => {
      const query = {
        type: 'OracleQuery',
        query: 'BEGIN SELECT * FROM users; END;'
      };
      expect(strategy.calculateTimeout(query)).toBe(10000);
    });
  });
});