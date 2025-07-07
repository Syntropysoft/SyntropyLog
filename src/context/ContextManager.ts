/*
=============================================================================
FILE: src/context/ContextManager.ts
-----------------------------------------------------------------------------
DESCRIPTION:
The default implementation of the IContextManager interface. It uses Node.js's
`AsyncLocalStorage` to create and manage asynchronous contexts, enabling
seamless propagation of data like correlation IDs across async operations.
=============================================================================
*/

import { AsyncLocalStorage } from 'node:async_hooks';
import { IContextManager } from './IContextManager';

/**
 * Manages asynchronous context using Node.js `AsyncLocalStorage`.
 * This is the core component for propagating context-specific data
 * (like correlation IDs) without passing them through function arguments.
 */
export class ContextManager implements IContextManager {
  /** The underlying AsyncLocalStorage instance that holds the context store. */
  private als = new AsyncLocalStorage<Record<string, any>>();
  /** The HTTP header name used for the correlation ID. */
  private correlationIdHeader = 'x-correlation-id';

  /**
   * Configures the context manager, primarily to set a custom header name
   * for the correlation ID.
   * @param headerName The custom header name to use (e.g., 'X-Request-ID').
   */
  public configure(headerName?: string): void {
    if (headerName) {
      this.correlationIdHeader = headerName;
    }
  }

  /**
   * Executes a function within a new, isolated asynchronous context.
   * Any data set via `set()` inside the callback will only be available
   * within that callback's asynchronous execution path.
   * @param callback The function to execute within the new context.
   */
  run<T>(callback: () => T): T {
    const store = this.als.getStore();
    // Create a new context that inherits from the parent, or a new empty one if there's no parent.
    return this.als.run(store ? { ...store } : {}, callback);
  }

  /**
   * Gets a value from the current asynchronous context by its key.
   * @param key The key of the value to retrieve.
   * @returns The value, or `undefined` if not found or if outside a context.
   */
  get<T = any>(key: string): T | undefined {
    return this.als.getStore()?.[key];
  }

  /**
   * Gets the entire key-value store from the current asynchronous context.
   * @returns An object containing all context data, or an empty object if outside a context.
   */
  getAll(): Record<string, any> {
    return this.als.getStore() ?? {};
  }

  /**
   * Sets a key-value pair in the current asynchronous context.
   * This will only work if called within a context created by `run()`.
   * @param key The key for the value.
   * @param value The value to store.
   */
  set(key: string, value: any): void {
    const store = this.als.getStore();
    if (store) store[key] = value;
  }

  /**
   * Gets the correlation ID from the current context.
   * This is a convenience method that retrieves the value associated with the configured header name.
   */
  getCorrelationId(): string | undefined {
    return this.get(this.correlationIdHeader);
  }

  /**
   * Gets the configured HTTP header name for the correlation ID.
   */
  getCorrelationIdHeaderName(): string {
    return this.correlationIdHeader;
  }
}
