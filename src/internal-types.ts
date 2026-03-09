/**
 * Internal Types for SyntropyLog Framework
 *
 * These types and utilities are for advanced usage and internal framework operations.
 * Use with caution - they may change between versions.
 */

/**
 * Represents any value that can be safely serialized to JSON.
 * This is a recursive type used to ensure type safety for log metadata.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: JsonValue;
    }
  | JsonValue[];

/**
 * Pure: converts unknown error to JsonValue (same input → same output).
 * Moved from @syntropylog/types to internal types.
 */
export function errorToJsonValue(error: unknown): JsonValue {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
    };
  }
  return String(error);
}

/**
 * Type for log metadata objects that can be passed to logging methods
 */
export type LogMetadata = Record<string, JsonValue>;

/**
 * Type for log bindings that are attached to logger instances
 */
export type LogBindings = Record<string, JsonValue>;

/**
 * Type for retention rules that can be attached to loggers
 */
export type LogRetentionRules = {
  ttl?: number;
  maxSize?: number;
  maxEntries?: number;
  archiveAfter?: number;
  deleteAfter?: number;
  [key: string]: JsonValue | number | undefined;
};

/**
 * Type for format arguments that can be passed to logging methods
 */
export type LogFormatArg = string | number | boolean | null | undefined;

/**
 * Type for the arguments that can be passed to logging methods
 * This follows the Pino-like signature: (obj, msg, ...args) or (msg, ...args)
 */
export type LogArguments =
  | [LogMetadata, string?, ...LogFormatArg[]]
  | [string, ...LogFormatArg[]]
  | [];

/**
 * Type for values that can be stored in context
 */
export type ContextValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Buffer
  | JsonValue;

/**
 * Type for context data structure
 */
export type ContextData = Record<string, ContextValue>;

/**
 * Type for context configuration options
 */
export type ContextConfig = {
  correlationIdHeader?: string;
  transactionIdHeader?: string;
  [key: string]: ContextValue;
};

/**
 * Type for context headers used in HTTP requests
 */
export type ContextHeaders = Record<string, string>;

/**
 * Type for context callback functions
 */
export type ContextCallback = () => void | Promise<void>;

/**
 * Type for logging matrix configuration
 */
export type LoggingMatrix = Partial<Record<string, string[]>>;

/**
 * Type for filtered context based on log level
 */
export type FilteredContext = Record<string, unknown>;

/**
 * Type for any object that can be used as metadata
 */
export type MetadataObject = Record<string, JsonValue>;

/**
 * Context object for logging operations
 */
export type LogContext = {
  correlationId?: string;
  userId?: string | number;
  sessionId?: string;
  requestId?: string;
  [key: string]: JsonValue | undefined;
};

/**
 * Context for pipeline operations (serialization, sanitization, etc.)
 */
export type PipelineContext = {
  correlationId?: string;
  operation?: string;
  metadata?: Record<string, JsonValue>;
  timestamp?: number;
};

/**
 * Context for sanitization operations
 */
export type SanitizationContext = {
  sensitiveFields?: string[];
  maskPatterns?: Record<string, string>;
  depth?: number;
  maxDepth?: number;
};

// Redis Types removed

/**
 * Type for serialized data
 */
export type SerializedData = unknown;

/**
 * Type for serialization context configuration
 */
export type SerializationContextConfig = {
  depth: number;
  maxDepth: number;
  sensitiveFields: string[];
  sanitize: boolean;
  timeoutMs?: number;
};

/**
 * Type for sanitization configuration
 */
export type SanitizationConfig = {
  sensitiveFields: string[];
  redactPatterns: RegExp[];
  maxStringLength: number;
  enableDeepSanitization: boolean;
};

/**
 * Type for serialization pipeline context
 */
export type SerializationPipelineContext = {
  serializationContext: SerializationContextConfig;
  sanitizeSensitiveData: boolean;
  sanitizationContext: SanitizationConfig;
  enableMetrics: boolean;
};

