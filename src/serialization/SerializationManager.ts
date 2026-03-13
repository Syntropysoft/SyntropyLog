/**
 * @file src/serialization/SerializationManager.ts
 * @description Intelligent serialization manager with auto-detection and adaptive timeouts
 *
 * Hot-path notes: native config JSON is cached (built once per manager). Further gains possible in
 * Logger: timestamp (e.g. numeric like Pino instead of new Date().toISOString()), and avoiding
 * util.format when no format args (or using a lighter formatter).
 */

import { createRequire } from 'node:module';
import {
  ISerializer,
  SerializationResult,
  SerializationComplexity,
} from './types';
import { SerializationPipeline } from './SerializationPipeline';
import { SerializationPipelineContext, SerializationMetadata } from '../types';
import { SerializationStep } from './pipeline/SerializationStep';
import { HygieneStep } from './pipeline/HygieneStep';
import { SanitizationStep } from './pipeline/SanitizationStep';
import { TimeoutStep } from './pipeline/TimeoutStep';
import {
  SerializableData,
  SerializationContextConfig,
  SerializationMetrics,
  SanitizationConfig,
  ComplexityDistribution,
  SerializerDistribution,
  TimeoutStrategyDistribution,
} from '../types';

export interface SerializationManagerConfig {
  timeoutMs?: number;
  enableMetrics?: boolean;
  sanitizeSensitiveData?: boolean;
  sanitizationContext?: SanitizationConfig;
  /** Si true, estilo Pino: solo primer nivel; objetos anidados se stringify en Node (un stringify por valor). Más rápido para entries con objetos complejos; la salida tendrá valores anidados como string JSON. */
  nativeShallow?: boolean;
}

type NativeAddon = {
  fastSerialize: (
    level: string,
    message: string,
    timestamp: number,
    service: string,
    metadata: unknown
  ) => string;
  configureNative: (config: string) => void;
};

const require = createRequire(import.meta.url);

export class SerializationManager {
  private pipeline: SerializationPipeline;
  private serializationStep: SerializationStep;
  private hygieneStep: HygieneStep;
  private sanitizationStep: SanitizationStep;
  private timeoutStep: TimeoutStep;
  private config: Required<SerializationManagerConfig>;
  private nativeAddon: NativeAddon | null = null;
  private nativeChecked = false;
  /** Cache del JSON de config para Rust; se construye una vez y se reutiliza en cada serialize(). */
  private cachedNativeConfigJson: string | null = null;
  private metrics: {
    totalSerializations: number;
    successfulSerializations: number;
    failedSerializations: number;
    totalSerializationDuration: number;
    totalOperationTimeout: number;
    maxSerializationDuration: number;
    minSerializationDuration: number;
    complexityDistribution: ComplexityDistribution;
    serializerDistribution: SerializerDistribution;
    timeoutStrategyDistribution: TimeoutStrategyDistribution;
  };

  constructor(config: SerializationManagerConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs || 5000,
      enableMetrics: config.enableMetrics ?? true,
      sanitizeSensitiveData: config.sanitizeSensitiveData ?? true,
      nativeShallow: config.nativeShallow ?? false,
      sanitizationContext: {
        sensitiveFields: config.sanitizationContext?.sensitiveFields || [
          'password',
          'token',
          'secret',
          'key',
          'auth',
          'credential',
          'api_key',
          'private_key',
          'connection_string',
          'wallet_location',
        ],
        redactPatterns: config.sanitizationContext?.redactPatterns || [
          /password\s*=\s*['"][^'"]*['"]/gi,
          /user\s*=\s*['"][^'"]*['"]/gi,
          /token\s*=\s*['"][^'"]*['"]/gi,
          /secret\s*=\s*['"][^'"]*['"]/gi,
        ],
        maxStringLength: config.sanitizationContext?.maxStringLength || 300,
        enableDeepSanitization:
          config.sanitizationContext?.enableDeepSanitization ?? true,
      },
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
      timeoutStrategyDistribution: {},
    };

    // Initialize pipeline
    this.pipeline = new SerializationPipeline();

    // Create pipeline steps
    this.serializationStep = new SerializationStep();
    this.hygieneStep = new HygieneStep();
    this.sanitizationStep = new SanitizationStep();
    this.timeoutStep = new TimeoutStep(this.pipeline['timeoutStrategies']);

