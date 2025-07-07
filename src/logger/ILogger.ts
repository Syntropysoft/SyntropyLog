import { JsonValue } from '../types';
import { LogLevelName } from './levels';

/**
 * Defines the public interface for a logger instance.
 * This ensures a consistent API for logging across the application,
 * including standard logging methods and a fluent API for contextual logging.
 */
export interface ILogger {
  // --- Standard Logging Methods ---

  fatal(obj: object, message?: string, ...args: any[]): void;
  fatal(message: string, ...args: any[]): void;

  error(obj: object, message?: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;

  warn(obj: object, message?: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;

  info(obj: object, message?: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;

  debug(obj: object, message?: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;

  trace(obj: object, message?: string, ...args: any[]): void;
  trace(message: string, ...args: any[]): void;

  // --- Lifecycle and Persistent Context Methods ---

  /**
   * Creates a new child logger instance with bindings that will be present in every log.
   * The child inherits the parent's configuration.
   * @param bindings - Key-value pairs to bind to the child logger.
   * @returns A new `ILogger` instance.
   */
  child(bindings: Record<string, JsonValue>): ILogger;

  /**
   * Dynamically updates the minimum log level for this logger instance.
   * @param level - The new log level to set.
   */
  setLevel(level: LogLevelName): void;

  // --- Fluent API for Per-Log Context ---

  /**
   * Adds a contextual source to a specific log, returning a new, temporary logger instance.
   * @param source - The name of the source (e.g., 'redis', 'AuthModule').
   * @returns A new `ILogger` instance with the added context.
   */
  withSource(source: string): ILogger;

  /**
   * Adds retention rules to a specific log, returning a new, temporary logger instance.
   * @param rules - A JSON object containing the retention rules.
   * @returns A new `ILogger` instance with the added context.
   */
  withRetention(rules: Record<string, any>): ILogger;

  /**
   * Adds a transaction ID to a specific log for distributed tracing, returning a new, temporary logger instance.
   * @param transactionId - The unique ID of the transaction.
   * @returns A new `ILogger` instance with the added context.
   */
  withTransactionId(transactionId: string): ILogger;
}
