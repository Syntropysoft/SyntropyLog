import { PipelineStep, PipelineContext } from '../SerializationPipeline';
import { DataSanitizer } from '../utils/DataSanitizer';

export class SanitizationStep implements PipelineStep<any> {
  name = 'sanitization';
  private sanitizer: DataSanitizer;

  constructor() {
    this.sanitizer = new DataSanitizer();
  }

  async execute(data: any, context: PipelineContext): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Si la sanitización está deshabilitada, devolver datos sin modificar
      if (!context.sanitizeSensitiveData) {
        return {
          ...data,
          sanitizationDuration: 0,
          sanitized: false
        };
      }

      // Aplicar sanitización
      const sanitizedData = this.sanitizer.sanitize(data, context.sanitizationContext);
      
      const duration = Date.now() - startTime;

      return {
        ...sanitizedData,
        sanitizationDuration: duration,
        sanitized: true
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Si la sanitización falla, devolver datos originales con error
      return {
        ...data,
        sanitizationDuration: duration,
        sanitized: false,
        sanitizationError: error instanceof Error ? error.message : 'Error en sanitización'
      };
    }
  }
} 