    // Configure pipeline: custom serialization first, then HYGIENE (safety), then masking
    this.pipeline.addStep(this.serializationStep);
    this.pipeline.addStep(this.hygieneStep);
    this.pipeline.addStep(this.sanitizationStep);
    this.pipeline.addStep(this.timeoutStep);
  }

  register(serializer: ISerializer): void {
    this.serializationStep.addSerializer(serializer);
  }

  private getNativeAddon(): NativeAddon | null {
    if (this.nativeChecked) return this.nativeAddon;
    this.nativeChecked = true;
    try {
      this.nativeAddon = require('syntropylog-native') as NativeAddon;
      if (this.nativeAddon && this.nativeAddon.configureNative) {
        const configStr = this.buildNativeConfigJson();
        this.nativeAddon.configureNative(configStr);
      }
    } catch {
      this.nativeAddon = null;
    }
    return this.nativeAddon;
  }

  /** True if the Rust addon is loaded and will be used for serialize(). Same resolution as getNativeAddon(). */
  public isNativeAddonInUse(): boolean {
    return this.getNativeAddon() !== null;
  }

  private buildNativeConfigJson(): string {
    if (this.cachedNativeConfigJson !== null)
      return this.cachedNativeConfigJson;
    const ctx = this.config.sanitizationContext;
    const redactPatterns = (ctx.redactPatterns || []).map((re: RegExp) =>
      typeof re === 'string' ? re : re.source
    );
    this.cachedNativeConfigJson = JSON.stringify({
      sensitiveFields: ctx.sensitiveFields || [],
      redactPatterns,
      maxDepth: 10,
      maxStringLength: ctx.maxStringLength ?? 300,
      sanitize: this.config.sanitizeSensitiveData,
    });
    return this.cachedNativeConfigJson;
  }

  /**
   * Serialización 100% síncrona: pipeline en memoria sin Promesas ni timers.
   * Si el addon nativo está disponible, lo usa (sanitización + enmascarado en Rust) y devuelve serializedNative.
   /**
   * Ruta ultra-rápida (Zero-Allocation) para el hot-path.
   * Evita crear el objeto logEntry intermedio en el Logger.
   */
  public serializeDirect(
    level: string,
    message: string,
    timestamp: number,
    service: string,
    metadata?: unknown
  ): SerializationResult {
    const native = this.getNativeAddon();
    if (native) {
      try {
        const line = native.fastSerialize(
          level,
          message,
          timestamp,
          service,
          metadata
        );

        if (!line.startsWith('[SYNTROPYLOG_NATIVE_ERROR]')) {
          return {
            serializedNative: line,
            data: null,
            serializer: 'native',
            duration: 0,
            complexity: SerializationComplexity.SIMPLE,
            sanitized: true,
            success: true,
            metadata: null as SerializationMetadata | null, // Evitamos {}
          };
        }
      } catch {
        // Fallback al pipeline JS si falla el nativo
      }
    }

    // Si no hay nativo, construimos el objeto y usamos el pipeline normal
    const logEntry = {
      level,
      message,
      timestamp,
      service,
      ...(metadata as Record<string, unknown>),
    };

    // Remove duplicates that might be in metadata
    delete (logEntry as any).metadata; // Should not be there but just in case
    
    return this.serialize(logEntry, {
      timeoutMs: this.config.timeoutMs ?? 1000,
      depth: 0,
      maxDepth: 10,
      sensitiveFields: [],
      sanitize: true,
    });
  }

  /**
   * Serialización 100% síncrona: pipeline en memoria sin Promesas ni timers.
   * Si el addon nativo está disponible, lo usa (sanitización + enmascarado en Rust) y devuelve serializedNative.
   */
  serialize(
    data: SerializableData,
    context: SerializationContextConfig = {
      depth: 0,
      maxDepth: 10,
      sensitiveFields: [],
      sanitize: true,
    }
  ): SerializationResult {
    const startTime = Date.now();
    const pipelineContext: SerializationPipelineContext = {
      serializationContext: context,
      sanitizeSensitiveData: this.config.sanitizeSensitiveData,
      sanitizationContext: this.config.sanitizationContext,
      enableMetrics: this.config.enableMetrics,
    };

    const native = this.getNativeAddon();
    if (native) {
      try {
        const entry = data as Record<string, unknown>;
        const level = (entry.level as string) || 'info';
        const message = (entry.message as string) || '';
        const timestamp = (entry.timestamp as number) || Date.now();
        const service = (entry.service as string) || '';

        // Standardize flat metadata
        const {
          level: _l,
          message: _m,
          timestamp: _t,
          service: _s,
          ...metadata
        } = entry;

        const line = native.fastSerialize(
          level,
          message,
          timestamp,
          service,
          metadata
        );
        if (!line.startsWith('[SYNTROPYLOG_NATIVE_ERROR]')) {
          const duration = Date.now() - startTime;
          if (this.config.enableMetrics) {
            this.metrics.totalSerializations++;
            this.metrics.successfulSerializations++;
          }
          // Native path does not run pipeline steps: no serializationDuration/serializer/serializationComplexity in output.
          return {
            data: data as SerializableData,
            serializer: 'native',
            duration,
            complexity: 'low',
            sanitized: true,
            success: true,
            metadata: {},
            serializedNative: line,
          };
        }
      } catch {
        /* fallback to JS pipeline */
      }
    }

    const result = this.pipeline.process(data, pipelineContext);
    
    // Ensure the result data is flat if it's an object, matching our standardized model
    if (result.success && typeof result.data === 'object' && result.data !== null) {
      const entry = result.data as Record<string, unknown>;
      if (entry.metadata && typeof entry.metadata === 'object') {
        // This is where the problematic nesting happened. We spread it into the root.
        const meta = entry.metadata as Record<string, unknown>;
        delete entry.metadata;
        Object.assign(entry, meta);
      }
    }

    if (this.config.enableMetrics) {
      this.updateMetrics(result, Date.now() - startTime);
    }

    return result;
  }

  private updateMetrics(
    result: SerializationResult,
    _totalDuration: number
  ): void {
    this.metrics.totalSerializations++;

    if (result.success) {
      this.metrics.successfulSerializations++;

      // Serialization and hygiene metrics (should be very low)
      const serializationDuration =
        (result.metadata?.stepDurations?.serialization || 0) +
        (result.metadata?.stepDurations?.hygiene || 0);
      this.metrics.totalSerializationDuration += serializationDuration;
      this.metrics.maxSerializationDuration = Math.max(
        this.metrics.maxSerializationDuration,
        serializationDuration
      );
      this.metrics.minSerializationDuration =
        this.metrics.minSerializationDuration === 0
          ? serializationDuration
          : Math.min(
              this.metrics.minSerializationDuration,
              serializationDuration
            );

      // Operation timeout metrics
      const operationTimeout = result.metadata?.operationTimeout || 0;
      this.metrics.totalOperationTimeout += operationTimeout;

      // Complexity distribution
      const complexity = result.complexity || SerializationComplexity.SIMPLE;
      if (complexity === SerializationComplexity.SIMPLE)
        this.metrics.complexityDistribution.low++;
      else if (complexity === SerializationComplexity.COMPLEX)
        this.metrics.complexityDistribution.medium++;
      else if (complexity === SerializationComplexity.CRITICAL)
        this.metrics.complexityDistribution.high++;

      // Serializer distribution
      const serializer = result.serializer || 'unknown';
      this.metrics.serializerDistribution[serializer] =
        (this.metrics.serializerDistribution[serializer] || 0) + 1;

      // Timeout strategy distribution
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
      averageSerializationDuration:
        this.metrics.totalSerializations > 0
          ? this.metrics.totalSerializationDuration /
            this.metrics.totalSerializations
          : 0,
      averageOperationTimeout:
        this.metrics.successfulSerializations > 0
          ? this.metrics.totalOperationTimeout /
            this.metrics.successfulSerializations
          : 0,
      maxSerializationDuration: this.metrics.maxSerializationDuration,
      minSerializationDuration: this.metrics.minSerializationDuration,
      complexityDistribution: { ...this.metrics.complexityDistribution },
      serializerDistribution: { ...this.metrics.serializerDistribution },
      timeoutStrategyDistribution: {
        ...this.metrics.timeoutStrategyDistribution,
      },
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
      timeoutStrategyDistribution: {},
    };
  }

  getRegisteredSerializers(): string[] {
    return this.serializationStep.getRegisteredSerializers();
  }

  getPipelineMetrics() {
    return this.pipeline.getMetrics();
  }
}
