import { PipelineStep } from '../SerializationPipeline';
import { SerializationPipelineContext } from '../../types';
import { DataSanitizer } from '../utils/DataSanitizer';
import { SerializableData } from '../../types';

/** Pure: builds the step result with consistent shape (single place for metrics). */
function withResult(
  data: SerializableData,
  duration: number,
  sanitized: boolean,
  sanitizationError?: string
): SerializableData {
  const base =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : {};
  const result = {
    ...base,
    sanitizationDuration: duration,
    sanitized,
  };
  if (sanitizationError !== undefined) {
    (result as Record<string, unknown>).sanitizationError = sanitizationError;
  }
  return result as SerializableData;
}

/** Pure: normalizes an unknown error to a string message. */
function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SanitizationStep implements PipelineStep<SerializableData> {
  readonly name = 'sanitization';
  private readonly sanitizer: DataSanitizer;

  constructor(sanitizer?: DataSanitizer) {
    this.sanitizer = sanitizer ?? new DataSanitizer();
  }

  async execute(
    data: SerializableData,
    context: SerializationPipelineContext
  ): Promise<SerializableData> {
    const startTime = Date.now();
    const elapsed = (): number => Date.now() - startTime; // impure: reads time

    if (!context.sanitizeSensitiveData) {
      return withResult(data, elapsed(), false);
    }

    try {
      const sanitizedData = this.sanitizer.sanitize(
        data,
        context.sanitizationContext
      );
      return withResult(sanitizedData, elapsed(), true);
    } catch (error) {
      return withResult(data, elapsed(), false, toErrorMessage(error));
    }
  }
}
