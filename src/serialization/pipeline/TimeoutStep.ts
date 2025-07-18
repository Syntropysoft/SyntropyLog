import { PipelineStep } from '../SerializationPipeline';
import { SerializationPipelineContext } from '../../types';
import { OperationTimeoutStrategy } from '../SerializationPipeline';
import { SerializableData } from '../../types';

export class TimeoutStep implements PipelineStep<SerializableData> {
  name = 'timeout';
  private timeoutStrategies: Map<string, OperationTimeoutStrategy> = new Map();

  constructor(timeoutStrategies: Map<string, OperationTimeoutStrategy>) {
    this.timeoutStrategies = timeoutStrategies;
  }

  async execute(
    data: SerializableData,
    _context: SerializationPipelineContext
  ): Promise<SerializableData> {
    const startTime = Date.now();

    try {
      // 1. Seleccionar estrategia de timeout
      const timeoutStrategy = this.selectTimeoutStrategy(data);

      // 2. Calcular timeout de operación
      const operationTimeout = timeoutStrategy.calculateTimeout(data);

      // 3. Agregar metadata de timeout
      const duration = Date.now() - startTime;

      return {
        ...data,
        timeoutDuration: duration,
        operationTimeout,
        timeoutStrategy: timeoutStrategy.getStrategyName(),
        timeoutApplied: true,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        ...data,
        timeoutDuration: duration,
        operationTimeout: 3000, // Default timeout
        timeoutStrategy: 'default',
        timeoutApplied: false,
        timeoutError:
          error instanceof Error ? error.message : 'Error en timeout',
      };
    }
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
}
