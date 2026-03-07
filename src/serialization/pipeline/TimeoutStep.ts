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

const DEFAULT_TIMEOUT_MS = 3000;

/** Pure: build success payload for timeout step. */
function buildSuccessPayload(
  data: SerializableData,
  duration: number,
  operationTimeout: number,
  strategy: OperationTimeoutStrategy | null
): SerializableData {
  const base =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : {};
  return {
    ...base,
    timeoutDuration: duration,
    operationTimeout,
    timeoutStrategy: strategy?.getStrategyName() ?? 'default',
    timeoutApplied: strategy != null,
  } as SerializableData;
}

/** Pure: build error payload for timeout step (silent observer). */
function buildErrorPayload(
  data: SerializableData,
  duration: number,
  error: unknown
): SerializableData {
  const base =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : {};
  return {
    ...base,
    timeoutDuration: duration,
    operationTimeout: DEFAULT_TIMEOUT_MS,
    timeoutStrategy: 'default',
    timeoutApplied: false,
    timeoutError: error instanceof Error ? error.message : 'Timeout error',
  } as SerializableData;
}

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
      const strategy = this.selectTimeoutStrategy(data);
      const operationTimeout =
        strategy?.calculateTimeout(data) ?? DEFAULT_TIMEOUT_MS;
      const duration = Date.now() - startTime;
      return buildSuccessPayload(data, duration, operationTimeout, strategy);
    } catch (error) {
      const duration = Date.now() - startTime;
      return buildErrorPayload(data, duration, error);
    }
  }

  private selectTimeoutStrategy(
    _data: SerializableData
  ): OperationTimeoutStrategy | null {
    return this.timeoutStrategies.get('default') ?? null;
  }
}
