import {
  ISerializer,
  SerializationContext,
  SerializationResult,
  SerializationComplexity,
} from './types';
import { DataSanitizer } from './utils/DataSanitizer';
import {
  SerializableData,
  SerializedData,
  SerializationPipelineContext,
  SanitizationConfig,
} from '../types';

export interface PipelineStep<T> {
  name: string;
  execute(data: T, context: SerializationPipelineContext): Promise<T>;
}

export interface OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number;
  getStrategyName(): string;
}

export interface PipelineMetrics {
  stepDurations: { [stepName: string]: number };
  totalDuration: number;
  operationTimeout: number;
  timeoutStrategy: string;
}

export class SerializationPipeline {
  private steps: PipelineStep<SerializableData>[] = [];
  private timeoutStrategies: Map<string, OperationTimeoutStrategy> = new Map();
  private sanitizer: DataSanitizer;
  private metrics: PipelineMetrics | null = null;

  constructor() {
    this.sanitizer = new DataSanitizer();
    this.initializeDefaultStrategies();
  }

  addStep(step: PipelineStep<SerializableData>): void {
    this.steps.push(step);
  }

  addTimeoutStrategy(strategy: OperationTimeoutStrategy): void {
    this.timeoutStrategies.set(strategy.getStrategyName(), strategy);
  }

