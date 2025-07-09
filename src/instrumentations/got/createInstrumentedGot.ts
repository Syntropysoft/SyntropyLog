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
          //  SOLUCIÓN 1: PREVENIR LOGS DUPLICADOS PARA ERRORES HTTP
          //  Si la respuesta no es 'ok' (ej. status 4xx o 5xx), no hacemos
          //  nada aquí. Devolvemos la respuesta para que 'got' la procese
          //  como un error y active el hook 'beforeError', que es el lugar
          //  correcto para registrar este tipo de fallos.
          // =================================================================
          if (!response.ok) {
            return response;
          }

          const context = response.request.options
            .context as InstrumentedGotContext;
          const durationMs = context.syntropy_startTime
            ? Date.now() - context.syntropy_startTime
            : -1;

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
          const durationMs = context?.syntropy_startTime
            ? Date.now() - context.syntropy_startTime
            : -1;

          // =================================================================
          //  SOLUCIÓN 2: SIMPLIFICAR EL MENSAJE PRINCIPAL DEL LOG DE ERROR
          //  El mensaje principal ahora es estático. Los detalles del error
          //  se pasan en el primer argumento (el objeto), donde tu
          //  serializador personalizado para la clave 'err' se encargará
          //  de crear el resumen conciso.
          // =================================================================
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
            'HTTP request failed (got)' // Mensaje principal simple y estático
          );

          return error;
        },
      ],
    },
  });

  return instrumentedGot;
}
