/**
 * FILE: src/instrumentations/axios/createInstrumentedAxios.ts
 * DESCRIPTION: Factory function to create an instrumented Axios instance.
 */
import axios, {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { HttpClientInstanceConfig, SyntropyLogConfig } from '../../config';

/**
 * Extends Axios's request configuration to include a start time for duration tracking.
 */
interface InstrumentedAxiosRequestConfig extends InternalAxiosRequestConfig {
  syntropy_startTime?: number;
}

/**
 * Type alias for the specific configuration of an 'axios' HTTP client instance.
 */
type AxiosInstanceConfig = Extract<HttpClientInstanceConfig, { type: 'axios' }>;

/**
 * Creates an instrumented Axios instance with logging and context propagation
 * handled by the central SyntropyLog framework.
 * @param logger - The logger instance (pre-configured).
 * @param contextManager - The shared context manager.
 * @param globalConfig - The entire framework configuration.
 * @param instanceConfig - The specific configuration for this Axios instance.
 * @returns An instrumented Axios instance.
 */
export function createInstrumentedAxios(
  logger: ILogger,
  contextManager: IContextManager,
  globalConfig: SyntropyLogConfig,
  instanceConfig: AxiosInstanceConfig
): AxiosInstance {
  const instance = axios.create(instanceConfig.config);
  const axiosLogger = logger.withSource('axios');

  // --- Request Interceptor ---
  instance.interceptors.request.use(
    /**
     * Intercepts outgoing requests to inject correlation IDs, log the request,
     * and record the start time for duration calculation.
     */
    (config: InstrumentedAxiosRequestConfig): InternalAxiosRequestConfig => {
      config.syntropy_startTime = Date.now();

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

      if (instanceConfig.logging?.logRequestHeaders) {
        logPayload.headers = config.headers;
      }
      if (instanceConfig.logging?.logRequestBody) {
        logPayload.body = config.data;
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
    /**
     * Intercepts successful responses to log the outcome, including
     * status code and duration.
     */
    (response: AxiosResponse): AxiosResponse => {
      const config = response.config as InstrumentedAxiosRequestConfig;
      const durationMs = config.syntropy_startTime
        ? Date.now() - config.syntropy_startTime
        : -1;

      const logLevel = instanceConfig.logging?.onSuccess ?? 'info';
      const logPayload: Record<string, any> = {
        statusCode: response.status,
        url: axios.getUri(response.config),
        durationMs,
      };

      if (instanceConfig.logging?.logSuccessHeaders) {
        logPayload.headers = response.headers;
      }
      if (instanceConfig.logging?.logSuccessBody) {
        logPayload.body = response.data;
      }

      (axiosLogger as any)[logLevel](
        logPayload,
        'HTTP response received (axios)'
      );
      return response;
    },
    /**
     * Intercepts failed requests (both network errors and HTTP error statuses)
     * to log detailed error information.
     */
    (error: AxiosError): Promise<never> => {
      const config = error.config as InstrumentedAxiosRequestConfig;
      const durationMs = config?.syntropy_startTime
        ? Date.now() - config.syntropy_startTime
        : -1;

      axiosLogger.error(
        {
          err: error,
          url: axios.getUri(error.config),
          method: error.config?.method?.toUpperCase(),
          durationMs,
          response: error.response
            ? {
                statusCode: error.response.status,
                headers: error.response.headers,
                body: error.response.data,
              }
            : 'No response',
        },
        'HTTP request failed (axios)' // Simple and static main message
      );

      return Promise.reject(error);
    }
  );

  return instance;
}