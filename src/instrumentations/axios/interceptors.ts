
import {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
  AxiosRequestHeaders,
} from 'axios';
import { v4 as uuidv4 } from 'uuid'; // Importar uuidv4
import { ILogger } from '../../logger';
import { IContextManager } from '../../context';
import { redactObject, redactHeaders } from '../../http/utils/redact';
import type { BeaconHttpConfig } from '../../config';

/**
 * Custom Axios request configuration type to include our metadata.
 */
export interface BeaconAxiosRequestConfig extends InternalAxiosRequestConfig {
  /** Metadata for BeaconLog, such as request start time. */
  _beaconMeta?: {
    startTime: number;
  };

}

/**
 * @interface BeaconAxiosError
 * @extends AxiosError
 * Custom error type to ensure the configuration has our type.
 */
export interface BeaconAxiosError extends AxiosError {
  config?: BeaconAxiosRequestConfig;
}

export class BeaconAxiosInterceptors {
  private readonly logger: ILogger;
  private readonly contextManager: IContextManager;
  private readonly httpConfig: Required<BeaconHttpConfig>;

  constructor(
    logger: ILogger,
    contextManager: IContextManager,
    httpConfig: Required<BeaconHttpConfig>
  ) {
    this.logger = logger;
    this.contextManager = contextManager;
    this.httpConfig = httpConfig;
  }

  private getFullUrl(
    config:
      | BeaconAxiosRequestConfig
      | InternalAxiosRequestConfig
      | AxiosError['config']
  ): string | undefined {
    if (!config || typeof config.url !== 'string') return undefined;

    if (config.url.startsWith('http://') || config.url.startsWith('https://')) {
      return config.url;
    }

    if (config.baseURL && config.url) {
      const baseUrlEndsWithSlash = config.baseURL.endsWith('/');
      const urlStartsWithSlash = config.url.startsWith('/');

      if (baseUrlEndsWithSlash && urlStartsWithSlash) {
        return config.baseURL + config.url.substring(1);
      }
      if (!baseUrlEndsWithSlash && !urlStartsWithSlash && config.url) {
        return config.baseURL + '/' + config.url;
      }
      return config.baseURL + config.url;
    }
    return config.url;
  }

  public handleRequest(
    config: InternalAxiosRequestConfig
  ): BeaconAxiosRequestConfig {
    const correlationId = this.contextManager.getCorrelationId() || uuidv4();
    const correlationHeaderName =
      this.contextManager.getCorrelationIdHeaderName();

    config.headers = config.headers || {};
    (config.headers as AxiosRequestHeaders)[correlationHeaderName] =
      correlationId;

    const beaconConfig = config as BeaconAxiosRequestConfig;
    beaconConfig._beaconMeta = { startTime: Date.now() };

    const urlForLog =
      this.getFullUrl(beaconConfig) || beaconConfig.url || 'unknown URL';

    const logObject: any = {
      axios: { method: beaconConfig.method, url: urlForLog },
    };

    if (this.httpConfig.logRequestHeaders) {
      logObject.axios.requestHeaders = redactHeaders(
        beaconConfig.headers,
        this.httpConfig.sensitiveHeaders
      );
    }
    if (this.httpConfig.logRequestBody && beaconConfig.data) {
      let dataToSanitize = beaconConfig.data;
      if (typeof dataToSanitize === 'string') {
        try {
          dataToSanitize = JSON.parse(dataToSanitize);
        } catch (e) {
          /* No es JSON, sanitizar como string */
        }
      }
      logObject.axios.requestBody = redactObject(
        dataToSanitize,
        this.httpConfig.sensitiveBodyFields
      );
    }

    this.logger.info(
      `[Axios Request] Starting ${beaconConfig.method?.toUpperCase()} to ${urlForLog}`,
      logObject
    );
    return beaconConfig;
  }

  public handleResponse(response: AxiosResponse): AxiosResponse {
    const config = response.config as BeaconAxiosRequestConfig;
    const elapsedMs = config._beaconMeta
      ? Date.now() - config._beaconMeta.startTime
      : undefined;

    const urlForLog = this.getFullUrl(config) || config.url || 'unknown URL';

    const logObject: any = {
      axios: {
        method: config.method,
        url: urlForLog,
        status: response.status,
        durationMs: elapsedMs,
      },
    };

    if (this.httpConfig.logResponseHeaders) {
      logObject.axios.responseHeaders = redactHeaders(
        response.headers,
        this.httpConfig.sensitiveHeaders
      );
    }
    if (this.httpConfig.logResponseBody && response.data) {
      let dataToSanitize = response.data;
      if (typeof dataToSanitize === 'string') {
        try {
          dataToSanitize = JSON.parse(dataToSanitize);
        } catch (e) {
          /* No es JSON, sanitizar como string */
        }
      }
      logObject.axios.responseBody = redactObject(
        dataToSanitize,
        this.httpConfig.sensitiveBodyFields
      );
    }

    this.logger.info(
      `[Axios Response] ${response.status} from ${urlForLog}`,
      logObject
    );
    return response;
  }

  public handleRequestError(error: AxiosError): Promise<AxiosError> {
    const urlForLog =
      this.getFullUrl(error.config) || error.config?.url || 'unknown URL';
    this.logger.error(`[Axios Request Setup Error] to ${urlForLog}`, {
      axios: { method: error.config?.method, url: urlForLog },
      error: { message: error.message, stack: error.stack, code: error.code },
    });
    return Promise.reject(error);
  }

  public handleResponseError(
    error: BeaconAxiosError
  ): Promise<BeaconAxiosError> {
    const config = error.config;
    const elapsedMs = config?._beaconMeta
      ? Date.now() - config._beaconMeta.startTime
      : undefined;
    const errorType = this.classifyAxiosError(error);
    const urlForLog = this.getFullUrl(config) || config?.url || 'unknown URL';

    const logObject: any = {
      axios: {
        method: config?.method,
        url: urlForLog,
        status: error.response?.status,
        errorCode: error.code,
        durationMs: elapsedMs,
      },
      error: { message: error.message, type: errorType },
    };

    // ... (la lógica de redactar headers y body se mantiene igual, usando this.httpConfig)

    const logMessage = `[Axios Error] ${errorType} for ${config?.method?.toUpperCase()} ${urlForLog}`;
    this.logger.error(logMessage, logObject);

    return Promise.reject(error);
  }

  private classifyAxiosError(error: AxiosError): string {
    if (error.code === 'ECONNABORTED') {
      return 'TimeoutError';
    }
    if (error.isAxiosError && error.response) {
      return `HttpError-${error.response.status}`;
    }
    if (error.request) {
      return `NetworkError${error.code ? `-${error.code}` : ''}`;
    }
    return `GenericAxiosError${error.code ? `-${error.code}` : ''}`;
  }
}