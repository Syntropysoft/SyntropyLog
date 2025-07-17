import { ISerializer, SerializationContext, SerializationResult, SerializationComplexity } from './types';
import { DataSanitizer } from './utils/DataSanitizer';

export interface PipelineStep<T> {
  name: string;
  execute(data: T, context: PipelineContext): Promise<T>;
}

export interface PipelineContext {
  serializationContext: SerializationContext;
  sanitizeSensitiveData: boolean;
  sanitizationContext?: {
    sensitiveFields?: string[];
    redactPatterns?: RegExp[];
    maxStringLength?: number;
    enableDeepSanitization?: boolean;
  };
  enableMetrics: boolean;
}

export interface OperationTimeoutStrategy {
  calculateTimeout(data: any): number;
  getStrategyName(): string;
}

export interface PipelineMetrics {
  stepDurations: { [stepName: string]: number };
  totalDuration: number;
  operationTimeout: number;
  timeoutStrategy: string;
}

export class SerializationPipeline {
  private steps: PipelineStep<any>[] = [];
  private timeoutStrategies: Map<string, OperationTimeoutStrategy> = new Map();
  private sanitizer: DataSanitizer;
  private metrics: PipelineMetrics | null = null;

  constructor() {
    this.sanitizer = new DataSanitizer();
    this.initializeDefaultStrategies();
  }

  addStep(step: PipelineStep<any>): void {
    this.steps.push(step);
  }

  addTimeoutStrategy(strategy: OperationTimeoutStrategy): void {
    this.timeoutStrategies.set(strategy.getStrategyName(), strategy);
  }

  async process(data: any, context: PipelineContext): Promise<SerializationResult> {
    const pipelineStartTime = Date.now();
    this.metrics = {
      stepDurations: {},
      totalDuration: 0,
      operationTimeout: 0,
      timeoutStrategy: 'unknown'
    };

    let currentData = data;

    try {
      // Ejecutar SerializationStep primero
      const serializationStep = this.steps.find(step => step.name === 'serialization');
      if (serializationStep) {
        const stepStartTime = Date.now();
        
        currentData = await serializationStep.execute(currentData, context);
        
        const stepDuration = Date.now() - stepStartTime;
        this.metrics!.stepDurations[serializationStep.name] = stepDuration;
      }

      // Si llegamos aquí, la serialización fue exitosa
      // Continuar con los otros steps
      for (const step of this.steps) {
        if (step.name === 'serialization') continue; // Ya se ejecutó
        
        const stepStartTime = Date.now();
        
        currentData = await step.execute(currentData, context);
        
        const stepDuration = Date.now() - stepStartTime;
        this.metrics!.stepDurations[step.name] = stepDuration;
      }

      // Calcular timeout de operación basado en el resultado
      const timeoutStrategy = this.selectTimeoutStrategy(currentData);
      const operationTimeout = timeoutStrategy.calculateTimeout(currentData);
      
      this.metrics.operationTimeout = operationTimeout;
      this.metrics.timeoutStrategy = timeoutStrategy.getStrategyName();
      this.metrics.totalDuration = Date.now() - pipelineStartTime;

      // Obtener la complejidad real del serializador
      const actualComplexity = currentData.serializationComplexity || SerializationComplexity.SIMPLE;
      
      return {
        success: true,
        data: currentData,
        serializer: currentData.serializer || 'pipeline',
        duration: this.metrics.totalDuration,
        complexity: actualComplexity,
        sanitized: context.sanitizeSensitiveData,
        metadata: {
          stepDurations: this.metrics.stepDurations,
          operationTimeout,
          timeoutStrategy: timeoutStrategy.getStrategyName(),
          serializer: currentData.serializer || 'pipeline',
          complexity: actualComplexity
        }
      };
    } catch (error) {
      this.metrics.totalDuration = Date.now() - pipelineStartTime;
      
      // Preservar el nombre del serializador del error
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
          complexity: SerializationComplexity.SIMPLE
        }
      };
    }
  }

  getMetrics(): PipelineMetrics | null {
    return this.metrics;
  }

  private selectTimeoutStrategy(data: any): OperationTimeoutStrategy {
    // Seleccionar estrategia basada en el tipo de datos
    if (data?.type === 'PrismaQuery') {
      return this.timeoutStrategies.get('prisma') || this.timeoutStrategies.get('default')!;
    }
    if (data?.type === 'TypeORMQuery') {
      return this.timeoutStrategies.get('typeorm') || this.timeoutStrategies.get('default')!;
    }
    if (data?.type === 'MySQLQuery') {
      return this.timeoutStrategies.get('mysql') || this.timeoutStrategies.get('default')!;
    }
    if (data?.type === 'PostgreSQLQuery') {
      return this.timeoutStrategies.get('postgresql') || this.timeoutStrategies.get('default')!;
    }
    if (data?.type === 'SQLServerQuery') {
      return this.timeoutStrategies.get('sqlserver') || this.timeoutStrategies.get('default')!;
    }
    if (data?.type === 'OracleQuery') {
      return this.timeoutStrategies.get('oracle') || this.timeoutStrategies.get('default')!;
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

// Estrategias de timeout específicas
export class DefaultTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: any): number {
    return 3000; // 3s por defecto
  }

  getStrategyName(): string {
    return 'default';
  }
}

export class PrismaTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: any): number {
    if (!data || data.type !== 'PrismaQuery') return 3000;

