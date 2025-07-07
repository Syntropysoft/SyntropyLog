/**
 * FILE: src/instrumentations/got/createInstrumentedGot.ts
 * DESCRIPTION: Factory function to create an instrumented 'got' HTTP client instance.
 */
import got, { Got, OptionsInit, Options, Response, RequestError } from 'got';
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { SyntropyLogConfig } from '../../config';

// Extend the Got context to include our metadata
interface InstrumentedGotContext extends Record<string, unknown> {
  syntropy_startTime?: number;
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
  instanceConfig?: OptionsInit
): Got {
  const gotLogger = logger.withSource('got');

  const instrumentedGot = got.extend({
    ...instanceConfig,
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
          // ... (logic for other trace headers if needed)

          gotLogger.info(
            {
              method: options.method,
              url: options.url?.toString(),
              request: {
                headers: options.headers,
                body: options.json || options.body,
              },
            },
            'Starting HTTP request (got)'
          );
        },
      ],
      afterResponse: [
        (response: Response) => {
          const context = response.request.options
            .context as InstrumentedGotContext;
          const durationMs = context.syntropy_startTime
            ? Date.now() - context.syntropy_startTime
            : -1;

          gotLogger.info(
            {
              statusCode: response.statusCode,
              url: response.url,
              durationMs,
              response: {
                headers: response.headers,
                body: response.body,
              },
            },
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
          const durationMs = context?.syntropy_startTime
            ? Date.now() - context.syntropy_startTime
            : -1;

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
            `HTTP request failed (got): ${error.message}`
          );

          return error;
        },
      ],
    },
  });

  return instrumentedGot;
}
