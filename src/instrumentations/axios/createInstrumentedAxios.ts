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
import { SyntropyLogConfig } from '../../config'; // Using the main config type


interface InstrumentedAxiosRequestConfig extends InternalAxiosRequestConfig {
  syntropy_startTime?: number;
}

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
  instanceConfig?: AxiosRequestConfig
): AxiosInstance {
  const instance = axios.create(instanceConfig);
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

      // The log payload contains the raw objects.
      // The central SerializerRegistry and MaskingEngine will process them.
      axiosLogger.info(
        {
          method: config.method?.toUpperCase(),
          url: axios.getUri(config),
          request: {
            headers: config.headers,
            body: config.data,
          },
        },
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


        axiosLogger.info(
          {
            statusCode: response.status,
            url: axios.getUri(response.config),
            durationMs,
            response: {
              headers: response.headers,
              body: response.data,
            },
          },
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
