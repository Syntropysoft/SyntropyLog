/*
 * @file src/context/IContextManager.ts
 * @description Defines the public interface for an asynchronous context manager.
 * Any class that manages context (such as propagating correlation-id or tracing)
 * must implement this interface. This ensures that different context management
 * strategies (e.g., `AsyncLocalStorage` for production, a simple mock for tests)
 * can be used interchangeably.
 */

import { LogLevel } from '../logger/levels';
import {
  ContextConfig,
  ContextValue,
  ContextData,
  ContextCallback,
  ContextHeaders,
  FilteredContext,
  LoggingMatrix,
} from '../types';

/**
 * @interface IContextManager
 * @description The contract for managing asynchronous context.
 */
export interface IContextManager {
  /**
   * Configures the context manager with specific options.
   * This should be called once during initialization.
   * @param options The configuration options.
   * @param options.correlationIdHeader The custom header name to use for the correlation ID.
   * @param options.transactionIdHeader The custom header name for the transaction ID.
   */
  configure(options: ContextConfig): void;

  /**
   * Executes a function within a new, isolated asynchronous context.
   * The new context can inherit data from the parent context.
   * @template T The return type of the callback function.
   * @param callback The function to execute within the new context.
   * @returns The return value of the callback function.
   */
  run(fn: ContextCallback): Promise<void>;

  /**
   * Sets a value in the current asynchronous context.
   * @param key The key for the value.
   * @param value The value to store.
   */
  set(key: string, value: ContextValue): void;

  /**
   * Gets a value from the current asynchronous context.
   * @template T The expected type of the value.
   * @param key The key of the value to retrieve.
   * @returns The value associated with the key, or `undefined` if not found.
   */
  get<T = ContextValue>(key: string): T | undefined;

  /**
   * Gets the entire key-value store from the current context.
   * @returns {ContextData} An object containing all context data.
   */
  getAll(): ContextData;

  /**
   * A convenience method to get the correlation ID from the current context.
   * If no correlation ID exists, generates one automatically to ensure tracing continuity.
   * @returns {string} The correlation ID (never undefined).
   */
  getCorrelationId(): string;

  /**
   * Gets the configured HTTP header name used for the correlation ID.
   * @returns {string} The header name.
   */
  getCorrelationIdHeaderName(): string;

  /**
   * Gets the configured HTTP header name used for the transaction ID.
   * @returns {string} The header name.
   */
  getTransactionIdHeaderName(): string;

  /**
   * A convenience method to get the transaction ID from the current context.
   * @returns {string | undefined} The transaction ID, or undefined if not set.
   */
  getTransactionId(): string | undefined;

  /**
   * A convenience method to set the transaction ID in the current context.
   * @param transactionId The transaction ID to set.
   */
  setTransactionId(transactionId: string): void;

  /** Gets the tracing headers to propagate the context (e.g., W3C Trace Context). */
  getTraceContextHeaders(): ContextHeaders;

  /**
   * Gets a filtered context based on the specified log level.
   * This is useful for logging purposes to ensure only relevant context is included.
   * @param level The log level to filter by.
   * @returns A record containing only the context data relevant for the specified level.
   */
  getFilteredContext(level: LogLevel): FilteredContext;

  /**
   * Reconfigures the logging matrix dynamically.
   * This method allows changing which context fields are included in logs
   * without affecting security configurations like masking or log levels.
   * @param newMatrix The new logging matrix configuration
   */
  reconfigureLoggingMatrix(newMatrix: LoggingMatrix): void;
}
