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
          // ... (logic for other trace headers if needed)

          // 1. Leer el nivel de log para la petición
          const logLevel = instanceConfig.logging?.onRequest ?? 'info';

          // 2. Construir el payload base
          const logPayload: Record<string, any> = {
            method: options.method,
            url: options.url?.toString(),
          };

          // 3. Añadir detalles verbosos si la configuración lo indica
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

          // 4. Registrar con el nivel y payload dinámicos
          (gotLogger as any)[logLevel](
            logPayload,
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

          // 1. Leer el nivel de log desde la configuración de la instancia local.
          const logLevel = instanceConfig.logging?.onSuccess ?? 'info';

          // 2. Construir el objeto de log base.
          const logPayload: Record<string, any> = {
            statusCode: response.statusCode,
            url: response.url,
            durationMs,
          };

          // 3. Añadir detalles verbosos si la instancia lo requiere.
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

          // 4. Pasar el objeto preparado al logger. El logger hace el resto.
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
