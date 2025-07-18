/**
 * @file src/adapters/http/AxiosAdapter.ts
 * @description An implementation of the IHttpClientAdapter for the Axios library.
 * This class acts as a "translator," converting requests and responses
 * between the framework's generic format and the Axios-specific format.
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  isAxiosError,
  AxiosResponseHeaders,
  RawAxiosResponseHeaders,
} from 'axios';
import {
  AdapterHttpRequest,
  AdapterHttpResponse,
  IHttpClientAdapter,
  AdapterHttpError,
} from '../../http/adapters/adapter.types';

/**
 * A helper function to normalize the Axios headers object.
 * The Axios header type is complex (`AxiosResponseHeaders` | `RawAxiosResponseHeaders`),
 * while our adapter interface expects a simple `Record<string, ...>`.
 * This function performs the conversion safely.
 * @param {RawAxiosResponseHeaders | AxiosResponseHeaders} headers - The Axios headers object.
 * @returns {Record<string, string | number | string[]>} A simple, normalized headers object.
 */
function normalizeHeaders(
  headers: RawAxiosResponseHeaders | AxiosResponseHeaders
): Record<string, string | number | string[]> {
  const normalized: Record<string, string | number | string[]> = {};
  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      // Axios headers can be undefined, so we ensure they are not included.
      const value = headers[key];
      if (value !== undefined && value !== null) {
        normalized[key] = value;
      }
    }
  }
  return normalized;
}

/**
 * @class AxiosAdapter
 * @description An adapter that allows SyntropyLog to instrument HTTP requests
 * made with the Axios library. It implements the `IHttpClientAdapter` interface.
 * @implements {IHttpClientAdapter}
 */
export class AxiosAdapter implements IHttpClientAdapter {
  private readonly axiosInstance: AxiosInstance;

  /**
   * @constructor
   * @param {AxiosRequestConfig | AxiosInstance} config - Either a pre-configured
   * Axios instance or a configuration object to create a new instance.
   */
  constructor(config: AxiosRequestConfig | AxiosInstance) {
    if ('request' in config && typeof config.request === 'function') {
      this.axiosInstance = config as AxiosInstance;
    } else {
      this.axiosInstance = axios.create(config as AxiosRequestConfig);
    }
  }

  /**
   * Executes an HTTP request using the configured Axios instance.
   * It translates the generic `AdapterHttpRequest` into an `AxiosRequestConfig`,
   * sends the request, and then normalizes the Axios response or error back
   * into the framework's generic format (`AdapterHttpResponse` or `AdapterHttpError`).
   * @template T The expected type of the response data.
   * @param {AdapterHttpRequest} request The generic request object.
   * @returns {Promise<AdapterHttpResponse<T>>} A promise that resolves with the normalized response.
   * @throws {AdapterHttpError} Throws a normalized error if the request fails.
   */
  async request<T>(
    request: AdapterHttpRequest
  ): Promise<AdapterHttpResponse<T>> {
    try {
      // Sanitize headers before passing them to Axios.
      // The `request.headers` object from the instrumenter contains the full context,
      // which might include non-string values or keys that are not valid HTTP headers.
      // This ensures we only pass valid, string-based headers to the underlying client.
      const sanitizedHeaders: Record<string, string> = {};
      const excludedHeaders = ['host', 'connection', 'content-length']; // Headers to exclude

      for (const key in request.headers) {
        if (
          Object.prototype.hasOwnProperty.call(request.headers, key) &&
          typeof request.headers[key] === 'string' &&
          !excludedHeaders.includes(key.toLowerCase()) // Exclude problematic headers
        ) {
          sanitizedHeaders[key] = request.headers[key] as string;
        }
      }

      const axiosConfig: AxiosRequestConfig = {
        url: request.url,
        method: request.method,
        headers: sanitizedHeaders,
        params: request.queryParams,
        data: request.body,
      };

      const response = await this.axiosInstance.request<T>(axiosConfig);

      return {
        statusCode: response.status,
        data: response.data,
        headers: normalizeHeaders(response.headers),
      };
    } catch (error) {
      if (isAxiosError(error)) {
        const normalizedError: AdapterHttpError = {
          name: 'AdapterHttpError',
          message: error.message,
          stack: error.stack,
          isAdapterError: true,
          request: request,
          response: error.response
            ? {
                statusCode: error.response.status,
                data: error.response.data,
                headers: normalizeHeaders(error.response.headers),
              }
            : undefined,
        };
        throw normalizedError;
      }

      throw error;
    }
  }
}
