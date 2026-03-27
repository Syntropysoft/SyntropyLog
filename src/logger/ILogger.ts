import { LogLevel } from './levels';
import {
  LogMetadata,
  LogBindings,
  LogRetentionRules,
  LogFormatArg,
  JsonValue,
} from '../types';

/**
 * Defines the public interface for a logger instance.
 * This ensures a consistent API for logging across the application,
 * including standard logging methods and a fluent API for contextual logging.
 */
export interface ILogger {
  level: LogLevel;
  // --- Standard Logging Methods ---

  /**
   * Logs a message at the 'audit' level. Used for critical security and compliance records.
   * This level typically bypasses standard filtering to ensure persistence.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  audit(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void;

  /**
   * Logs a message at the 'fatal' level. The application will likely exit.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log (metadata object, message, or format args).
   */
  fatal(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void;

  /**
   * Logs a message at the 'error' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log (metadata object, message, or format args).
   */
  error(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void;

  /**
   * Logs a message at the 'warn' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log (metadata object, message, or format args).
   */
  warn(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void;

  /**
   * Logs a message at the 'info' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log (metadata object, message, or format args).
   */
  info(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void;

  /**
   * Logs a message at the 'debug' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log (metadata object, message, or format args).
   */
  debug(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void;

  /**
   * Logs a message at the 'trace' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log (metadata object, message, or format args).
   */
  trace(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void;

  // --- Lifecycle and Persistent Context Methods ---

  /**
   * Creates a new child logger instance with bindings that will be present in every log.
   * The child inherits all settings from the parent, adding or overriding the specified bindings.
   * @param {LogBindings} bindings - Key-value pairs to bind to the child logger.
   * @returns {ILogger} A new `ILogger` instance.
   */
  child(bindings: LogBindings): ILogger;

  /**
   * Dynamically updates the minimum log level for this logger instance.
   * Any messages with a severity lower than the new level will be ignored.
   * @param {LogLevel} level - The new log level to set.
   */
  setLevel(level: LogLevel): void;

  // --- Fluent API for Per-Log Context ---

  /**
   * Creates a new logger instance with a `source` field bound to it.
   * This is useful for creating a logger for a specific module or component.
   * @param {string} source - The name of the source (e.g., 'redis', 'AuthModule').
   * @returns {ILogger} A new `ILogger` instance with the `source` binding.
   */
  withSource(source: string): ILogger;

  /**
   * Attaches arbitrary structured metadata to every log emitted by this logger instance.
   * The payload is any JSON object — retention policies, compliance tags, routing hints,
   * business context, or anything your executor needs to route or persist the entry.
   * Sanitized before reaching any transport. The executor receives it as `logEntry.retention`.
   *
   * The rules object is stored by reference; do not mutate it after passing if you need consistent logs.
   * Supports complex JSON (nested objects, arrays); serialized with the entry (shallow in native path).
   *
   * @param {LogRetentionRules} payload - Any JSON object to carry on every log from this instance.
   * @returns {ILogger} A new `ILogger` instance with the `retention` binding.
   *
   * @example
   * log.withMeta({ policy: 'GDPR', years: 7 })           // compliance
   * log.withMeta({ tenant: 'acme', region: 'eu-west' })   // business context
   * log.withMeta({ destination: 's3-cold', encrypt: true }) // routing hints
   */
  withMeta(payload: LogRetentionRules): ILogger;

  /**
   * @deprecated Use `withMeta()` instead. Kept for backward compatibility.
   * Attaches structured metadata to every log from this instance under the `retention` field.
   */
  withRetention(rules: LogRetentionRules): ILogger;

  /**
   * Creates a new logger instance with a `transactionId` field bound to it.
   * This is useful for tracking a request across multiple services.
   * @param {string} transactionId - The unique ID of the transaction.
   * @returns {ILogger} A new `ILogger` instance with the `transactionId` binding.
   */
  withTransactionId(transactionId: string): ILogger;

  // --- Per-call transport routing (override / add / remove) ---

  /**
   * For the next log call only, send to exactly these transports (by name).
   * Use transport names from the configured pool (e.g. 'console', 'db', 'azure').
   * @param {...string[]} names - Transport names.
   * @returns {ILogger} This logger for chaining (e.g. .override('console').info('...')).
   */
  override(...names: string[]): ILogger;

  /**
   * For the next log call only, add these transports (by name) to the default set.
   * @param {...string[]} names - Transport names.
   * @returns {ILogger} This logger for chaining.
   */
  add(...names: string[]): ILogger;

  /**
   * For the next log call only, remove these transports (by name) from the default set.
   * @param {...string[]} names - Transport names.
   * @returns {ILogger} This logger for chaining.
   */
  remove(...names: string[]): ILogger;
}
