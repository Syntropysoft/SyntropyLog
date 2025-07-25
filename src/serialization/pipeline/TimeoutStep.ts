/**
 * TimeoutStep - Pipeline step for calculating operation timeouts
 *
 * PHILOSOPHY: "Like a journalist - reports what happened and nothing more"
 *
 * This step follows the framework's core principle of being a silent observer.
 * If anything fails in the timeout calculation:
 * - The application continues running (never interrupted)
 * - The step reports what happened via metadata
 * - Fallback to default timeout (3000ms) is applied silently
 * - No errors are thrown that could disrupt the main application flow
 *
 * The step is designed to be resilient and provide useful information
 * even when timeout strategies are not properly configured.
 */

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
      const operationTimeout = timeoutStrategy?.calculateTimeout(data) || 3000; // Default timeout if strategy is null

      // 3. Agregar metadata de timeout
      const duration = Date.now() - startTime;

      return {
        ...data,
        timeoutDuration: duration,
        operationTimeout,
        timeoutStrategy: timeoutStrategy?.getStrategyName() || 'default',
        timeoutApplied: timeoutStrategy !== null,
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
  ): OperationTimeoutStrategy | null {
    // Seleccionar estrategia basada en el tipo de datos
    if (data?.type === 'PrismaQuery') {
      return (
        this.timeoutStrategies.get('prisma') ||
        this.timeoutStrategies.get('default') ||
        null
      );
    }
    if (data?.type === 'TypeORMQuery') {
      return (
        this.timeoutStrategies.get('typeorm') ||
        this.timeoutStrategies.get('default') ||
        null
      );
    }
    if (data?.type === 'MySQLQuery') {
      return (
        this.timeoutStrategies.get('mysql') ||
        this.timeoutStrategies.get('default') ||
        null
      );
    }
    if (data?.type === 'PostgreSQLQuery') {
      return (
        this.timeoutStrategies.get('postgresql') ||
        this.timeoutStrategies.get('default') ||
        null
      );
    }
    if (data?.type === 'SQLServerQuery') {
      return (
        this.timeoutStrategies.get('sqlserver') ||
        this.timeoutStrategies.get('default') ||
        null
      );
    }
    if (data?.type === 'OracleQuery') {
      return (
        this.timeoutStrategies.get('oracle') ||
        this.timeoutStrategies.get('default') ||
        null
      );
    }

    return this.timeoutStrategies.get('default') || null;
  }
}
