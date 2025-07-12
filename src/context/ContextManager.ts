/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * @file src/context/ContextManager.ts
 * @description The default implementation of the IContextManager interface. It uses Node.js's
 * `AsyncLocalStorage` to create and manage asynchronous contexts, enabling
 * seamless propagation of data like correlation IDs across async operations.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { IContextManager } from './IContextManager';

/**
 * Manages asynchronous context using Node.js `AsyncLocalStorage`.
 * This is the core component for propagating context-specific data
 * (like correlation IDs) without passing them through function arguments.
 * @implements {IContextManager}
 */
export class ContextManager implements IContextManager {
  /** @private The underlying AsyncLocalStorage instance that holds the context store. */
  private als = new AsyncLocalStorage<Record<string, any>>();
  /** @private The HTTP header name used for the correlation ID. */
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
   * within that callback's asynchronous execution path. The new context
   * inherits values from the parent context, if one exists.
   * @template T The return type of the callback.
   * @param callback The function to execute within the new context.
   * @returns {T} The result of the callback function.
   */
  run<T>(callback: () => T): T {
    const store = this.als.getStore();
    // Create a new context that inherits from the parent, or create a new empty one.
    return this.als.run(store ? { ...store } : {}, callback);
  }

  /**
   * Gets a value from the current asynchronous context by its key.
   * @template T The expected type of the value.
   * @param key The key of the value to retrieve.
   * @returns The value, or `undefined` if not found or if outside a context.
   */
  get<T = any>(key: string): T | undefined {
    return this.als.getStore()?.[key];
  }

  /**
   * Gets the entire key-value store from the current asynchronous context.
   * @returns {Record<string, any>} An object containing all context data, or an empty object if outside a context.
   */
  getAll(): Record<string, any> {
    return this.als.getStore() ?? {};
  }

  /**
   * Sets a key-value pair in the current asynchronous context. This will have
   * no effect if called outside of a context created by `run()`.
   * This will only work if called within a context created by `run()`.
   * @param key The key for the value.
   * @param value The value to store.
   * @returns {void}
   */
  set(key: string, value: any): void {
    const store = this.als.getStore();
    if (store) {
      store[key] = value;
    }
  }

  /**
   * Gets the correlation ID from the current context.
   * This is a convenience method that retrieves the value associated with the configured header name.
   * @returns {string | undefined} The correlation ID, or undefined if not set.
   */
  getCorrelationId(): string | undefined {
    return this.get(this.correlationIdHeader);
  }

  /**
   * Gets the configured HTTP header name for the correlation ID.
   * @returns {string} The header name.
   */
  getCorrelationIdHeaderName(): string {
    return this.correlationIdHeader;
  }
}
