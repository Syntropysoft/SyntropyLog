/*
=============================================================================
FILE: src/context/MockContextManager.ts
-----------------------------------------------------------------------------
DESCRIPTION:
Provides a mock implementation of the IContextManager interface, designed
for use in testing environments.
=============================================================================
*/

import type { IContextManager } from './IContextManager';

/**
 * A mock implementation of IContextManager for testing purposes.
 * It uses a simple in-memory object instead of AsyncLocalStorage,
 * making context management predictable and synchronous in tests.
 */
export class MockContextManager implements IContextManager {
  /** The in-memory key-value store for the context. */
  private store: Record<string, any> = {};
  /** The HTTP header name used for the correlation ID. */
  private correlationIdHeader = 'x-correlation-id';

  /**
   * Configures the mock context manager.
   * @param headerName The custom header name to use for the correlation ID.
   */
  public configure(headerName?: string): void {
    if (headerName) {
      this.correlationIdHeader = headerName;
    }
  }

  /**
   * Simulates running a function within a new, isolated context.
   * It clears the store, runs the callback, and then restores the previous
   * store, correctly handling both synchronous and asynchronous callbacks.
   * @param callback The function to execute.
   * @returns The result of the callback.
   */
  run<T>(callback: () => T): T {
    const originalStore = this.store;
    // Create a new store that inherits from the parent context.
    this.store = { ...originalStore };

    let result: T;
    try {
      result = callback();
    } catch (e) {
      // Restore store on synchronous error and re-throw.
      this.store = originalStore;
      throw e;
    }

    // If the callback is async, restore the store after the promise settles.
    if (result instanceof Promise) {
      return result.finally(() => {
        this.store = originalStore;
      }) as T;
    }

    // For synchronous callbacks, restore the store immediately.
    this.store = originalStore;
    return result;
  }

  /**
   * Gets a value from the mock context by its key.
   * @param key The key of the value to retrieve.
   * @returns The value, or `undefined` if not found.
   */
  get<T = any>(key: string): T | undefined {
    return this.store[key];
  }

  /**
   * Gets a shallow copy of the entire mock context store.
   * @returns An object containing all context data.
   */
  getAll(): Record<string, any> {
    // Return a shallow copy to prevent direct mutation of the internal store.
    return { ...this.store };
  }

  /**
   * Sets a key-value pair in the mock context.
   * @param key The key for the value.
   * @param value The value to store.
   */
  set(key: string, value: any): void {
    this.store[key] = value;
  }

  /**
   * Clears the in-memory store.
   * Useful for resetting state between tests (e.g., in a `beforeEach` hook).
   */
  clear(): void {
    this.store = {};
  }

  /**
   * Gets the correlation ID from the mock context.
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

  /**
   * Mock implementation for getting trace context headers.
   * In a real tracing scenario, this would be populated.
   * @returns `undefined` as this mock does not implement tracing.
   */
  getTraceContextHeaders(): Record<string, string> | undefined {
    // This mock does not propagate trace headers.
    // It can be extended or spied on in tests if needed.
    return undefined;
  }
}