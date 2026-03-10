import { PipelineStep } from '../SerializationPipeline';
import { SerializationPipelineContext } from '../../types';
import { DataSanitizer } from '../utils/DataSanitizer';
import { SerializableData } from '../../types';

/** Mutates data (when object) with step metadata to avoid an extra allocation per log. */
function withResult(
  data: SerializableData,
  duration: number,
  sanitized: boolean,
  sanitizationError?: string
): SerializableData {
  if (typeof data === 'object' && data !== null) {
    const base = data as Record<string, unknown>;
    base.sanitizationDuration = duration;
    base.sanitized = sanitized;
    if (sanitizationError !== undefined)
      base.sanitizationError = sanitizationError;
    return data;
  }
  return {
    sanitizationDuration: duration,
    sanitized,
    ...(sanitizationError !== undefined && { sanitizationError }),
  } as SerializableData;
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

  execute(
    data: SerializableData,
    context: SerializationPipelineContext
  ): SerializableData {
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
