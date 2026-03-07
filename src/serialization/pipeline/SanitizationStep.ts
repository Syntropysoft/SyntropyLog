import { PipelineStep } from '../SerializationPipeline';
import { SerializationPipelineContext } from '../../types';
import { DataSanitizer } from '../utils/DataSanitizer';
import { SerializableData } from '../../types';

export class SanitizationStep implements PipelineStep<SerializableData> {
  name = 'sanitization';
  private sanitizer: DataSanitizer;

  constructor() {
    this.sanitizer = new DataSanitizer();
  }

  async execute(
    data: SerializableData,
    context: SerializationPipelineContext
  ): Promise<SerializableData> {
    const startTime = Date.now();

    try {
      // If sanitization is disabled, return data unchanged
      if (!context.sanitizeSensitiveData) {
        return {
          ...data,
          sanitizationDuration: 0,
          sanitized: false,
        };
      }

      // Apply sanitization
      const sanitizedData = this.sanitizer.sanitize(
        data,
        context.sanitizationContext
      );

      const duration = Date.now() - startTime;

      return {
        ...sanitizedData,
        sanitizationDuration: duration,
        sanitized: true,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // If sanitization fails, return original data with error
      return {
        ...data,
        sanitizationDuration: duration,
        sanitized: false,
        sanitizationError:
          error instanceof Error ? error.message : 'Sanitization error',
      };
    }
  }
}
