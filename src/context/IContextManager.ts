/*
=============================================================================
FILE: src/context/IContextManager.ts
-----------------------------------------------------------------------------
DESCRIPTION:
Defines the interface for the asynchronous context manager. Any class
that manages context (such as propagating correlation-id or tracing)
must implement this interface.
=============================================================================
*/

export interface IContextManager {
  /**
   * Executes a function within a new, isolated asynchronous context.
   * @param callback The function to execute.
   */
  run(callback: () => void | Promise<void>): void | Promise<void>;

  /**
   * Sets a value in the current asynchronous context.
   * @param key The key for the value.
   * @param value The value to store.
   */
  set(key: string, value: any): void;

  /**
   * Gets a value from the current asynchronous context.
   * @param key The key of the value to retrieve.
   */
  get(key: string): any;

  /** Gets all values from the current context. */
  getAll(): Record<string, any>;

  /** Gets the correlation ID from the current context. */
  getCorrelationId(): string | undefined;

  /** Gets the HTTP header name for the correlation ID. */
  getCorrelationIdHeaderName(): string;

  /** Gets the tracing headers to propagate the context (e.g., W3C Trace Context). */
  getTraceContextHeaders?(): Record<string, string> | undefined;
}