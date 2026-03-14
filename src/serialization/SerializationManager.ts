/**
 * @file src/serialization/SerializationManager.ts
 * @description Intelligent serialization manager with auto-detection and adaptive timeouts
 *
 * Hot-path notes: native config JSON is cached (built once per manager). Further gains possible in
 * Logger: timestamp (e.g. numeric like Pino instead of new Date().toISOString()), and avoiding
 * util.format when no format args (or using a lighter formatter).
 */

import { createRequire } from 'node:module';
import { DEFAULT_VALUES } from '../constants';
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
import {
  MASK_KEY_PWD,
  MASK_KEY_TOK,
  MASK_KEY_SEC,
  MASK_KEY_KEY,
  MASK_KEY_AUTH,
  MASK_KEY_CREDENTIAL,
  MASK_KEY_API_KEY,
  MASK_KEY_PRIVATE_KEY,
  MASK_KEY_CONNECTION_STRING,
  MASK_KEY_WALLET_LOCATION,
} from '../sensitiveKeys';

function getDefaultSensitiveFields(): string[] {
  return [
    MASK_KEY_PWD,
    MASK_KEY_TOK,
    MASK_KEY_SEC,
    MASK_KEY_KEY,
    MASK_KEY_AUTH,
    MASK_KEY_CREDENTIAL,
    MASK_KEY_API_KEY,
    MASK_KEY_PRIVATE_KEY,
    MASK_KEY_CONNECTION_STRING,
    MASK_KEY_WALLET_LOCATION,
  ];
}

function getDefaultRedactPatterns(): RegExp[] {
  const q = '[\'"][^\'"]*[\'"]';
  return [
    new RegExp(`${MASK_KEY_PWD}\\s*=\\s*${q}`, 'gi'),
    /user\s*=\s*['"][^'"]*['"]/gi,
    new RegExp(`${MASK_KEY_TOK}\\s*=\\s*${q}`, 'gi'),
    new RegExp(`${MASK_KEY_SEC}\\s*=\\s*${q}`, 'gi'),
  ];
}

export interface SerializationManagerConfig {
  timeoutMs?: number;
  enableMetrics?: boolean;
  sanitizeSensitiveData?: boolean;
  sanitizationContext?: SanitizationConfig;
  /** If true, Pino-style: only first level; nested objects are stringified in Node (one stringify per value). Faster for entries with complex objects; output will have nested values as JSON string. */
  nativeShallow?: boolean;
  /** Optional: called when a pipeline step fails (e.g. hygiene). For observability. */
  onStepError?: (step: string, error: unknown) => void;
  /** Optional: called when native addon fails and we fall back to JS pipeline. For observability. */
  onSerializationFallback?: (reason?: unknown) => void;
}

