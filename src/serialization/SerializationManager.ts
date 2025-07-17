/**
 * @file src/serialization/SerializationManager.ts
 * @description Intelligent serialization manager with auto-detection and adaptive timeouts
 */

import { ISerializer, SerializationContext, SerializationResult, SerializationComplexity } from './types';
import { SerializationPipeline, PipelineContext } from './SerializationPipeline';
import { SerializationStep } from './pipeline/SerializationStep';
import { SanitizationStep } from './pipeline/SanitizationStep';
import { TimeoutStep } from './pipeline/TimeoutStep';

export interface SerializationManagerConfig {
  timeoutMs?: number;
  enableMetrics?: boolean;
  sanitizeSensitiveData?: boolean;
  sanitizationContext?: {
    sensitiveFields?: string[];
    redactPatterns?: RegExp[];
    maxStringLength?: number;
    enableDeepSanitization?: boolean;
  };
}

export interface SerializationMetrics {
  totalSerializations: number;
  successfulSerializations: number;
  failedSerializations: number;
  averageSerializationDuration: number;
  averageOperationTimeout: number;
  maxSerializationDuration: number;
  minSerializationDuration: number;
  complexityDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  serializerDistribution: { [key: string]: number };
  timeoutStrategyDistribution: { [key: string]: number };
}

export class SerializationManager {
  private pipeline: SerializationPipeline;
  private serializationStep: SerializationStep;
  private sanitizationStep: SanitizationStep;
  private timeoutStep: TimeoutStep;
  private config: Required<SerializationManagerConfig>;
  private metrics: {
    totalSerializations: number;
    successfulSerializations: number;
    failedSerializations: number;
    totalSerializationDuration: number;
    totalOperationTimeout: number;
    maxSerializationDuration: number;
    minSerializationDuration: number;
    complexityDistribution: { low: number; medium: number; high: number };
    serializerDistribution: { [key: string]: number };
    timeoutStrategyDistribution: { [key: string]: number };
  };

  constructor(config: SerializationManagerConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs || 5000,
      enableMetrics: config.enableMetrics ?? true,
      sanitizeSensitiveData: config.sanitizeSensitiveData ?? true,
      sanitizationContext: {
        sensitiveFields: config.sanitizationContext?.sensitiveFields || [
          'password', 'token', 'secret', 'key', 'auth', 'credential', 
          'api_key', 'private_key', 'connection_string', 'wallet_location'
        ],
        redactPatterns: config.sanitizationContext?.redactPatterns || [
          /password\s*=\s*['"][^'"]*['"]/gi,
          /user\s*=\s*['"][^'"]*['"]/gi,
          /token\s*=\s*['"][^'"]*['"]/gi,
          /secret\s*=\s*['"][^'"]*['"]/gi
        ],
        maxStringLength: config.sanitizationContext?.maxStringLength || 300,
        enableDeepSanitization: config.sanitizationContext?.enableDeepSanitization ?? true
      }
    };

    this.metrics = {
      totalSerializations: 0,
      successfulSerializations: 0,
      failedSerializations: 0,
      totalSerializationDuration: 0,
      totalOperationTimeout: 0,
      maxSerializationDuration: 0,
      minSerializationDuration: 0,
      complexityDistribution: { low: 0, medium: 0, high: 0 },
      serializerDistribution: {},
      timeoutStrategyDistribution: {}
    };

    // Inicializar pipeline
    this.pipeline = new SerializationPipeline();
    
    // Crear pasos del pipeline
    this.serializationStep = new SerializationStep();
    this.sanitizationStep = new SanitizationStep();
    this.timeoutStep = new TimeoutStep(this.pipeline['timeoutStrategies']);

