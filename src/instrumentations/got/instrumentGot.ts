/**
 * FILE: src/instrumentations/got/instrumentGot.ts
 * DESCRIPTION: Applies BeaconLog hooks to a Got instance.
 */
import { Got, Options, Response } from 'got';
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { BeaconHttpConfig } from '../../config';
import { redactHeaders, redactObject } from '../../http/utils/redact';

/**
 * Instruments a Got instance by attaching hooks for logging and context propagation.
 *
 * @param gotInstance - The Got instance to instrument.
 * @param logger - The logger instance for instrumentation.
 * @param contextManager - The context manager for trace propagation.
 * @param globalHttpConfig - The global HTTP configuration.
 * @returns The instrumented Got instance.
 */
export function instrumentGot(
  gotInstance: Got,
  logger: ILogger,
  contextManager: IContextManager,
  globalHttpConfig: BeaconHttpConfig
): Got {
  const config = globalHttpConfig as Required<BeaconHttpConfig>;

  return gotInstance.extend({
    context: {
      _beaconMeta: {},
    },
    hooks: {
      beforeRequest: [
        (options: Options) => {
          options.context._beaconMeta = { startTime: Date.now() };

          const correlationId = contextManager.getCorrelationId();
          if (correlationId) {
            const headerName = contextManager.getCorrelationIdHeaderName();
            options.headers[headerName] = correlationId;
          }

          const logObject: any = {
            got: { method: options.method, url: options.url?.toString() },
          };

          if (config.logRequestHeaders) {
            logObject.got.requestHeaders = redactHeaders(options.headers, config.sensitiveHeaders);
          }
          if (config.logRequestBody && options.json) {
            logObject.got.requestBody = redactObject(options.json, config.sensitiveBodyFields);
          }

          logger.info(`[Got Request] Starting ${options.method} to ${options.url}`, logObject);
        },
      ],
      afterResponse: [
        (response: Response) => {
          const { options } = response.request;
          const elapsedMs = Date.now() - options.context._beaconMeta.startTime;

          const logObject: any = {
            got: { method: options.method, url: options.url?.toString(), status: response.statusCode, durationMs: elapsedMs },
          };

          if (config.logResponseHeaders) {
            logObject.got.responseHeaders = redactHeaders(response.headers, config.sensitiveHeaders);
          }
          if (config.logResponseBody && response.body) {
            let bodyToLog = response.body;
            if (typeof bodyToLog === 'string') {
              try { bodyToLog = JSON.parse(bodyToLog); } catch (e) { /* not json */ }
            }
            logObject.got.responseBody = redactObject(bodyToLog, config.sensitiveBodyFields);
          }

          logger.info(`[Got Response] ${response.statusCode} from ${options.url}`, logObject);
          return response;
        },
      ],
      beforeError: [
        (error) => {
          const { options } = error;
          const elapsedMs = options.context._beaconMeta?.startTime ? Date.now() - options.context._beaconMeta.startTime : undefined;

          const logObject: any = {
            got: { method: options.method, url: options.url?.toString(), status: error.response?.statusCode, errorCode: error.code, durationMs: elapsedMs },
            error: { name: error.name, message: error.message, stack: error.stack },
          };

          logger.error(`[Got Error] ${error.name} for ${options.method} ${options.url}`, logObject);
          return error;
        },
      ],
    },
  });
}