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
      // 1. Ejecutar pasos con protección de tiempo (Resilience Engine)
      for (const step of this.steps) {
        const stepStartTime = Date.now();

        // Creamos una promesa que corre el step y otra que hace de "carrera de mates"
        const stepExecution = step.execute(currentData, context);

        const timeoutPromise = new Promise<SerializableData>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Timeout en etapa '${step.name}' (> ${globalTimeout}ms)`));
          }, globalTimeout);
        });

        // La carrera de los mates declarativa
        currentData = await Promise.race([stepExecution, timeoutPromise]);

        const stepDuration = Date.now() - stepStartTime;
        this.metrics.stepDurations[step.name] = stepDuration;
      }

      // 2. Calcular timeout de operación final (si aplica)
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
    // Seleccionar estrategia basada en el tipo de datos
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
    // Estrategia por defecto
    this.addTimeoutStrategy(new DefaultTimeoutStrategy());

    // Estrategias específicas por base de datos
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
    return 5000; // 5 segundos por defecto
  }

  getStrategyName(): string {
    return 'default';
  }
}

export class PrismaTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // Lógica específica para Prisma
    if (data?.operation === 'findMany') {
      return 10000; // 10 segundos para consultas múltiples
    }
    if (data?.operation === 'aggregate') {
      return 15000; // 15 segundos para agregaciones
    }
    if (data?.operation === 'createMany') {
      return 20000; // 20 segundos para inserciones masivas
    }
    if (data?.operation === 'updateMany') {
      return 15000; // 15 segundos para actualizaciones masivas
    }
    if (data?.operation === 'deleteMany') {
      return 10000; // 10 segundos para eliminaciones masivas
    }
    if (data?.operation === 'findFirst') {
      return 5000; // 5 segundos para consultas simples
    }
    if (data?.operation === 'findUnique') {
      return 3000; // 3 segundos para consultas por clave única
    }
    if (data?.operation === 'create') {
      return 5000; // 5 segundos para inserciones simples
    }
    if (data?.operation === 'update') {
      return 5000; // 5 segundos para actualizaciones simples
    }
    if (data?.operation === 'delete') {
      return 3000; // 3 segundos para eliminaciones simples
    }

    return 8000; // 8 segundos por defecto para Prisma
  }

  getStrategyName(): string {
    return 'prisma';
  }
}

export class TypeORMTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // Lógica específica para TypeORM
    if (data?.operation === 'find') {
      return 8000; // 8 segundos para consultas
    }
    if (data?.operation === 'save') {
      return 10000; // 10 segundos para guardar
    }

    return 7000; // 7 segundos por defecto para TypeORM
  }

  getStrategyName(): string {
    return 'typeorm';
  }
}

export class MySQLTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // Lógica específica para MySQL
    if (data?.query?.toLowerCase().includes('select')) {
      if (data?.query?.toLowerCase().includes('count(*)')) {
        return 12000; // 12 segundos para COUNT
      }
      if (data?.query?.toLowerCase().includes('group by')) {
        return 15000; // 15 segundos para GROUP BY
      }
      if (data?.query?.toLowerCase().includes('order by')) {
        return 10000; // 10 segundos para ORDER BY
      }
      if (data?.query?.toLowerCase().includes('limit')) {
        return 8000; // 8 segundos para consultas con LIMIT
      }
      return 6000; // 6 segundos para SELECT simples
    }
    if (data?.query?.toLowerCase().includes('insert')) {
      if (data?.query?.toLowerCase().includes('values')) {
        const valuesCount = (data.query.match(/values/gi) || []).length;
        return Math.min(5000 + valuesCount * 100, 20000); // 5-20 segundos basado en cantidad de valores
      }
      return 8000; // 8 segundos para INSERT simples
    }
    if (data?.query?.toLowerCase().includes('update')) {
      return 10000; // 10 segundos para UPDATE
    }
    if (data?.query?.toLowerCase().includes('delete')) {
      return 8000; // 8 segundos para DELETE
    }

    return 7000; // 7 segundos por defecto para MySQL
  }

  getStrategyName(): string {
    return 'mysql';
  }
}

export class PostgreSQLTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // Lógica específica para PostgreSQL
    if (data?.query?.toLowerCase().includes('select')) {
      if (data?.query?.toLowerCase().includes('count(*)')) {
        return 10000; // 10 segundos para COUNT
      }
      if (data?.query?.toLowerCase().includes('group by')) {
        return 12000; // 12 segundos para GROUP BY
      }
      if (data?.query?.toLowerCase().includes('order by')) {
        return 8000; // 8 segundos para ORDER BY
      }
      if (data?.query?.toLowerCase().includes('limit')) {
        return 6000; // 6 segundos para consultas con LIMIT
      }
      if (data?.query?.toLowerCase().includes('window')) {
        return 15000; // 15 segundos para window functions
      }
      if (data?.query?.toLowerCase().includes('cte')) {
        return 18000; // 18 segundos para CTEs
      }
      return 5000; // 5 segundos para SELECT simples
    }
    if (data?.query?.toLowerCase().includes('insert')) {
      if (data?.query?.toLowerCase().includes('values')) {
        const valuesCount = (data.query.match(/values/gi) || []).length;
        return Math.min(4000 + valuesCount * 80, 15000); // 4-15 segundos basado en cantidad de valores
      }
      return 6000; // 6 segundos para INSERT simples
    }
    if (data?.query?.toLowerCase().includes('update')) {
      return 8000; // 8 segundos para UPDATE
    }
    if (data?.query?.toLowerCase().includes('delete')) {
      return 6000; // 6 segundos para DELETE
    }

    return 6000; // 6 segundos por defecto para PostgreSQL
  }

  getStrategyName(): string {
    return 'postgresql';
  }
}

export class SQLServerTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // Lógica específica para SQL Server
    if (data?.query?.toLowerCase().includes('select')) {
      if (data?.query?.toLowerCase().includes('count(*)')) {
        return 12000; // 12 segundos para COUNT
      }
      if (data?.query?.toLowerCase().includes('group by')) {
        return 15000; // 15 segundos para GROUP BY
      }
      if (data?.query?.toLowerCase().includes('order by')) {
        return 10000; // 10 segundos para ORDER BY
      }
      return 8000; // 8 segundos para SELECT simples
    }
    if (data?.query?.toLowerCase().includes('insert')) {
      return 10000; // 10 segundos para INSERT
    }
    if (data?.query?.toLowerCase().includes('update')) {
      return 12000; // 12 segundos para UPDATE
    }
    if (data?.query?.toLowerCase().includes('delete')) {
      return 10000; // 10 segundos para DELETE
    }

    return 9000; // 9 segundos por defecto para SQL Server
  }

  getStrategyName(): string {
    return 'sqlserver';
  }
}

export class OracleTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: SerializableData): number {
    // Lógica específica para Oracle
    if (data?.query?.toLowerCase().includes('select')) {
      if (data?.query?.toLowerCase().includes('count(*)')) {
        return 15000; // 15 segundos para COUNT
      }
      if (data?.query?.toLowerCase().includes('group by')) {
        return 18000; // 18 segundos para GROUP BY
      }
      if (data?.query?.toLowerCase().includes('order by')) {
        return 12000; // 12 segundos para ORDER BY
      }
      if (data?.query?.toLowerCase().includes('rownum')) {
        return 10000; // 10 segundos para consultas con ROWNUM
      }
      if (data?.query?.toLowerCase().includes('connect by')) {
        return 20000; // 20 segundos para consultas jerárquicas
      }
      return 10000; // 10 segundos para SELECT simples
    }
    if (data?.query?.toLowerCase().includes('insert')) {
      return 12000; // 12 segundos para INSERT
    }
    if (data?.query?.toLowerCase().includes('update')) {
      return 15000; // 15 segundos para UPDATE
    }
    if (data?.query?.toLowerCase().includes('delete')) {
      return 12000; // 12 segundos para DELETE
    }

    return 12000; // 12 segundos por defecto para Oracle
  }

  getStrategyName(): string {
    return 'oracle';
  }
}
