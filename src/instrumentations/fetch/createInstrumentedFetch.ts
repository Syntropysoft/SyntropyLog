/**
 * FILE: src/instrumentations/fetch/createInstrumentedFetch.ts
 * DESCRIPTION: Factory function to create an instrumented `fetch` function.
 */
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { HttpClientInstanceConfig, SyntropyLogConfig } from '../../config';
import { InstrumentedFetch } from '../../http/types';


type FetchInstanceConfig = Extract<HttpClientInstanceConfig, { type: 'fetch' }>;


/**
 * Creates an instrumented `fetch` function with logging and context propagation
 * handled by the central SyntropyLog framework.
 * @param logger - The logger instance (pre-configured).
 * @param contextManager - The shared context manager.
 * @param globalConfig - The entire framework configuration.
 * @param instanceConfig - Optional base configuration for the fetch calls (e.g., default headers).
 * @returns An instrumented fetch function.
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

    // Merge instance config with call-specific config
    const requestInit: RequestInit = { ...instanceConfig.config, ...init };
    requestInit.headers = new Headers(requestInit.headers); // Ensure headers is a Headers object

    // Inject Correlation ID
    const correlationId = contextManager.getCorrelationId();
    if (correlationId) {
      requestInit.headers.set(
        contextManager.getCorrelationIdHeaderName(),
        correlationId
      );
    }
    // ... (logic for other trace headers if needed)

    const url = input instanceof Request ? input.url : input.toString();
    const method = requestInit.method?.toUpperCase() || 'GET';

    // Log the raw request object. The central pipeline will handle serialization and masking.
    const logLevel = instanceConfig.logging?.onRequest ?? 'info';

    const logPayload: Record<string, any> = {
      method,
      url,
    };

    if (
      instanceConfig.logging?.logRequestHeaders ||
      instanceConfig.logging?.logRequestBody
    ) {
      logPayload.request = {};
      if (instanceConfig.logging.logRequestHeaders) {
        logPayload.request.headers = requestInit.headers;
      }
      if (instanceConfig.logging.logRequestBody) {
        logPayload.request.body = requestInit.body;
      }
    }

    (fetchLogger as any)[logLevel](logPayload, 'Starting HTTP request (fetch)');

    try {
      const response = await fetch(input, requestInit);
      const durationMs = Date.now() - startTime;

      // Lógica de logging condicional
      const logLevel = instanceConfig.logging?.onSuccess ?? 'info';
      const logPayload: Record<string, any> = {
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
          try {
            responseBody = await responseToLog.text();
          } catch {
            responseBody = '[Unreadable response body]';
          }
        }

        logPayload.response = {};
        if (instanceConfig.logging.logSuccessHeaders) {
          logPayload.response.headers = response.headers;
        }
        if (instanceConfig.logging.logSuccessBody) {
          logPayload.response.body = responseBody;
        }
      }

      (fetchLogger as any)[logLevel](
        logPayload,
        'HTTP response received (fetch)'
      );

      return response;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      // The `err` object will be automatically serialized by our default error serializer.
      fetchLogger.error(
        {
          err: error,
          url,
          durationMs,
        },
        `HTTP request failed (fetch): ${error.message}`
      );
      throw error;
    }
  };
}