    // Configurar pipeline
    this.pipeline.addStep(this.serializationStep);
    this.pipeline.addStep(this.sanitizationStep);
    this.pipeline.addStep(this.timeoutStep);
  }

  register(serializer: ISerializer): void {
    this.serializationStep.addSerializer(serializer);
  }

  async serialize(data: any, context: SerializationContext = {
    depth: 0,
    maxDepth: 10,
    sensitiveFields: [],
    sanitize: true
  }): Promise<SerializationResult> {

    const startTime = Date.now();
    
    // Crear contexto del pipeline
    const pipelineContext: PipelineContext = {
      serializationContext: context,
      sanitizeSensitiveData: this.config.sanitizeSensitiveData,
      sanitizationContext: this.config.sanitizationContext,
      enableMetrics: this.config.enableMetrics
    };

    // Ejecutar pipeline
    const result = await this.pipeline.process(data, pipelineContext);

    // Actualizar métricas
    if (this.config.enableMetrics) {
      this.updateMetrics(result, Date.now() - startTime);
    }

    return result;
  }

  private updateMetrics(result: SerializationResult, totalDuration: number): void {
    this.metrics.totalSerializations++;
    
    if (result.success) {
      this.metrics.successfulSerializations++;
      
      // Métricas de serialización (deberían ser muy bajas)
      const serializationDuration = result.metadata.stepDurations?.serialization || 0;
      this.metrics.totalSerializationDuration += serializationDuration;
      this.metrics.maxSerializationDuration = Math.max(this.metrics.maxSerializationDuration, serializationDuration);
      this.metrics.minSerializationDuration = this.metrics.minSerializationDuration === 0 
        ? serializationDuration 
        : Math.min(this.metrics.minSerializationDuration, serializationDuration);

      // Métricas de timeout de operación
      const operationTimeout = result.metadata.operationTimeout || 0;
      this.metrics.totalOperationTimeout += operationTimeout;

      // Distribución por complejidad
      const complexity = result.complexity || SerializationComplexity.SIMPLE;
      if (complexity === SerializationComplexity.SIMPLE) this.metrics.complexityDistribution.low++;
      else if (complexity === SerializationComplexity.COMPLEX) this.metrics.complexityDistribution.medium++;
      else if (complexity === SerializationComplexity.CRITICAL) this.metrics.complexityDistribution.high++;

      // Distribución por serializador
      const serializer = result.serializer || 'unknown';
      this.metrics.serializerDistribution[serializer] = 
        (this.metrics.serializerDistribution[serializer] || 0) + 1;

      // Distribución por estrategia de timeout
      const timeoutStrategy = result.metadata.timeoutStrategy || 'unknown';
      this.metrics.timeoutStrategyDistribution[timeoutStrategy] = 
        (this.metrics.timeoutStrategyDistribution[timeoutStrategy] || 0) + 1;

    } else {
      this.metrics.failedSerializations++;
    }
  }

  getMetrics(): SerializationMetrics {
    return {
      totalSerializations: this.metrics.totalSerializations,
      successfulSerializations: this.metrics.successfulSerializations,
      failedSerializations: this.metrics.failedSerializations,
      averageSerializationDuration: this.metrics.totalSerializations > 0 
        ? this.metrics.totalSerializationDuration / this.metrics.totalSerializations 
        : 0,
      averageOperationTimeout: this.metrics.successfulSerializations > 0 
        ? this.metrics.totalOperationTimeout / this.metrics.successfulSerializations 
        : 0,
      maxSerializationDuration: this.metrics.maxSerializationDuration,
      minSerializationDuration: this.metrics.minSerializationDuration,
      complexityDistribution: { ...this.metrics.complexityDistribution },
      serializerDistribution: { ...this.metrics.serializerDistribution },
      timeoutStrategyDistribution: { ...this.metrics.timeoutStrategyDistribution }
    };
  }

  resetMetrics(): void {
    this.metrics = {
      totalSerializations: 0,
      successfulSerializations: 0,
      failedSerializations: 0,
      totalSerializationDuration: 0,
      totalOperationTimeout: 0,
      maxSerializationDuration: 0,
      minSerializationDuration: 0,
      complexityDistribution: { low: 0, medium: 0, high: 0 },
      serializerDistribution: {},
      timeoutStrategyDistribution: {}
    };
  }

  getRegisteredSerializers(): string[] {
    return this.serializationStep.getRegisteredSerializers();
  }

  getPipelineMetrics() {
    return this.pipeline.getMetrics();
  }
} 