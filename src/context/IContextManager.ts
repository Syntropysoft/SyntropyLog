/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * @file src/context/IContextManager.ts
 * @description Defines the public interface for an asynchronous context manager.
 * Any class that manages context (such as propagating correlation-id or tracing)
 * must implement this interface. This ensures that different context management
 * strategies (e.g., `AsyncLocalStorage` for production, a simple mock for tests)
 * can be used interchangeably.
 */

/**
 * @interface IContextManager
 * @description The contract for managing asynchronous context.
 */
export interface IContextManager {
  /**
   * Configures the context manager with specific options.
   * This should be called once during initialization.
   * @param headerName The custom header name to use for the correlation ID.
   */
  configure(headerName?: string): void;

  /**
   * Executes a function within a new, isolated asynchronous context.
   * The new context can inherit data from the parent context.
   * @template T The return type of the callback function.
   * @param callback The function to execute within the new context.
   * @returns The return value of the callback function.
   */
  run<T>(callback: () => T): T;

  /**
   * Sets a value in the current asynchronous context.
   * @param key The key for the value.
   * @param value The value to store.
   */
  set(key: string, value: any): void;

  /**
   * Gets a value from the current asynchronous context.
   * @template T The expected type of the value.
   * @param key The key of the value to retrieve.
   * @returns The value associated with the key, or `undefined` if not found.
   */
  get<T = any>(key: string): T | undefined;

  /**
   * Gets the entire key-value store from the current context.
   * @returns {Record<string, any>} An object containing all context data.
   */
  getAll(): Record<string, any>;

  /**
   * A convenience method to get the correlation ID from the current context.
   * @returns {string | undefined} The correlation ID, or undefined if not set.
   */
  getCorrelationId(): string | undefined;

  /**
   * Gets the configured HTTP header name used for the correlation ID.
   * @returns {string} The header name.
   */
  getCorrelationIdHeaderName(): string;

  /** Gets the tracing headers to propagate the context (e.g., W3C Trace Context). */
  getTraceContextHeaders?(): Record<string, string> | undefined;
}
