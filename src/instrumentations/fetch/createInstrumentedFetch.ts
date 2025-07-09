/**
 * FILE: src/instrumentations/fetch/createInstrumentedFetch.ts
 * DESCRIPTION: Factory function to create an instrumented `fetch` function.
 */
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { HttpClientInstanceConfig, SyntropyLogConfig } from '../../config';
import { InstrumentedFetch } from '../../http/types';

/**
 * Type alias for the specific configuration of a 'fetch' HTTP client instance.
 */
type FetchInstanceConfig = Extract<HttpClientInstanceConfig, { type: 'fetch' }>;

/**
 * Creates an instrumented `fetch` function with logging and context propagation
 * handled by the central SyntropyLog framework.
 * @param logger The logger instance (pre-configured).
 * @param contextManager The shared context manager.
 * @param globalConfig The entire framework configuration.
 * @param instanceConfig The specific configuration for this `fetch` instance.
 * @returns An instrumented `fetch` function.
 */
export function createInstrumentedFetch(
  logger: ILogger,
  contextManager: IContextManager,
  globalConfig: SyntropyLogConfig,
  instanceConfig: FetchInstanceConfig
): InstrumentedFetch {
  const fetchLogger = logger.withSource('fetch');

  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const startTime = Date.now();
    const requestInit: RequestInit = { ...instanceConfig.config, ...init };
    requestInit.headers = new Headers(requestInit.headers);

    const correlationId = contextManager.getCorrelationId();
    if (correlationId) {
      requestInit.headers.set(
        contextManager.getCorrelationIdHeaderName(),
        correlationId
      );
    }

    const url = input instanceof Request ? input.url : input.toString();
    const method = requestInit.method?.toUpperCase() || 'GET';
    const requestLogLevel = instanceConfig.logging?.onRequest ?? 'info';

    const requestLogPayload: Record<string, any> = { method, url };
    if (instanceConfig.logging?.logRequestHeaders) {
      requestLogPayload.headers = Object.fromEntries(
        requestInit.headers.entries()
      );
    }
    if (instanceConfig.logging?.logRequestBody) {
      requestLogPayload.body = requestInit.body;
    }

    (fetchLogger as any)[requestLogLevel](
      requestLogPayload,
      'Starting HTTP request (fetch)'
    );

    try {
      const response = await fetch(input, requestInit);
      const durationMs = Date.now() - startTime;

      // =================================================================
      //  SOLUTION: Differentiate between successful and error responses,
      //  something 'fetch' does not do by default.
      // =================================================================
      if (response.ok) {
        // --- Success Case (2xx status) ---
        const successLogLevel = instanceConfig.logging?.onSuccess ?? 'info';
        const successLogPayload: Record<string, any> = {
          statusCode: response.status,
          url,
          durationMs,
        };

        if (
          instanceConfig.logging?.logSuccessHeaders ||
          instanceConfig.logging?.logSuccessBody
        ) {
          const responseToLog = response.clone();
          let responseBody: any;
          try {
            responseBody = await responseToLog.json();
          } catch {
            responseBody = '[Unreadable response body]';
          }
          if (instanceConfig.logging.logSuccessHeaders) {
            successLogPayload.headers = Object.fromEntries(
              response.headers.entries()
            );
          }
          if (instanceConfig.logging.logSuccessBody) {
            successLogPayload.body = responseBody;
          }
        }
        (fetchLogger as any)[successLogLevel](
          successLogPayload,
          'HTTP response received (fetch)'
        );
      } else {
        // --- HTTP Error Case (4xx or 5xx status) ---
        const errorLogLevel = instanceConfig.logging?.onError ?? 'error';
        const errorLogPayload: Record<string, any> = {
          // Create a simple 'err' object for consistency with other instrumenters
          err: {
            name: 'HTTPError',
            message: `Response code ${response.status} (${response.statusText})`,
          },
          url,
          method,
          durationMs,
          response: {
            statusCode: response.status,
            headers: Object.fromEntries(response.headers.entries()),
          },
        };
        (fetchLogger as any)[errorLogLevel](
          errorLogPayload,
          'HTTP request failed (fetch)'
        );
      }

      return response;
    } catch (error: any) {
      // --- Network Error Case ---
      const durationMs = Date.now() - startTime;
      fetchLogger.error(
        {
          err: error, // The serializer will handle this
          url,
          method,
          durationMs,
        },
        'HTTP request failed (fetch)' // Static message
      );
      throw error;
    }
  };
}