    switch (data.action) {
      case 'findFirst':
      case 'findUnique':
        return 1000; // 1s para queries simples
      case 'findMany':
        return data.args?.take && data.args.take > 100 ? 5000 : 2000; // 2-5s según cantidad
      case 'create':
      case 'update':
      case 'delete':
        return 2000; // 2s para operaciones de escritura
      case 'updateMany':
      case 'deleteMany':
        return 5000; // 5s para operaciones masivas
      case 'upsert':
        return 3000; // 3s para upsert
      case 'aggregate':
      case 'groupBy':
        return 8000; // 8s para agregaciones complejas
      case 'count':
        return 1500; // 1.5s para conteos
      default:
        return 3000;
    }
  }

  getStrategyName(): string {
    return 'prisma';
  }
}

export class TypeORMTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: any): number {
    if (!data || data.type !== 'TypeORMQuery') return 3000;

    const sql = data.sql?.toLowerCase() || '';
    
    if (sql.includes('select') && !sql.includes('join')) {
      return 1000; // 1s para selects simples
    }
    if (sql.includes('join')) {
      const joinCount = (sql.match(/join/g) || []).length;
      return Math.min(1000 + (joinCount * 500), 5000); // 1-5s según joins
    }
    if (sql.includes('insert')) return 2000;
    if (sql.includes('update')) return 2000;
    if (sql.includes('delete')) return 2000;
    
    return 3000;
  }

  getStrategyName(): string {
    return 'typeorm';
  }
}

export class MySQLTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: any): number {
    if (!data || data.type !== 'MySQLQuery') return 3000;

    const sql = data.sql?.toLowerCase() || '';
    
    if (sql.includes('select') && !sql.includes('join')) {
      return 1000;
    }
    if (sql.includes('join')) {
      const joinCount = (sql.match(/join/g) || []).length;
      return Math.min(1000 + (joinCount * 500), 5000);
    }
    if (sql.includes('insert')) return 2000;
    if (sql.includes('update')) return 2000;
    if (sql.includes('delete')) return 2000;
    if (sql.includes('create') || sql.includes('alter') || sql.includes('drop')) {
      return 10000; // 10s para DDL
    }
    
    return 3000;
  }

  getStrategyName(): string {
    return 'mysql';
  }
}

export class PostgreSQLTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: any): number {
    if (!data || data.type !== 'PostgreSQLQuery') return 3000;

    const sql = data.text?.toLowerCase() || '';
    
    // IMPORTANTE: Orden de evaluación de condiciones
    // Las condiciones más específicas deben evaluarse ANTES que las más generales
    // para evitar que queries complejas (con CTEs, window functions, joins) 
    // sean clasificadas incorrectamente como "selects simples"
    
    // Verificar condiciones más específicas primero
    if (sql.includes('with')) {
      return 8000; // 8s para CTEs
    }
    
    if (sql.includes('over(')) {
      return 6000; // 6s para window functions
    }
    
    if (sql.includes('join')) {
      const joinCount = (sql.match(/join/g) || []).length;
      return Math.min(1000 + (joinCount * 500), 5000);
    }
    
    // Solo selects simples (sin joins, sin over, sin with)
    if (sql.includes('select') && !sql.includes('join') && !sql.includes('over(') && !sql.includes('with')) {
      return 1000;
    }
    
    if (sql.includes('insert')) return 2000;
    if (sql.includes('update')) return 2000;
    if (sql.includes('delete')) return 2000;
    
    return 3000;
  }

  getStrategyName(): string {
    return 'postgresql';
  }
}

export class SQLServerTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: any): number {
    if (!data || data.type !== 'SQLServerQuery') return 3000;

    const sql = data.query?.toLowerCase() || '';
    
    if (sql.includes('select') && !sql.includes('join')) {
      return 1000;
    }
    if (sql.includes('exec') || sql.includes('execute')) {
      return 8000; // 8s para stored procedures
    }
    if (sql.includes('join')) {
      const joinCount = (sql.match(/join/g) || []).length;
      return Math.min(1000 + (joinCount * 500), 5000);
    }
    if (sql.includes('insert')) return 2000;
    if (sql.includes('update')) return 2000;
    if (sql.includes('delete')) return 2000;
    if (sql.includes('merge')) return 5000; // 5s para merge
    
    return 3000;
  }

  getStrategyName(): string {
    return 'sqlserver';
  }
}

export class OracleTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(data: any): number {
    if (!data || data.type !== 'OracleQuery') return 3000;

    const sql = data.sql?.toLowerCase() || '';
    
    // Verificar condiciones más específicas primero
    if (sql.includes('begin') || sql.includes('declare')) {
      return 10000; // 10s para PL/SQL
    }
    
    if (sql.includes('over(')) {
      return 8000; // 8s para funciones analíticas
    }
    
    if (sql.includes('join')) {
      const joinCount = (sql.match(/join/g) || []).length;
      return Math.min(1000 + (joinCount * 500), 5000);
    }
    
    // Solo selects simples (sin joins, sin over, sin PL/SQL)
    if (sql.includes('select') && !sql.includes('join') && !sql.includes('over(') && !sql.includes('begin') && !sql.includes('declare')) {
      return 1000;
    }
    
    if (sql.includes('insert')) return 2000;
    if (sql.includes('update')) return 2000;
    if (sql.includes('delete')) return 2000;
    if (sql.includes('merge')) return 5000;
    
    return 3000;
  }

  getStrategyName(): string {
    return 'oracle';
  }
} 