type NativeAddon = {
  fastSerialize: (
    level: string,
    message: string,
    timestamp: number,
    service: string,
    metadata: unknown
  ) => string;
  fastSerializeFromJson?: (
    level: string,
    message: string,
    timestamp: number,
    service: string,
    metadataJson: string
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
  private config: Required<
    Omit<SerializationManagerConfig, 'onStepError' | 'onSerializationFallback'>
  >;
  private onStepError?: (step: string, error: unknown) => void;
  private onSerializationFallback?: (reason?: unknown) => void;
  private nativeAddon: NativeAddon | null = null;
  private nativeChecked = false;
  /** Cached JSON config for Rust addon; built once and reused for each serialize(). */
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
      timeoutMs: config.timeoutMs ?? DEFAULT_VALUES.serializerTimeoutMs,
      enableMetrics: config.enableMetrics ?? true,
      sanitizeSensitiveData: config.sanitizeSensitiveData ?? true,
      nativeShallow: config.nativeShallow ?? false,
      sanitizationContext: {
        sensitiveFields:
          config.sanitizationContext?.sensitiveFields ||
          getDefaultSensitiveFields(),
        redactPatterns:
          config.sanitizationContext?.redactPatterns ||
          getDefaultRedactPatterns(),
        maxStringLength:
          config.sanitizationContext?.maxStringLength ??
          DEFAULT_VALUES.maxStringLength,
        enableDeepSanitization:
          config.sanitizationContext?.enableDeepSanitization ?? true,
      },
    };
    this.onStepError = config.onStepError;
    this.onSerializationFallback = config.onSerializationFallback;

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

    // Configure pipeline: custom serialization first, then HYGIENE (safety), then masking/sanitization
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
    if (process.env.SYNTROPYLOG_NATIVE_DISABLE === '1') {
      this.nativeAddon = null;
      return null;
    }
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
      maxDepth: DEFAULT_VALUES.maxDepth,
      maxStringLength: ctx.maxStringLength ?? DEFAULT_VALUES.maxStringLength,
      sanitize: this.config.sanitizeSensitiveData,
    });
    return this.cachedNativeConfigJson;
  }

  /**
   * 100% synchronous serialization: in-memory pipeline, no Promises or timers.
   * If the native addon is available, it is used (sanitization + masking in Rust) and returns serializedNative.
   * Fast path: avoids creating an intermediate logEntry object in the Logger.
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
        let line: string;
        if (typeof native.fastSerializeFromJson === 'function') {
          let metadataJson: string | null = null;
          try {
            metadataJson =
              metadata === undefined || metadata === null
                ? 'null'
                : JSON.stringify(metadata);
          } catch {
            // Circular or non-serializable; use object path
          }
          if (metadataJson !== null) {
            line = native.fastSerializeFromJson(
              level,
              message,
              timestamp,
              service,
              metadataJson
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
                metadata: null as SerializationMetadata | null,
              };
            }
          }
          line = native.fastSerialize(
            level,
            message,
            timestamp,
            service,
            metadata
          );
        } else {
          line = native.fastSerialize(
            level,
            message,
            timestamp,
            service,
            metadata
          );
        }

        if (!line.startsWith('[SYNTROPYLOG_NATIVE_ERROR]')) {
          return {
            serializedNative: line,
            data: null,
            serializer: 'native',
            duration: 0,
            complexity: SerializationComplexity.SIMPLE,
            sanitized: true,
            success: true,
            metadata: null as SerializationMetadata | null,
          };
        }
      } catch (err) {
        this.onSerializationFallback?.(err);
      }
    }

    // If no native addon, build the object and use the normal pipeline
    const logEntry = {
      level,
      message,
      timestamp,
      service,
      ...(metadata as Record<string, unknown>),
    };

    // Remove duplicates that might be in metadata
    delete (logEntry as Record<string, unknown>).metadata; // Should not be there but just in case

    return this.serialize(logEntry, {
      timeoutMs:
        this.config.timeoutMs ?? DEFAULT_VALUES.serializeDirectTimeoutMs,
      depth: 0,
      maxDepth: DEFAULT_VALUES.maxDepth,
      sensitiveFields: [],
      sanitize: true,
    });
  }

  /**
   * 100% synchronous serialization: in-memory pipeline, no Promises or timers.
   * If the native addon is available, it is used (sanitization + masking in Rust) and returns serializedNative.
   */
  serialize(
    data: SerializableData,
    context: SerializationContextConfig = {
      depth: 0,
      maxDepth: DEFAULT_VALUES.maxDepth,
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
      onStepError: this.onStepError,
    };

    const native = this.getNativeAddon();
    if (native) {
      try {
        const entry = data as Record<string, unknown>;
        const level = (entry.level as string) || 'info';
        const message = (entry.message as string) || '';
        const timestamp = (entry.timestamp as number) || Date.now();
        const service = (entry.service as string) || '';

        // Standardize flat metadata (omit level, message, timestamp, service)
        const metadata = { ...entry };
        delete metadata.level;
        delete metadata.message;
        delete metadata.timestamp;
        delete metadata.service;

        let line: string;
        if (typeof native.fastSerializeFromJson === 'function') {
          let metadataJson: string | null = null;
          try {
            metadataJson =
              Object.keys(metadata).length === 0
                ? '{}'
                : JSON.stringify(metadata);
          } catch {
            // Circular or non-serializable; use object path
          }
          if (metadataJson !== null) {
            line = native.fastSerializeFromJson(
              level,
              message,
              timestamp,
              service,
              metadataJson
            );
            if (!line.startsWith('[SYNTROPYLOG_NATIVE_ERROR]')) {
              const duration = Date.now() - startTime;
              if (this.config.enableMetrics) {
                this.metrics.totalSerializations++;
                this.metrics.successfulSerializations++;
              }
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
          }
          line = native.fastSerialize(
            level,
            message,
            timestamp,
            service,
            metadata
          );
        } else {
          line = native.fastSerialize(
            level,
            message,
            timestamp,
            service,
            metadata
          );
        }

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
      } catch (err) {
        this.onSerializationFallback?.(err);
      }
    }

    const result = this.pipeline.process(data, pipelineContext);

    // Ensure the result data is flat if it's an object, matching our standardized model
    if (
      result.success &&
      typeof result.data === 'object' &&
      result.data !== null
    ) {
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
      const timeoutStrategy = result.metadata?.timeoutStrategy || 'unknown';
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