/**
 * Type for step durations in serialization pipeline
 */
export type StepDurations = {
  serialization?: number;
  hygiene?: number;
  sanitization?: number;
  timeout?: number;
};

/**
 * Type for serialization metadata
 */
export type SerializationMetadata = {
  stepDurations?: StepDurations;
  operationTimeout?: number;
  complexity?: string;
  serializer?: string;
  timeoutStrategy?: string;
};

/**
 * Type for serialization result
 */
export type SerializationResult = {
  data: SerializedData;
  serializer: string;
  duration: number;
  complexity: string;
  sanitized: boolean;
  success: boolean;
  metadata: SerializationMetadata;
  error?: string;
};

/**
 * Type for complexity distribution
 */
export type ComplexityDistribution = {
  low: number;
  medium: number;
  high: number;
};

/**
 * Type for serializer distribution
 */
export type SerializerDistribution = Record<string, number>;

/**
 * Type for timeout strategy distribution
 */
export type TimeoutStrategyDistribution = Record<string, number>;

/**
 * Type for serialization metrics
 */
export type SerializationMetrics = {
  totalSerializations: number;
  successfulSerializations: number;
  failedSerializations: number;
  averageSerializationDuration: number;
  averageOperationTimeout: number;
  maxSerializationDuration: number;
  minSerializationDuration: number;
  complexityDistribution: ComplexityDistribution;
  serializerDistribution: SerializerDistribution;
  timeoutStrategyDistribution: TimeoutStrategyDistribution;
};

/**
 * Type for logger dependencies (internal)
 */
export type LoggerDependencies = {
  contextManager: unknown;
  serializerRegistry: unknown;
  maskingEngine: unknown;
  syntropyLogInstance: unknown;
};

/**
 * Type for log entry
 */
export type LogEntry = {
  /** The severity level of the log. */
  level: string;
  /** The main log message, formatted from the arguments. */
  message: string;
  /** The ISO 8601 timestamp of when the log was created. */
  timestamp: string;
  /** Any other properties are treated as structured metadata. */
  [key: string]: unknown;
};

/**
 * Type for logger options
 */
export type LoggerOptions = {
  level?: string;
  serviceName?: string;
  transports?: unknown[];
  bindings?: Record<string, unknown>;
};

/**
 * Interface for logger
 */
export interface ILogger {
  trace(message: string, ...args: LogFormatArg[]): void;
  trace(metadata: LogMetadata, message?: string, ...args: LogFormatArg[]): void;
  debug(message: string, ...args: LogFormatArg[]): void;
  debug(metadata: LogMetadata, message?: string, ...args: LogFormatArg[]): void;
  info(message: string, ...args: LogFormatArg[]): void;
  info(metadata: LogMetadata, message?: string, ...args: LogFormatArg[]): void;
  warn(message: string, ...args: LogFormatArg[]): void;
  warn(metadata: LogMetadata, message?: string, ...args: LogFormatArg[]): void;
  error(message: string, ...args: LogFormatArg[]): void;
  error(metadata: LogMetadata, message?: string, ...args: LogFormatArg[]): void;
  fatal(message: string, ...args: LogFormatArg[]): void;
  fatal(metadata: LogMetadata, message?: string, ...args: LogFormatArg[]): void;
  child(bindings: LogBindings): ILogger;
}

/**
 * Interface for context manager
 */
export interface IContextManager {
  getCorrelationId(): string | undefined;
  setCorrelationId(id: string): void;
  getTransactionId(): string | undefined;
  setTransactionId(id: string): void;
  getContext(): ContextData;
  setContext(data: ContextData): void;
  getContextValue(key: string): ContextValue;
  setContextValue(key: string, value: ContextValue): void;
  clearContext(): void;
  runWithContext<T>(context: ContextData, fn: () => T | Promise<T>): Promise<T>;
  runWithContext<T>(context: ContextData, fn: () => T): T;
}
