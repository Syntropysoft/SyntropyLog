/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * @file src/context/ContextManager.ts
 * @description The default implementation of the IContextManager interface. It uses Node.js's
 * `AsyncLocalStorage` to create and manage asynchronous contexts, enabling
 * seamless propagation of data like correlation IDs across async operations.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'crypto';
import { IContextManager } from './IContextManager';
import { LogLevel } from '../types';

interface Context {
  data: Map<string, any>;
}

export type LoggingMatrix = Partial<Record<LogLevel | 'default', string[]>>;

export interface SyntropyContextConfig {
  correlationIdHeader?: string;
  transactionIdHeader?: string;
}

/**
 * Manages asynchronous context using Node.js `AsyncLocalStorage`.
 * This is the core component for propagating context-specific data
 * (like correlation IDs) without passing them through function arguments.
 * @implements {IContextManager}
 */
export class ContextManager implements IContextManager {
  private storage = new AsyncLocalStorage<Context>();
  private correlationIdHeader = 'x-correlation-id';
  private transactionIdHeader = 'x-trace-id';
  private readonly loggingMatrix: LoggingMatrix | undefined;

  constructor(loggingMatrix?: LoggingMatrix) {
    this.storage = new AsyncLocalStorage();
    this.loggingMatrix = loggingMatrix;
  }

  public configure(options: SyntropyContextConfig): void {
    if (options.correlationIdHeader) {
      this.correlationIdHeader = options.correlationIdHeader;
    }
    if (options.transactionIdHeader) {
      this.transactionIdHeader = options.transactionIdHeader;
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
  public run(fn: () => void | Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const parentContext = this.storage.getStore();
      const newContextData = new Map(parentContext?.data);

      this.storage.run({ data: newContextData }, async () => {
        try {
          // Initialize correlation ID if not present
          if (!this.get('correlationId')) {
            this.set('correlationId', randomUUID());
          }
          await Promise.resolve(fn());
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Gets a value from the current asynchronous context by its key.
   * @template T The expected type of the value.
   * @param key The key of the value to retrieve.
   * @returns The value, or `undefined` if not found or if outside a context.
   */
  public get<T = any>(key: string): T | undefined {
    return this.storage.getStore()?.data.get(key);
  }

  /**
   * Gets the entire key-value store from the current asynchronous context.
   * @returns {Record<string, any>} An object containing all context data, or an empty object if outside a context.
   */
  public getAll(): Record<string, any> {
    const store = this.storage.getStore();
    if (!store) {
      return {};
    }
    return Object.fromEntries(store.data.entries());
  }

  /**
   * Sets a key-value pair in the current asynchronous context. This will have
   * no effect if called outside of a context created by `run()`.
   * This will only work if called within a context created by `run()`.
   * @param key The key for the value.
   * @param value The value to store.
   * @returns {void}
   */
  public set(key: string, value: any): void {
    const store = this.storage.getStore();
    if (store) {
      store.data.set(key, value);
    }
  }

  /**
   * Gets the correlation ID from the current context.
   * This is a convenience method that retrieves the value associated with the configured header name.
   * @returns {string | undefined} The correlation ID, or undefined if not set.
   */
  public getCorrelationId(): string | undefined {
    return this.get('correlationId');
  }

  /**
   * Gets the transaction ID from the current context.
   * @returns {string | undefined} The transaction ID, or undefined if not set.
   */
  public getTransactionId(): string | undefined {
    return this.get('transactionId');
  }

  /**
   * Sets the transaction ID in the current context.
   * @param transactionId The transaction ID to set.
   */
  public setTransactionId(transactionId: string): void {
    this.set('transactionId', transactionId);
  }

  /**
   * Gets the configured HTTP header name for the correlation ID.
   * @returns {string} The header name.
   */
  public getCorrelationIdHeaderName(): string {
    return this.correlationIdHeader;
  }

  public getTransactionIdHeaderName(): string {
    return this.transactionIdHeader;
  }

  /**
   * Gets the tracing headers to propagate the context (e.g., W3C Trace Context).
   * This base implementation does not support trace context propagation.
   * @returns `undefined` as this feature is not implemented by default.
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

  public getFilteredContext(level: LogLevel): Record<string, unknown> {
    const fullContext = this.getAll();
    if (!this.loggingMatrix) {
      return fullContext;
    }

    const fieldsToKeep =
      this.loggingMatrix[level] ?? this.loggingMatrix.default;
    if (!fieldsToKeep) {
      return {};
    }

    if (fieldsToKeep.includes('*')) {
      return { ...fullContext };
    }

    const filteredContext: Record<string, unknown> = {};
    for (const key of fieldsToKeep) {
      if (Object.prototype.hasOwnProperty.call(fullContext, key)) {
        filteredContext[key] = fullContext[key];
      }
    }
    return filteredContext;
  }
}
