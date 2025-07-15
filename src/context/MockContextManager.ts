/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * @file src/context/MockContextManager.ts
 * @description Provides a mock implementation of the IContextManager interface,
 * designed specifically for use in testing environments.
 */

import type { IContextManager } from './IContextManager';

/**
 * @class MockContextManager
 * @description A mock implementation of `IContextManager` for testing purposes.
 * It uses a simple in-memory object instead of AsyncLocalStorage,
 * making context management predictable and synchronous in tests.
 * @implements {IContextManager}
 */
export class MockContextManager implements IContextManager {
  /** @private The in-memory key-value store for the context. */
  private store: Record<string, any> = {};
  /** @private The HTTP header name used for the correlation ID. */
  private correlationIdHeader = 'x-correlation-id';
  /** @private The HTTP header name used for the transaction ID. */
  private transactionIdHeader = 'x-trace-id';

  /**
   * Configures the mock context manager.
   * @param options The configuration options.
   * @param options.correlationIdHeader The custom header name to use for the correlation ID.
   * @param options.transactionIdHeader The custom header name for the transaction ID.
   */
  public configure(options?: {
    correlationIdHeader?: string;
    transactionIdHeader?: string;
  }): void {
    if (options?.correlationIdHeader) {
      this.correlationIdHeader = options.correlationIdHeader;
    }
    if (options?.transactionIdHeader) {
      this.transactionIdHeader = options.transactionIdHeader;
    }
  }

  /**
   * Simulates running a function within a new, isolated context.
   * It saves the current context, creates a new one inheriting the parent's values,
   * runs the callback, and then restores the original context. This process
   * correctly handles both synchronous and asynchronous callbacks.
   * @template T The return type of the callback.
   * @param {() => T} callback The function to execute within the new context.
   * @returns {T} The result of the callback.
   */
  public async run(fn: () => void | Promise<void>): Promise<void> {
    // Deep-clone the original store to ensure true isolation.
    const originalStore = JSON.parse(JSON.stringify(this.store));
    this.store = { ...this.store }; // Inherit from parent for the current run.

    try {
      // Await the callback, which might be sync or async.
      await fn();
    } finally {
      // Always restore the original, unmodified context.
      this.store = originalStore;
    }
  }

  /**
   * Gets a value from the mock context by its key.
   * @template T The expected type of the value.
   * @param {string} key The key of the value to retrieve.
   * @returns The value, or `undefined` if not found.
   */
  get<T = any>(key: string): T | undefined {
    return this.store[key];
  }

  /**
   * Gets a shallow copy of the entire mock context store.
   * @returns {Record<string, any>} An object containing all context data.
   */
  getAll(): Record<string, any> {
    // Return a shallow copy to prevent direct mutation of the internal store.
    return { ...this.store };
  }

  /**
   * Sets a key-value pair in the mock context.
   * @param {string} key The key for the value.
   * @param {any} value The value to store.
   * @returns {void}
   */
  set(key: string, value: any): void {
    this.store[key] = value;
  }

  /**
   * Clears the in-memory store.
   * Useful for resetting state between tests (e.g., in a `beforeEach` hook).
   * @returns {void}
   */
  clear(): void {
    this.store = {};
  }

  /**
   * A convenience method to get the correlation ID from the mock context.
   * @returns {string | undefined} The correlation ID, or undefined if not set.
   */
  getCorrelationId(): string | undefined {
    // The key in the context is always 'correlationId'.
    return this.get('correlationId');
  }

  /**
   * A convenience method to get the transaction ID from the mock context.
   * @returns {string | undefined} The transaction ID, or undefined if not set.
   */
  getTransactionId(): string | undefined {
    // The key in the context is always 'transactionId'.
    return this.get('transactionId');
  }

  /**
   * A convenience method to set the transaction ID in the mock context.
   * @param {string} transactionId The transaction ID to set.
   */
  setTransactionId(transactionId: string): void {
    // The key in the context is always 'transactionId'.
    this.set('transactionId', transactionId);
  }

  /**
   * Gets the configured HTTP header name used for the correlation ID.
   * @returns {string} The header name.
   */
  getCorrelationIdHeaderName(): string {
    return this.correlationIdHeader;
  }

  /**
   * Gets the configured HTTP header name used for the transaction ID.
   * @returns {string} The header name.
   */
  getTransactionIdHeaderName(): string {
    return this.transactionIdHeader;
  }

  /**
   * Mock implementation for getting trace context headers.
   * In a real tracing scenario, this would be populated.
   * @returns `undefined` as this mock does not implement tracing.
   */
  public getTraceContextHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const correlationId = this.getCorrelationId();
    const transactionId = this.getTransactionId();
    if (correlationId) {
      headers[this.getCorrelationIdHeaderName()] = correlationId;
    }
    if (transactionId) {
      headers[this.getTransactionIdHeaderName()] = transactionId;
    }
    return headers;
  }

  public getFilteredContext(): Record<string, unknown> {
    return this.getAll();
  }
}
