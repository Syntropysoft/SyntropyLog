/**
 * SyntropyLog Types - Public type API
 *
 * Re-exports from internal-types (single source of truth). Only SerializableData
 * and LogLevel are defined elsewhere; LoggerOptions and LogEntry come from internal-types.
 */

// Import internal types (single source of truth)
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
  LogEntry,
  LoggerOptions,
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
  LogEntry,
  LoggerOptions,
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

// Only local definition: flexibility for this module (internal-types uses SerializedData = unknown)
export type SerializableData = unknown;

// Re-export LogLevel for external use (defined in logger/levels)
export type { LogLevel } from './logger/levels';
