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
 * Helper function to convert unknown error to JsonValue
 * Moved from @syntropylog/types to internal types
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

/**
 * Type for Redis values - covers all valid Redis data types
 */
export type RedisValue =
  | string
  | number
  | bigint
  | boolean
  | Buffer
  | null
  | undefined
  | RedisValue[]
  | {
    [key: string]: RedisValue;
  };

/**
 * Type for Redis list elements
 */
export type RedisListElement = string | number | Buffer | null | undefined;

/**
 * Type for Redis set members
 */
export type RedisSetMember = string | number | Buffer;

/**
 * Type for Redis sorted set members with scores
 */
export type RedisSortedSetMember = {
  score: number;
  value: RedisValue;
};

/**
 * Type for Redis hash field values
 */
export type RedisHashValue = string | number | Buffer;

/**
 * Type for Redis command options
 */
export type RedisCommandOptions = {
  [key: string]: JsonValue;
};

/**
 * Type for Redis pipeline operations
 */
export type RedisPipelineOperation = {
  command: string;
  args: RedisValue[];
};

/**
 * Type for Redis connection parameters
 */
export type RedisConnectionParams = {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  [key: string]: unknown;
};

/**
 * Type for serialized data
 */
export type SerializedData = any;

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
  [key: string]: any;
};

/**
 * Type for logger options
 */
export type LoggerOptions = {
  level?: string;
  serviceName?: string;
  transports?: unknown[];
  bindings?: Record<string, any>;
};

/**
 * Represents a standard message format that the framework understands.
 * The adapter is responsible for converting the broker-specific message
 * format to this structure, and vice-versa.
 */
export interface BrokerMessage {
  /**
   * The actual content of the message. Using `Buffer` is the most flexible
   * approach as it supports any type of serialization (JSON, Avro, Protobuf, etc.).
   */
  payload: Buffer;
  /**
   * Key-value metadata attached to the message.
   * This is where SyntropyLog will inject tracing headers like `correlation-id`.
   */
  headers?: Record<string, string | Buffer>;
}

/**
 * Defines the controls for handling a received message's lifecycle.
 * An instance of this is passed to the user's message handler, allowing them
 * to confirm or reject the message.
 */
export interface MessageLifecycleControls {
  /**
   * Acknowledges that the message has been successfully processed.
   * This typically removes the message from the queue.
   */
  ack: () => Promise<void>;
  /**
   * Negatively acknowledges the message, indicating a processing failure.
   * @param requeue - If true, asks the broker to re-queue the message
   * for another attempt. If false (or omitted), the broker might move it to a dead-letter queue
   * or discard it, depending on its configuration.
   */
  nack: (requeue?: boolean) => Promise<void>;
}

/**
 * Type for message handler function
 */
export type MessageHandler = (
  message: BrokerMessage,
  controls: MessageLifecycleControls
) => Promise<void>;

/**
 * Interface for broker adapters
 */
export interface IBrokerAdapter {
  /**
   * Establishes a connection to the message broker.
   */
  connect(): Promise<void>;
  /**
   * Gracefully disconnects from the message broker.
   */
  disconnect(): Promise<void>;
  /**
   * Publishes a message to a specific topic or routing key.
   * @param topic - The destination for the message (e.g., a topic name, queue name, or routing key).
   * @param message - The message to be sent, in the framework's standard format.
   */
  publish(topic: string, message: BrokerMessage): Promise<void>;
  /**
   * Subscribes to a topic or queue to receive messages.
   * @param topic - The source of messages to listen to (e.g., a topic name or queue name).
   * @param handler - The user's function that will be called for each incoming message.
   */
  subscribe(topic: string, handler: MessageHandler): Promise<void>;
}

/**
 * Interface for HTTP request in adapters
 */
export interface AdapterHttpRequest {
  /** The full URL for the request. */
  url: string;
  /** The HTTP method. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  /** A record of request headers. */
  headers: Record<string, string | number | string[]>;
  /** The request body, if any. */
  body?: unknown;
  /** A record of URL query parameters. */
  queryParams?: Record<string, any>;
}

/**
 * Interface for HTTP response in adapters
 */
export interface AdapterHttpResponse<T = any> {
  /** The HTTP status code of the response. */
  statusCode: number;
  /** The response body data. */
  data: T;
  /** A record of response headers. */
  headers: Record<string, string | number | string[]>;
}

/**
 * Interface for HTTP error in adapters
 */
export interface AdapterHttpError extends Error {
  /** The original request that caused the error. */
  request: AdapterHttpRequest;
  /** The response received, if any. */
  response?: AdapterHttpResponse;
  /** A flag to identify this as a normalized adapter error. */
  isAdapterError: true;
}

/**
 * Interface for HTTP client adapters
 */
export interface IHttpClientAdapter {
  /**
   * The core method that the SyntropyLog instrumenter needs. It executes an
   * HTTP request and returns a normalized response, or throws a normalized error.
   * @param request The generic HTTP request to execute.
   * @returns A promise that resolves with the normalized response.
   */
  request<T>(request: AdapterHttpRequest): Promise<AdapterHttpResponse<T>>;
}

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
