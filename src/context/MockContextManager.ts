/*
 * @file src/context/MockContextManager.ts
 * @description Provides a mock implementation of the IContextManager interface,
 * designed specifically for use in testing environments.
 */

import type { IContextManager } from './IContextManager';
import {
  ContextValue,
  ContextData,
  ContextConfig,
  ContextCallback,
  ContextHeaders,
  FilteredContext,
  LoggingMatrix,
} from '../types';
import { randomUUID } from 'crypto';

/**
 * @class MockContextManager
 * @description A mock implementation of `IContextManager` for testing purposes.
 * It uses a simple in-memory object instead of AsyncLocalStorage,
 * making context management predictable and synchronous in tests.
 * @implements {IContextManager}
 */
export class MockContextManager implements IContextManager {
  /** @private The in-memory key-value store for the context. */
  private store: ContextData = {};
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
  public configure(options?: ContextConfig): void {
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
  public async run(fn: ContextCallback): Promise<void> {
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
  get<T = ContextValue>(key: string): T | undefined {
    return this.store[key] as T | undefined;
  }

  /**
   * Gets a shallow copy of the entire mock context store.
   * @returns {ContextData} An object containing all context data.
   */
  getAll(): ContextData {
    // Return a shallow copy to prevent direct mutation of the internal store.
    return { ...this.store };
  }

  /**
   * Sets a key-value pair in the mock context.
   * @param {string} key The key for the value.
   * @param {ContextValue} value The value to store.
   * @returns {void}
   */
  set(key: string, value: ContextValue): void {
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
   * @returns {string} The correlation ID, or a generated one if not set.
   */
  getCorrelationId(): string {
    // Return the value from the configured header name to avoid duplication in logs.
    let correlationId = this.get(this.correlationIdHeader);
    if (!correlationId || typeof correlationId !== 'string') {
      correlationId = randomUUID();
      this.set(this.correlationIdHeader, correlationId);
    }
    return correlationId as string;
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
  public getTraceContextHeaders(): ContextHeaders {
    const headers: ContextHeaders = {};
    // Only include headers if we have an active context (store is not empty)
    if (Object.keys(this.store).length === 0) {
      return headers; // Return empty object if no context is active
    }
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

  public getFilteredContext(): FilteredContext {
    return this.getAll();
  }

  /**
   * Reconfigures the logging matrix dynamically.
   * This method allows changing which context fields are included in logs
   * without affecting security configurations like masking or log levels.
   * @param newMatrix The new logging matrix configuration
   */
  public reconfigureLoggingMatrix(newMatrix: LoggingMatrix): void {
    // Mock implementation - no actual logging matrix in mock
    // This is just to satisfy the interface
  }
}
