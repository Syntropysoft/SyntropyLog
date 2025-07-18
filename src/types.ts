/**
 * SyntropyLog Types - Internal types for the framework
 *
 * This file now uses internal types and only contains types specific to this module.
 */

// Import internal types
import type {
  JsonValue,
  LogMetadata,
  LogBindings,
  LogRetentionRules,
  LogFormatArg,
  LogArguments,
  MetadataObject,
  ContextValue,
  ContextData,
  ContextConfig,
  ContextHeaders,
  ContextCallback,
  LoggingMatrix,
  FilteredContext,
  LogContext,
  PipelineContext,
  SanitizationContext,
  RedisValue,
  RedisListElement,
  RedisSetMember,
  RedisSortedSetMember,
  RedisHashValue,
  RedisCommandOptions,
  RedisPipelineOperation,
  RedisConnectionParams,
  ILogger,
  IContextManager,
  // Serialization types
  SerializedData,
  SerializationContextConfig,
  SanitizationConfig,
  SerializationPipelineContext,
  StepDurations,
  SerializationMetadata,
  SerializationResult,
  ComplexityDistribution,
  SerializerDistribution,
  TimeoutStrategyDistribution,
  SerializationMetrics,
  // Logging types
  LoggerDependencies,
} from './internal-types';

// Import errorToJsonValue as value (not type)
import { errorToJsonValue } from './internal-types';

// Re-export internal types
export {
  JsonValue,
  LogMetadata,
  LogBindings,
  LogRetentionRules,
  LogFormatArg,
  LogArguments,
  MetadataObject,
  ContextValue,
  ContextData,
  ContextConfig,
  ContextHeaders,
  ContextCallback,
  LoggingMatrix,
  FilteredContext,
  LogContext,
  PipelineContext,
  SanitizationContext,
  RedisValue,
  RedisListElement,
  RedisSetMember,
  RedisSortedSetMember,
  RedisHashValue,
  RedisCommandOptions,
  RedisPipelineOperation,
  RedisConnectionParams,
  ILogger,
  IContextManager,
  // Serialization types
  SerializedData,
  SerializationContextConfig,
  SanitizationConfig,
  SerializationPipelineContext,
  StepDurations,
  SerializationMetadata,
  SerializationResult,
  ComplexityDistribution,
  SerializerDistribution,
  TimeoutStrategyDistribution,
  SerializationMetrics,
  // Logging types
  LoggerDependencies,
  errorToJsonValue,
};

// Redefine SerializableData as 'any' for maximum flexibility in this module
export type SerializableData = any;

import type { LogLevel } from './logger/levels';

// Re-export LogLevel for external use
export type { LogLevel } from './logger/levels';

// Override LoggerOptions to use LogLevel instead of string
export type LoggerOptions = {
  level?: LogLevel;
  serviceName?: string;
  transports?: unknown[]; // Will be properly typed in the logger implementation
  bindings?: Record<string, any>;
};

// Override LogEntry to use LogLevel instead of string
export type LogEntry = {
  /** The severity level of the log. */
  level: LogLevel;
  /** The main log message, formatted from the arguments. */
  message: string;
  /** The ISO 8601 timestamp of when the log was created. */
  timestamp: string;
  /** Any other properties are treated as structured metadata. */
  [key: string]: any;
};
