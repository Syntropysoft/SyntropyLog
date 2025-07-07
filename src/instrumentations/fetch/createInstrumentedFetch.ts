/**
 * FILE: src/instrumentations/fetch/createInstrumentedFetch.ts
 * DESCRIPTION: Factory function to create an instrumented `fetch` function.
 */
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { SyntropyLogConfig } from '../../config';
import { InstrumentedFetch } from '../../http/types';

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
  instanceConfig?: RequestInit
): InstrumentedFetch {
  const fetchLogger = logger.withSource('fetch');

  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const startTime = Date.now();

    // Merge instance config with call-specific config
    const requestInit: RequestInit = { ...instanceConfig, ...init };
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
    fetchLogger.info(
      {
        method,
        url,
        request: {
          // Headers object will be serialized correctly by the pipeline
          headers: requestInit.headers,
          // The body can be of various types, let the serializer handle it
          body: requestInit.body,
        },
      },
      'Starting HTTP request (fetch)'
    );

    try {
      const response = await fetch(input, requestInit);
      const durationMs = Date.now() - startTime;

      // Clone the response to read the body without consuming it for the actual consumer.
      const responseToLog = response.clone();
      let responseBody: any;
      try {
        // Attempt to parse as JSON, fallback to text.
        responseBody = await responseToLog.json();
      } catch (e) {
        try {
          responseBody = await responseToLog.text();
        } catch (textError) {
          responseBody = '[Unreadable response body]';
        }
      }

      fetchLogger.info(
        {
          statusCode: response.status,
          url,
          durationMs,
          response: {
            headers: response.headers,
            body: responseBody,
          },
        },
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
