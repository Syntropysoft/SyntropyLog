/**
 * Serialization pipeline: "cadena de producción".
 * El entry de log es un único paquete que recorre la cadena: cada paso lo recibe,
 * lo modifica in-place si corresponde y lo pasa al siguiente. Si todo sale bien,
 * el mismo objeto (enriquecido) llega al final sin copias intermedias.
 */
import { SerializationResult, SerializationComplexity } from './types';
import { DataSanitizer } from './utils/DataSanitizer';
import { SerializableData, SerializationPipelineContext } from '../types';

export interface PipelineStep<T> {
  name: string;
  /** Recibe el paquete, lo modifica si aplica y devuelve el mismo u otro para el siguiente eslabón. */
  execute(data: T, context: SerializationPipelineContext): T;
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

const DEFAULT_SERIALIZER = 'pipeline';
const UNKNOWN_STRATEGY = 'unknown';

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

  /**
   * Ejecuta la cadena de producción de forma 100% síncrona en memoria.
   * Sin Promesas ni timers en el camino: evita encolar millones de microtareas en cargas masivas.
   */
  process(
    data: SerializableData,
    context: SerializationPipelineContext
  ): SerializationResult {
    const pipelineStartTime = Date.now();

    this.metrics = {
      stepDurations: {},
      totalDuration: 0,
      operationTimeout: 0,
      timeoutStrategy: UNKNOWN_STRATEGY,
    };

    let currentData = data;

    try {
      for (const step of this.steps) {
        const stepStartTime = Date.now();
        currentData = step.execute(currentData, context);
        this.metrics.stepDurations[step.name] = Date.now() - stepStartTime;
      }

      const timeoutStrategy = this.selectTimeoutStrategy(currentData);
      const operationTimeout = timeoutStrategy.calculateTimeout(currentData);
      this.metrics.operationTimeout = operationTimeout;
      this.metrics.timeoutStrategy = timeoutStrategy.getStrategyName();
      this.metrics.totalDuration = Date.now() - pipelineStartTime;

      return SerializationPipeline.buildSuccessResult(
        currentData,
        context.sanitizeSensitiveData,
        this.metrics,
        operationTimeout,
        timeoutStrategy.getStrategyName()
      );
    } catch (error) {
      this.metrics.totalDuration = Date.now() - pipelineStartTime;
      return SerializationPipeline.buildErrorResult(
        currentData,
        error,
        this.metrics
      );
    }
  }

  getMetrics(): PipelineMetrics | null {
    return this.metrics;
  }

  /** Pure: build success result from pipeline run. */
  private static buildSuccessResult(
    data: SerializableData,
    sanitized: boolean,
    metrics: PipelineMetrics,
    operationTimeout: number,
    timeoutStrategyName: string
  ): SerializationResult {
    const d = data as Record<string, unknown>;
    const serializer =
      (d.serializer as string | undefined) ?? DEFAULT_SERIALIZER;
    const complexity =
      (d.serializationComplexity as string | undefined) ??
      SerializationComplexity.SIMPLE;
    return {
      success: true,
      data,
      serializer,
      duration: metrics.totalDuration,
      complexity,
      sanitized,
      metadata: {
        stepDurations: metrics.stepDurations,
        operationTimeout,
        timeoutStrategy: timeoutStrategyName,
        serializer,
        complexity,
      },
    };
  }

  /** Pure: build error result from pipeline run. */
  private static buildErrorResult(
    data: SerializableData,
    error: unknown,
    metrics: PipelineMetrics
  ): SerializationResult {
    const serializerName =
      (error as { serializer?: string })?.serializer ?? DEFAULT_SERIALIZER;
    return {
      success: false,
      data,
      serializer: serializerName,
      duration: metrics.totalDuration,
      complexity: SerializationComplexity.SIMPLE,
      sanitized: false,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        stepDurations: metrics.stepDurations,
        operationTimeout: 0,
        timeoutStrategy: UNKNOWN_STRATEGY,
        serializer: serializerName,
        complexity: SerializationComplexity.SIMPLE,
      },
    };
  }

  private selectTimeoutStrategy(
    _data: SerializableData
  ): OperationTimeoutStrategy {
    const strategy = this.timeoutStrategies.get('default');
    if (strategy == null) {
      throw new Error(
        'SerializationPipeline: default timeout strategy is required'
      );
    }
    return strategy;
  }

  private initializeDefaultStrategies(): void {
    this.addTimeoutStrategy(new DefaultTimeoutStrategy());
  }
}

export class DefaultTimeoutStrategy implements OperationTimeoutStrategy {
  calculateTimeout(_data: SerializableData): number {
    return 5000; // 5 seconds default
  }

  getStrategyName(): string {
    return 'default';
  }
}
