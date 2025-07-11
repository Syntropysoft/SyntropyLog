/**
 * @file src/http/InstrumentedHttpClient.ts
 * @description This class is the heart of the HTTP instrumentation architecture.
 * It wraps any adapter that complies with `IHttpClientAdapter` and adds a centralized
 * layer of instrumentation (logging, context, timers).
 */

import { ILogger } from '../logger';
import { IContextManager } from '../context';
import {
  AdapterHttpRequest,
  AdapterHttpResponse,
  IHttpClientAdapter,
  AdapterHttpError,
} from './adapters/adapter.types';

/**
 * @interface InstrumentorOptions
 * @description Configuration options for the instrumenter, which would typically be
 * sourced from the global SyntropyLog configuration for a specific client instance.
 */
export interface InstrumentorOptions {
  /** Whether to log request headers. Defaults to false. */
  logRequestHeaders?: boolean;
  /** Whether to log the request body. Defaults to false. */
  logRequestBody?: boolean;
  /** Whether to log response headers on success. Defaults to false. */
  logSuccessHeaders?: boolean;
  /** Whether to log the response body on success. Defaults to false. */
  logSuccessBody?: boolean;
  /** Specifies the log levels for different request lifecycle events. */
  logLevel?: {
    /** Log level for when a request starts. Defaults to 'info'. */
    onRequest?: 'info' | 'debug' | 'trace';
    /** Log level for when a request succeeds. Defaults to 'info'. */
    onSuccess?: 'info' | 'debug' | 'trace';
    /** Log level for when a request fails. Defaults to 'error'. */
    onError?: 'error' | 'warn' | 'fatal';
  };
}

/**
 * @class InstrumentedHttpClient
 * @description Wraps an `IHttpClientAdapter` to provide automatic logging,
 * context propagation, and timing for all HTTP requests.
 */
export class InstrumentedHttpClient {
  /**
   * @constructor
   * @param {IHttpClientAdapter} adapter - The underlying HTTP client adapter (e.g., AxiosAdapter).
   * @param {ILogger} logger - The logger instance for this client.
   * @param {IContextManager} contextManager - The manager for handling asynchronous contexts.
   * @param {InstrumentorOptions} [options={}] - Configuration options for instrumentation.
   */
  constructor(
    private readonly adapter: IHttpClientAdapter,
    private readonly logger: ILogger,
    private readonly contextManager: IContextManager,
    private readonly options: InstrumentorOptions = {}
  ) {}

  /**
   * The single public method. It executes an HTTP request through the wrapped
   * adapter, applying all instrumentation logic.
   * @template T The expected type of the response data.
   * @param {AdapterHttpRequest} request - The generic HTTP request to execute.
   * @returns {Promise<AdapterHttpResponse<T>>} A promise that resolves with the normalized response.
   * @throws {AdapterHttpError | Error} Throws the error from the adapter, which is re-thrown after being logged.
   */
  public async request<T>(
    request: AdapterHttpRequest
  ): Promise<AdapterHttpResponse<T>> {
    const startTime = Date.now();

    if (!request.headers) {
      request.headers = {};
    }
    
    // 1. Inject the Correlation ID generically.
    const correlationId = this.contextManager.getCorrelationId();
    if (correlationId) {
      request.headers[this.contextManager.getCorrelationIdHeaderName()] =
        correlationId;
    }

    // 2. Log the start of the request.
    this.logRequestStart(request);

    try {
      // 3. Delegate execution to the adapter.
      const response = await this.adapter.request<T>(request);
      const durationMs = Date.now() - startTime;

      // 4. Log the successful completion of the request.
      this.logRequestSuccess(request, response, durationMs);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // 5. Log the failure of the request.
      this.logRequestFailure(request, error, durationMs);

      // 6. Re-throw the error so the user's code can handle it.
      throw error;
    }
  }

  /**
   * @private
   * Logs the start of an HTTP request, respecting the configured options.
   * @param {AdapterHttpRequest} request - The outgoing request.
   */
  private logRequestStart(request: AdapterHttpRequest): void {
    const logLevel = this.options.logLevel?.onRequest ?? 'info';
    const logPayload: Record<string, any> = {
      method: request.method,
      url: request.url,
    };

    if (this.options.logRequestHeaders) {
      logPayload.headers = request.headers;
    }
    if (this.options.logRequestBody) {
      logPayload.body = request.body;
    }

    (this.logger as any)[logLevel](logPayload, 'Starting HTTP request');
  }

  /**
   * @private
   * Logs the successful completion of an HTTP request.
   * @template T
   * @param {AdapterHttpRequest} request - The original request.
   * @param {AdapterHttpResponse<T>} response - The received response.
   * @param {number} durationMs - The total duration of the request in milliseconds.
   */
  private logRequestSuccess<T>(
    request: AdapterHttpRequest,
    response: AdapterHttpResponse<T>,
    durationMs: number
  ): void {
    const logLevel = this.options.logLevel?.onSuccess ?? 'info';
    const logPayload: Record<string, any> = {
      statusCode: response.statusCode,
      url: request.url,
      method: request.method,
      durationMs,
    };

    if (this.options.logSuccessHeaders) {
      logPayload.headers = response.headers;
    }
    if (this.options.logSuccessBody) {
      logPayload.body = response.data;
    }

    (this.logger as any)[logLevel](logPayload, 'HTTP response received');
  }

  /**
   * @private
   * Logs the failure of an HTTP request.
   * @param {AdapterHttpRequest} request - The original request.
   * @param {unknown} error - The error that was thrown.
   * @param {number} durationMs - The total duration of the request until failure.
   */
  private logRequestFailure(
    request: AdapterHttpRequest,
    error: unknown,
    durationMs: number
  ): void {
    const logLevel = this.options.logLevel?.onError ?? 'error';

    // Use the normalized adapter error if available for richer logging.
    if (error && (error as AdapterHttpError).isAdapterError) {
      const adapterError = error as AdapterHttpError;
      const logPayload: Record<string, any> = {
        err: adapterError, // The logger's serializer will handle this.
        url: request.url,
        method: request.method,
        durationMs,
        response: adapterError.response
          ? {
              statusCode: adapterError.response.statusCode,
              headers: adapterError.response.headers,
              body: adapterError.response.data,
            }
          : 'No response',
      };
      (this.logger as any)[logLevel](logPayload, 'HTTP request failed');
    } else {
      // If it's an unexpected error, log it as well.
      (this.logger as any)[logLevel](
        { err: error, url: request.url, method: request.method, durationMs },
        'HTTP request failed with an unexpected error'
      );
    }
  }
}