  async process(
    data: SerializableData,
    context: SerializationPipelineContext
  ): Promise<SerializationResult> {
    const pipelineStartTime = Date.now();
    const globalTimeout = context?.serializationContext?.timeoutMs || 50; // Use config or default

    this.metrics = {
      stepDurations: {},
      totalDuration: 0,
      operationTimeout: 0,
      timeoutStrategy: 'unknown',
    };

    let currentData = data;

    try {
      // 1. Run steps with time protection (Resilience Engine)
      for (const step of this.steps) {
        const stepStartTime = Date.now();

        // Race step execution against a timeout promise
        const stepExecution = step.execute(currentData, context);

        const timeoutPromise = new Promise<SerializableData>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Timeout in step '${step.name}' (> ${globalTimeout}ms)`));
          }, globalTimeout);
        });

        currentData = await Promise.race([stepExecution, timeoutPromise]);

        const stepDuration = Date.now() - stepStartTime;
        this.metrics.stepDurations[step.name] = stepDuration;
      }

      // 2. Calculate final operation timeout (if applicable)
      const timeoutStrategy = this.selectTimeoutStrategy(currentData);
      const operationTimeout = timeoutStrategy.calculateTimeout(currentData);

      this.metrics.operationTimeout = operationTimeout;
      this.metrics.timeoutStrategy = timeoutStrategy.getStrategyName();
      this.metrics.totalDuration = Date.now() - pipelineStartTime;

      return {
        success: true,
        data: currentData,
        serializer: (currentData as any).serializer || 'pipeline',
        duration: this.metrics.totalDuration,
        complexity: (currentData as any).serializationComplexity || SerializationComplexity.SIMPLE,
        sanitized: context.sanitizeSensitiveData,
        metadata: {
          stepDurations: this.metrics.stepDurations,
          operationTimeout,
          timeoutStrategy: timeoutStrategy.getStrategyName(),
          serializer: (currentData as any).serializer || 'pipeline',
          complexity: (currentData as any).serializationComplexity || SerializationComplexity.SIMPLE,
        },
      };
    } catch (error) {
      this.metrics.totalDuration = Date.now() - pipelineStartTime;
      const serializerName = (error as any).serializer || 'pipeline';

      return {
        success: false,
        data: currentData,
        serializer: serializerName,
        duration: this.metrics.totalDuration,
        complexity: SerializationComplexity.SIMPLE,
        sanitized: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          stepDurations: this.metrics.stepDurations,
          operationTimeout: 0,
          timeoutStrategy: 'unknown',
          serializer: serializerName,
          complexity: SerializationComplexity.SIMPLE,
        },
      };
    }
  }

  getMetrics(): PipelineMetrics | null {
    return this.metrics;
  }

  private selectTimeoutStrategy(
    data: SerializableData
  ): OperationTimeoutStrategy {
    // Select strategy based on data type
    if (data?.type === 'PrismaQuery') {
      return (
        this.timeoutStrategies.get('prisma') ||
        this.timeoutStrategies.get('default')!
      );
    }
    if (data?.type === 'TypeORMQuery') {
      return (
        this.timeoutStrategies.get('typeorm') ||
        this.timeoutStrategies.get('default')!
      );
    }
    if (data?.type === 'MySQLQuery') {
      return (
        this.timeoutStrategies.get('mysql') ||
        this.timeoutStrategies.get('default')!
      );
    }
    if (data?.type === 'PostgreSQLQuery') {
      return (
        this.timeoutStrategies.get('postgresql') ||
        this.timeoutStrategies.get('default')!
      );
    }
    if (data?.type === 'SQLServerQuery') {
      return (
        this.timeoutStrategies.get('sqlserver') ||
        this.timeoutStrategies.get('default')!
      );
    }
    if (data?.type === 'OracleQuery') {
      return (
        this.timeoutStrategies.get('oracle') ||
        this.timeoutStrategies.get('default')!
      );
    }

    return this.timeoutStrategies.get('default')!;
  }

  private initializeDefaultStrategies(): void {
    // Default strategy
    this.addTimeoutStrategy(new DefaultTimeoutStrategy());

    // Database-specific strategies
    this.addTimeoutStrategy(new PrismaTimeoutStrategy());
    this.addTimeoutStrategy(new TypeORMTimeoutStrategy());
    this.addTimeoutStrategy(new MySQLTimeoutStrategy());
    this.addTimeoutStrategy(new PostgreSQLTimeoutStrategy());
    this.addTimeoutStrategy(new SQLServerTimeoutStrategy());
    this.addTimeoutStrategy(new OracleTimeoutStrategy());
  }
}

export class DefaultTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    return 5000; // 5 seconds default
  }

  getStrategyName(): string {
    return 'default';
  }
}

export class PrismaTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // Prisma-specific logic
    if (data?.operation === 'findMany') {
      return 10000; // 10 seconds for multi-row queries
    }
    if (data?.operation === 'aggregate') {
      return 15000; // 15 seconds for aggregations
    }
    if (data?.operation === 'createMany') {
      return 20000; // 20 seconds for bulk inserts
    }
    if (data?.operation === 'updateMany') {
      return 15000; // 15 seconds for bulk updates
    }
    if (data?.operation === 'deleteMany') {
      return 10000; // 10 seconds for bulk deletes
    }
    if (data?.operation === 'findFirst') {
      return 5000; // 5 seconds for simple queries
    }
    if (data?.operation === 'findUnique') {
      return 3000; // 3 seconds for unique-key lookups
    }
    if (data?.operation === 'create') {
      return 5000; // 5 seconds for single inserts
    }
    if (data?.operation === 'update') {
      return 5000; // 5 seconds for single updates
    }
    if (data?.operation === 'delete') {
      return 3000; // 3 seconds for single deletes
    }

    return 8000; // 8 seconds default for Prisma
  }

  getStrategyName(): string {
    return 'prisma';
  }
}

export class TypeORMTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // TypeORM-specific logic
    if (data?.operation === 'find') {
      return 8000; // 8 seconds for queries
    }
    if (data?.operation === 'save') {
      return 10000; // 10 seconds for save
    }

    return 7000; // 7 seconds default for TypeORM
  }

  getStrategyName(): string {
    return 'typeorm';
  }
}

export class MySQLTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // MySQL-specific logic
    if (data?.query?.toLowerCase().includes('select')) {
      if (data?.query?.toLowerCase().includes('count(*)')) {
        return 12000; // 12 seconds for COUNT
      }
      if (data?.query?.toLowerCase().includes('group by')) {
        return 15000; // 15 seconds for GROUP BY
      }
      if (data?.query?.toLowerCase().includes('order by')) {
        return 10000; // 10 seconds for ORDER BY
      }
      if (data?.query?.toLowerCase().includes('limit')) {
        return 8000; // 8 seconds for queries with LIMIT
      }
      return 6000; // 6 seconds for simple SELECT
    }
    if (data?.query?.toLowerCase().includes('insert')) {
      if (data?.query?.toLowerCase().includes('values')) {
        const valuesCount = (data.query.match(/values/gi) || []).length;
        return Math.min(5000 + valuesCount * 100, 20000); // 5-20 seconds based on value count
      }
      return 8000; // 8 seconds for simple INSERT
    }
    if (data?.query?.toLowerCase().includes('update')) {
      return 10000; // 10 seconds for UPDATE
    }
    if (data?.query?.toLowerCase().includes('delete')) {
      return 8000; // 8 seconds for DELETE
    }

    return 7000; // 7 seconds default for MySQL
  }

  getStrategyName(): string {
    return 'mysql';
  }
}

export class PostgreSQLTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // PostgreSQL-specific logic
    if (data?.query?.toLowerCase().includes('select')) {
      if (data?.query?.toLowerCase().includes('count(*)')) {
        return 10000; // 10 seconds for COUNT
      }
      if (data?.query?.toLowerCase().includes('group by')) {
        return 12000; // 12 seconds for GROUP BY
      }
      if (data?.query?.toLowerCase().includes('order by')) {
        return 8000; // 8 seconds for ORDER BY
      }
      if (data?.query?.toLowerCase().includes('limit')) {
        return 6000; // 6 seconds for queries with LIMIT
      }
      if (data?.query?.toLowerCase().includes('window')) {
        return 15000; // 15 seconds for window functions
      }
      if (data?.query?.toLowerCase().includes('cte')) {
        return 18000; // 18 seconds for CTEs
      }
      return 5000; // 5 seconds for simple SELECT
    }
    if (data?.query?.toLowerCase().includes('insert')) {
      if (data?.query?.toLowerCase().includes('values')) {
        const valuesCount = (data.query.match(/values/gi) || []).length;
        return Math.min(4000 + valuesCount * 80, 15000); // 4-15 seconds based on value count
      }
      return 6000; // 6 seconds for simple INSERT
    }
    if (data?.query?.toLowerCase().includes('update')) {
      return 8000; // 8 seconds for UPDATE
    }
    if (data?.query?.toLowerCase().includes('delete')) {
      return 6000; // 6 seconds for DELETE
    }

    return 6000; // 6 seconds default for PostgreSQL
  }

  getStrategyName(): string {
    return 'postgresql';
  }
}

export class SQLServerTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // SQL Server-specific logic
    if (data?.query?.toLowerCase().includes('select')) {
      if (data?.query?.toLowerCase().includes('count(*)')) {
        return 12000; // 12 seconds for COUNT
      }
      if (data?.query?.toLowerCase().includes('group by')) {
        return 15000; // 15 seconds for GROUP BY
      }
      if (data?.query?.toLowerCase().includes('order by')) {
        return 10000; // 10 seconds for ORDER BY
      }
      return 8000; // 8 seconds for simple SELECT
    }
    if (data?.query?.toLowerCase().includes('insert')) {
      return 10000; // 10 seconds for INSERT
    }
    if (data?.query?.toLowerCase().includes('update')) {
      return 12000; // 12 seconds for UPDATE
    }
    if (data?.query?.toLowerCase().includes('delete')) {
      return 10000; // 10 seconds for DELETE
    }

    return 9000; // 9 seconds default for SQL Server
  }

  getStrategyName(): string {
    return 'sqlserver';
  }
}

export class OracleTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // Oracle-specific logic
    if (data?.query?.toLowerCase().includes('select')) {
      if (data?.query?.toLowerCase().includes('count(*)')) {
        return 15000; // 15 seconds for COUNT
      }
      if (data?.query?.toLowerCase().includes('group by')) {
        return 18000; // 18 seconds for GROUP BY
      }
      if (data?.query?.toLowerCase().includes('order by')) {
        return 12000; // 12 seconds for ORDER BY
      }
      if (data?.query?.toLowerCase().includes('rownum')) {
        return 10000; // 10 seconds for queries with ROWNUM
      }
      if (data?.query?.toLowerCase().includes('connect by')) {
        return 20000; // 20 seconds for hierarchical queries
      }
      return 10000; // 10 seconds for simple SELECT
    }
    if (data?.query?.toLowerCase().includes('insert')) {
      return 12000; // 12 seconds for INSERT
    }
    if (data?.query?.toLowerCase().includes('update')) {
      return 15000; // 15 seconds for UPDATE
    }
    if (data?.query?.toLowerCase().includes('delete')) {
      return 12000; // 12 seconds for DELETE
    }

    return 12000; // 12 seconds default for Oracle
  }

  getStrategyName(): string {
    return 'oracle';
  }
}
