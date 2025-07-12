/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @file src/http/adapters/adapter.types.ts
 * @description Defines the "Universal HTTP Contract" for any HTTP client that
 * wants to be instrumented by SyntropyLog. These generic interfaces are key
 * to decoupling the framework from specific implementations like axios or got.
 */

/**
 * @interface AdapterHttpRequest
 * @description Represents a generic, normalized HTTP request that the framework
 * can understand. The adapter is responsible for converting this to the
 * specific format of the underlying library (e.g., AxiosRequestConfig).
 */
export interface AdapterHttpRequest {
  /** The full URL for the request. */
  url: string;
  /** The HTTP method. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  /** A record of request headers. */
  headers: Record<string, string | number | string[]>;
  /** The request body, if any. */
  body?: unknown;
  /** A record of URL query parameters. */
  queryParams?: Record<string, any>;
}

/**
 * @interface AdapterHttpResponse
 * @description Represents a generic, normalized HTTP response. The adapter
 * will convert the library-specific response into this format.
 * @template T The expected type of the response body data.
 */
export interface AdapterHttpResponse<T = any> {
  /** The HTTP status code of the response. */
  statusCode: number;
  /** The response body data. */
  data: T;
  /** A record of response headers. */
  headers: Record<string, string | number | string[]>;
}

/**
 * @interface AdapterHttpError
 * @description Represents a generic, normalized HTTP error. The adapter
 * will convert the library-specific error into this format.
 */
export interface AdapterHttpError extends Error {
  /** The original request that caused the error. */
  request: AdapterHttpRequest;
  /** The response received, if any. */
  response?: AdapterHttpResponse;
  /** A flag to identify this as a normalized adapter error. */
  isAdapterError: true;
}

/**
 * @interface IHttpClientAdapter
 * @description The interface that every HTTP Client Adapter must implement.
 * This is the "plug" where users will connect their clients.
 */
export interface IHttpClientAdapter {
  /**
   * The core method that the SyntropyLog instrumenter needs. It executes an
   * HTTP request and returns a normalized response, or throws a normalized error.
   * @template T The expected type of the response body data.
   * @param {AdapterHttpRequest} request The generic HTTP request to execute.
   * @returns {Promise<AdapterHttpResponse<T>>} A promise that resolves with the normalized response.
   */
  request<T>(request: AdapterHttpRequest): Promise<AdapterHttpResponse<T>>;
}
