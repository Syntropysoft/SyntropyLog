/* eslint-disable @typescript-eslint/no-explicit-any */
import { LogLevel } from './levels';

/**
 * Defines the public interface for a logger instance.
 * This ensures a consistent API for logging across the application,
 * including standard logging methods and a fluent API for contextual logging.
 */
export interface ILogger {
  level: LogLevel;
  // --- Standard Logging Methods ---

  /**
   * Logs a message at the 'fatal' level. The application will likely exit.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  fatal(obj: object, message?: string, ...args: any[]): void;
  fatal(message: string, ...args: any[]): void;

  /**
   * Logs a message at the 'error' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  error(obj: object, message?: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;

  /**
   * Logs a message at the 'warn' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  warn(obj: object, message?: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;

  /**
   * Logs a message at the 'info' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  info(obj: object, message?: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;

  /**
   * Logs a message at the 'debug' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  debug(obj: object, message?: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;

  /**
   * Logs a message at the 'trace' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  trace(obj: object, message?: string, ...args: any[]): void;
  trace(message: string, ...args: any[]): void;

  // --- Lifecycle and Persistent Context Methods ---

  /**
   * Creates a new child logger instance with bindings that will be present in every log.
   * The child inherits all settings from the parent, adding or overriding the specified bindings.
   * @param {Record<string, any>} bindings - Key-value pairs to bind to the child logger.
   * @returns {ILogger} A new `ILogger` instance.
   */
  child(bindings: Record<string, any>): ILogger;

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
   * Creates a new logger instance with a `retention` field bound to it.
   * The provided rules object will be deep-cloned to ensure immutability.
   * @param {Record<string, any>} rules - A JSON object containing the retention rules.
   * @returns {ILogger} A new `ILogger` instance with the `retention` binding.
   */
  withRetention(rules: Record<string, any>): ILogger;

  /**
   * Creates a new logger instance with a `transactionId` field bound to it.
   * This is useful for tracking a request across multiple services.
   * @param {string} transactionId - The unique ID of the transaction.
   * @returns {ILogger} A new `ILogger` instance with the `transactionId` binding.
   */
  withTransactionId(transactionId: string): ILogger;
}
