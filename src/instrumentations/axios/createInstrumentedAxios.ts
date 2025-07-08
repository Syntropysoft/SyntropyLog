/**
 * FILE: src/instrumentations/axios/createInstrumentedAxios.ts
 * DESCRIPTION: Factory function to create an instrumented Axios instance.
 */
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { HttpClientInstanceConfig, SyntropyLogConfig } from '../../config'; // Using the main config type


interface InstrumentedAxiosRequestConfig extends InternalAxiosRequestConfig {
  syntropy_startTime?: number;
}
type AxiosInstanceConfig = Extract<HttpClientInstanceConfig, { type: 'axios' }>;

/**
 * Creates an instrumented Axios instance with built-in logging and context propagation.
 * @param logger - The logger instance for logging requests and responses.
 * @param contextManager - The context manager to handle correlation IDs and tracing.
 * @param globalHttpConfig - The global HTTP configuration for sanitization and logging rules.
 * @param instanceConfig - Optional base configuration for the Axios instance (e.g., baseURL).
 * @returns An instrumented AxiosInstance.
 */
export function createInstrumentedAxios(
  logger: ILogger,
  contextManager: IContextManager,
  globalConfig: SyntropyLogConfig, // We now receive the global config
  instanceConfig: AxiosInstanceConfig
): AxiosInstance {
  const instance = axios.create(instanceConfig.config);
  const axiosLogger = logger.withSource('axios');

  // --- Request Interceptor ---
  instance.interceptors.request.use(
    (config: InstrumentedAxiosRequestConfig) => {
      config.syntropy_startTime = Date.now();

      // Inject Correlation ID and other trace headers
      const correlationId = contextManager.getCorrelationId();
      if (correlationId) {
        config.headers[contextManager.getCorrelationIdHeaderName()] =
          correlationId;
      }

      const logLevel = instanceConfig.logging?.onRequest ?? 'info';

      const logPayload: Record<string, any> = {
        method: config.method?.toUpperCase(),
        url: axios.getUri(config),
      };

      if (
        instanceConfig.logging?.logRequestHeaders ||
        instanceConfig.logging?.logRequestBody
      ) {
        logPayload.request = {};
        if (instanceConfig.logging.logRequestHeaders) {
          logPayload.request.headers = config.headers;
        }
        if (instanceConfig.logging.logRequestBody) {
          logPayload.request.body = config.data;
        }
      }

      (axiosLogger as any)[logLevel](
        logPayload,
        'Starting HTTP request (axios)'
      );

      return config;
    }
  );

  // --- Response Interceptor ---
  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      const config = response.config as InstrumentedAxiosRequestConfig;
      const durationMs = config.syntropy_startTime
        ? Date.now() - config.syntropy_startTime
        : -1;

      // Lógica de logging condicional
      const logLevel = instanceConfig.logging?.onSuccess ?? 'info';
      const logPayload: Record<string, any> = {
        statusCode: response.status,
        url: axios.getUri(response.config),
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
          logPayload.response.body = response.data;
        }
      }

      (axiosLogger as any)[logLevel](
        logPayload,
        'HTTP response received (axios)'
      );

      return response;
    },
    (error: AxiosError) => {
      const config = error.config as InstrumentedAxiosRequestConfig;
      const durationMs = config?.syntropy_startTime
        ? Date.now() - config.syntropy_startTime
        : -1;

      axiosLogger.error(
        {
          err: error,
          url: axios.getUri(error.config),
          durationMs,
          response: error.response
            ? {
                statusCode: error.response.status,
                headers: error.response.headers,
                body: error.response.data,
              }
            : 'No response',
        },
        `HTTP request failed (axios): ${error.message}`
      );

      return Promise.reject(error);
    }
  );

  return instance;
}
