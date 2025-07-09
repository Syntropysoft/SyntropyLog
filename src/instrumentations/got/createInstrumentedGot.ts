/**
 * FILE: src/instrumentations/got/createInstrumentedGot.ts
 * DESCRIPTION: Factory function to create an instrumented 'got' HTTP client instance.
 */
import gotDefault, {
  Got,
  OptionsInit,
  Options,
  Response,
  RequestError,
} from 'got';
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { HttpClientInstanceConfig, SyntropyLogConfig } from '../../config';
import { InstrumentedHttpClient } from '../../http';

// Extend the Got context to include our metadata
interface InstrumentedGotContext extends Record<string, unknown> {
  syntropy_startTime?: number;
}
type GotInstanceConfig = Extract<HttpClientInstanceConfig, { type: 'got' }>;

/**
 * Calculates the duration of a request from the start time stored in the context.
 * @param context The instrumented 'got' context.
 * @returns The duration in milliseconds, or -1 if the start time is not available.
 */
function calculateDuration(context: InstrumentedGotContext | undefined): number {
  return context?.syntropy_startTime ? Date.now() - context.syntropy_startTime : -1;
}

/**
 * Creates an instrumented 'got' instance with logging and context propagation
 * handled by the central SyntropyLog framework.
 * @param logger - The logger instance (pre-configured).
 * @param contextManager - The shared context manager.
 * @param globalConfig - The entire framework configuration.
 * @param instanceConfig - Optional base configuration for the 'got' instance.
 * @returns An instrumented 'got' instance.
 */
export function createInstrumentedGot(
  logger: ILogger,
  contextManager: IContextManager,
  globalConfig: SyntropyLogConfig,
  instanceConfig: GotInstanceConfig
): Got {
  const gotLogger = logger.withSource('got');

  const instrumentedGot = (gotDefault as any).default.extend({
    ...instanceConfig.config,
    hooks: {
      beforeRequest: [
        (options: Options) => {
          // Ensure context is an object and extend it
          options.context = {
            ...options.context,
            syntropy_startTime: Date.now(),
          } as InstrumentedGotContext;

          // Inject Correlation ID
          const correlationId = contextManager.getCorrelationId();
          if (correlationId) {
            options.headers[contextManager.getCorrelationIdHeaderName()] =
              correlationId;
          }

          const logLevel = instanceConfig.logging?.onRequest ?? 'info';

          const logPayload: Record<string, any> = {
            method: options.method,
            url: options.url?.toString(),
          };

          if (
            instanceConfig.logging?.logRequestHeaders ||
            instanceConfig.logging?.logRequestBody
          ) {
            logPayload.request = {};
            if (instanceConfig.logging.logRequestHeaders) {
              logPayload.request.headers = options.headers;
            }
            if (instanceConfig.logging.logRequestBody) {
              logPayload.request.body = options.json || options.body;
            }
          }

          (gotLogger as any)[logLevel](
            logPayload,
            'Starting HTTP request (got)'
          );
        },
      ],
      afterResponse: [
        (response: Response) => {
          // =================================================================
          //  SOLUTION 1: PREVENT DUPLICATE LOGS FOR HTTP ERRORS
          //  If the response is not 'ok' (e.g., status 4xx or 5xx), we do
          //  nothing here. We return the response so that 'got' processes
          //  it as an error and triggers the 'beforeError' hook, which is
          //  the correct place to log this type of failure.
          // =================================================================
          if (!response.ok) {
            return response;
          }

          const context = response.request.options
            .context as InstrumentedGotContext;
          const durationMs = calculateDuration(context);

          const logLevel = instanceConfig.logging?.onSuccess ?? 'info';

          const logPayload: Record<string, any> = {
            statusCode: response.statusCode,
            url: response.url,
            durationMs,
          };

          if (
            instanceConfig.logging?.logSuccessHeaders ||
            instanceConfig.logging?.logSuccessBody
          ) {
            logPayload.response = {};
            if (instanceConfig.logging.logSuccessHeaders) {
              logPayload.response.headers = response.headers;
            }
            if (instanceConfig.logging.logSuccessBody) {
              logPayload.response.body = response.body;
            }
          }

          (gotLogger as any)[logLevel](
            logPayload,
            'HTTP response received (got)'
          );

          return response;
        },
      ],
      beforeError: [
        (error: RequestError) => {
          const context = error.request?.options.context as
            | InstrumentedGotContext
            | undefined;
          const durationMs = calculateDuration(context);

          gotLogger.error(
            {
              err: error,
              url: error.options.url?.toString(),
              method: error.options.method,
              durationMs,
              response: error.response
                ? {
                    statusCode: error.response.statusCode,
                    headers: error.response.headers,
                    body: error.response.body,
                  }
                : 'No response',
            },
            'HTTP request failed (got)' // Simple and static main message
          );

          return error;
        },
      ],
    },
  });

  return instrumentedGot;
}
