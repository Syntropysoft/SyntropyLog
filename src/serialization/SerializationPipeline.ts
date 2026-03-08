import { SerializationResult, SerializationComplexity } from './types';
import { DataSanitizer } from './utils/DataSanitizer';
import { SerializableData, SerializationPipelineContext } from '../types';

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

  async process(
    data: SerializableData,
    context: SerializationPipelineContext
  ): Promise<SerializationResult> {
    const pipelineStartTime = Date.now();
    const globalTimeout = context?.serializationContext?.timeoutMs ?? 50;

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

        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise<SerializableData>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Timeout in step '${step.name}' (> ${globalTimeout}ms)`
                )
              ),
            globalTimeout
          );
        });

        try {
          const stepExecution = step.execute(currentData, context);
          currentData = await Promise.race([stepExecution, timeoutPromise]);
        } finally {
          // @ts-expect-error - timer is definitely assigned before use
          clearTimeout(timer);
        }

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
