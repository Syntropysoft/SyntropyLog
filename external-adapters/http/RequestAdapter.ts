import {
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
  AdapterHttpError,
} from '../../src/http/adapters/adapter.types';

// Using require for the legacy 'request' library is more robust.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const requestLib = require('request');
import type * as request from 'request';

function normalizeLegacyHeaders(
  headers: request.Headers,
): Record<string, string | number | string[]> {
  const normalized: Record<string, string | number | string[]> = {};
  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key)) {
      const value = headers[key];
      if (value !== undefined) {
        normalized[key] = value;
      }
    }
  }
  return normalized;
}

export class RequestAdapter implements IHttpClientAdapter {
  request<T>(request: AdapterHttpRequest): Promise<AdapterHttpResponse<T>> {
    return new Promise((resolve, reject) => {
      const options: request.Options = {
        uri: request.url,
        method: request.method,
        headers: request.headers,
        json: true,
        body: request.body,
      };

      requestLib(options, (error: any, response: request.Response, body: any) => {
        if (error) {
          const normalizedError: AdapterHttpError = {
            name: 'AdapterHttpError',
            message: error.message,
            stack: error.stack,
            isAdapterError: true,
            request,
          };
          return reject(normalizedError);
        }

        const responseData: AdapterHttpResponse<T> = {
          statusCode: response.statusCode,
          data: body,
          headers: normalizeLegacyHeaders(response.headers),
        };

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const normalizedError: AdapterHttpError = {
            name: 'AdapterHttpError',
            message: `Response code ${response.statusCode}`,
            isAdapterError: true,
            request,
            response: responseData,
          };
          return reject(normalizedError);
        }

        resolve(responseData);
      });
    });
  }
} 