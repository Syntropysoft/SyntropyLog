/**
 * @file src/constants.ts
 * @description Application-wide default values and limits. Avoid magic numbers; use these constants.
 */

/**
 * Default values used across serialization, pipeline, masking, and lifecycle.
 * Industry standard: single source of truth for timeouts and limits.
 */
export const DEFAULT_VALUES = {
  /** SerializationManager config: default timeout for serializer pipeline (ms). */
  serializerTimeoutMs: 5000,
  /** Context passed to serialize/serializeDirect: default operation timeout (ms). */
  serializeDirectTimeoutMs: 1000,
  /** Pipeline: default operation timeout for DefaultTimeoutStrategy (ms). */
  pipelineOperationTimeoutMs: 5000,
  /** MaskingEngine: max ms per custom rule regex evaluation (ReDoS guard). */
  regexTimeoutMs: 100,
  /** LifecycleManager: wait time for shutdown steps (ms). */
  shutdownWaitMs: 5000,
  /** LoggerFactory: max cached loggers in pool (LRU eviction). */
  maxLoggerPoolSize: 1000,
  /** Default max depth for serialization/sanitization/native config. */
  maxDepth: 10,
  /** Default max string length in sanitization. */
  maxStringLength: 300,
  /** MaskingEngine: max length for maskDefault when preserveLength is false. */
  maskDefaultCapLength: 8,
  /** MaskingEngine: skip regex test for keys longer than this (ReDoS guard). */
  maxKeyLengthForRegex: 256,
} as const;

export type DefaultValues = typeof DEFAULT_VALUES;
