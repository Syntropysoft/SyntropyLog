// @file src/context/ContextManager.ts
// @description The default implementation of the IContextManager interface. It uses Node.js's
// `AsyncLocalStorage` to create and manage asynchronous contexts, enabling
// seamless propagation of data like correlation IDs across async operations.

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'crypto';
import { IContextManager } from './IContextManager';
import { LogLevel } from '../logger/levels';
import {
  ContextValue,
  ContextData,
  ContextConfig,
  ContextCallback,
  ContextHeaders,
  FilteredContext,
  LoggingMatrix,
} from '../types';

interface Context {
  data: Map<string, ContextValue>;
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
  private loggingMatrix: LoggingMatrix | undefined;

  constructor(loggingMatrix?: LoggingMatrix) {
    this.storage = new AsyncLocalStorage();
    this.loggingMatrix = loggingMatrix;
  }

  public configure(options: ContextConfig): void {
    if (options.correlationIdHeader) {
      this.correlationIdHeader = options.correlationIdHeader;
    }
    if (options.transactionIdHeader) {
      this.transactionIdHeader = options.transactionIdHeader;
    }
  }

  /**
   * Reconfigures the logging matrix dynamically.
   * This method allows changing which context fields are included in logs
   * without affecting security configurations like masking or log levels.
   * @param newMatrix The new logging matrix configuration
   */
  public reconfigureLoggingMatrix(newMatrix: LoggingMatrix): void {
    this.loggingMatrix = newMatrix;
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
  public run(fn: ContextCallback): Promise<void> {
    return new Promise((resolve, reject) => {
      const parentContext = this.storage.getStore();
      const newContextData = new Map(parentContext?.data);

      this.storage.run({ data: newContextData }, async () => {
        try {
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
  public get<T = ContextValue>(key: string): T | undefined {
    return this.storage.getStore()?.data.get(key) as T | undefined;
  }

  /**
   * Gets the entire key-value store from the current asynchronous context.
   * @returns {ContextData} An object containing all context data, or an empty object if outside a context.
   */
  public getAll(): ContextData {
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
  public set(key: string, value: ContextValue): void {
    const store = this.storage.getStore();
    if (store) {
      store.data.set(key, value);
    }
  }

  /**
   * Gets the correlation ID from the current context.
   * If no correlation ID exists, generates one automatically to ensure tracing continuity.
   * @returns {string} The correlation ID (never undefined).
   */
  public getCorrelationId(): string {
    let correlationId =
      this.get(this.correlationIdHeader) || this.get('correlationId');

    if (!correlationId || typeof correlationId !== 'string') {
      // Generate correlationId if none exists to ensure tracing continuity
      correlationId = randomUUID();
      this.set(this.correlationIdHeader, correlationId);
    }

    return correlationId as string;
  }

  /**
   * Sets the correlation ID in the current context.
   * This sets the value in the configured header name.
   * @param correlationId The correlation ID to set.
   */
  public setCorrelationId(correlationId: string): void {
    this.set(this.correlationIdHeader, correlationId);
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
  public getTraceContextHeaders(): ContextHeaders {
    const headers: ContextHeaders = {};

    // Only include headers if we're inside an active context
    const store = this.storage.getStore();
    if (!store) {
      return headers; // Return empty object if outside context
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

  public getFilteredContext(level: LogLevel): FilteredContext {
    const fullContext = this.getAll();

    if (!this.loggingMatrix) {
      // Si no hay loggingMatrix, siempre incluir el correlationId
      const context = { ...fullContext };
      const headerCorrelationId = this.get(this.correlationIdHeader);
      const internalCorrelationId = this.get('correlationId');

      // Si no existe el correlationId del header, usar el interno
      if (!headerCorrelationId && internalCorrelationId) {
        context[this.correlationIdHeader] = internalCorrelationId;
      }

      return context;
    }

    const fieldsToKeep =
      this.loggingMatrix[level] ?? this.loggingMatrix.default;
    if (!fieldsToKeep) {
      return {};
    }

    // Mapeo de nombres de campos del loggingMatrix a claves reales del contexto
    const fieldMapping: Record<string, string[]> = {
      correlationId: [this.correlationIdHeader, 'correlationId'],
      transactionId: [this.transactionIdHeader, 'transactionId'],
      userId: ['userId'],
      serviceName: ['serviceName'],
      operation: ['operation'],
      errorCode: ['errorCode'],
      tenantId: ['tenantId'],
      paymentId: ['paymentId'],
      orderId: ['orderId'],
      processorId: ['processorId'],
      eventType: ['eventType'],
    };

    if (fieldsToKeep.includes('*')) {
      // Apply field mapping even for wildcard to ensure consistency
      const mappedContext: FilteredContext = {};

      // Map all fields using the same logic as specific fields
      for (const [key, value] of Object.entries(fullContext)) {
        // Find the mapped field name for this key
        let mappedFieldName = key;
        for (const [matrixField, possibleKeys] of Object.entries(
          fieldMapping
        )) {
          if (possibleKeys.includes(key)) {
            mappedFieldName = matrixField;
            break;
          }
        }
        mappedContext[mappedFieldName] = value;
      }

      return mappedContext;
    }

    const filteredContext: FilteredContext = {};

    for (const field of fieldsToKeep) {
      // Buscar en el mapeo de campos
      const possibleKeys = fieldMapping[field] || [field];

      // Buscar la primera clave que exista en el contexto
      for (const key of possibleKeys) {
        if (Object.prototype.hasOwnProperty.call(fullContext, key)) {
          filteredContext[field] = fullContext[key];
          break;
        }
      }

      // Si no se encontró en el mapeo, buscar directamente
      if (
        !Object.prototype.hasOwnProperty.call(filteredContext, field) &&
        Object.prototype.hasOwnProperty.call(fullContext, field)
      ) {
        filteredContext[field] = fullContext[field];
      }
    }

    return filteredContext;
  }
}
