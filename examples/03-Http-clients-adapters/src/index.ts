/**
 * EXAMPLE: THE NEW HTTP CLIENT ARCHITECTURE (WITH ADAPTERS)
 *
 * This example demonstrates the power of the new Inversion of Control (IoC) architecture.
 * Instead of configuring a client "type," we now inject an "adapter."
 * This gives us the freedom to use ANY HTTP client, regardless of its version,
 * in a consistent manner.
 */

import axios from 'axios';
import got, { Got, RequestError as GotRequestError } from 'got';
import nock from 'nock';
import { randomUUID } from 'node:crypto';
import { ClassicConsoleTransport, syntropyLog } from 'syntropylog';
import type { IncomingHttpHeaders } from 'node:http';

// =================================================================
//  CORRECCIÓN: Importamos 'node-fetch' para asegurar la compatibilidad con nock.
// =================================================================
import fetch from 'node-fetch';
import type { RequestInfo, RequestInit, Response } from 'node-fetch';

// --- STEP 1: Import or create the adapters ---

import {
  AxiosAdapter,
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
  AdapterHttpError,
} from 'syntropylog/http';

// Adapter for Fetch (using node-fetch)
class FetchAdapter implements IHttpClientAdapter {
  async request<T>(
    request: AdapterHttpRequest
  ): Promise<AdapterHttpResponse<T>> {
    const response = await fetch(request.url as RequestInfo, {
      method: request.method,
      headers: request.headers as Record<string, string>,
      body: request.body as string | undefined, // Ensure body is string for node-fetch
    });
    const data = (await response.json()) as T;
    return {
      statusCode: response.status,
      data: data,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }
}

function normalizeGotHeaders(
  headers: IncomingHttpHeaders
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

// Adapter for Got
class GotAdapter implements IHttpClientAdapter {
  private readonly gotInstance: Got;

  constructor(instance: Got) {
    this.gotInstance = instance;
  }

  async request<T>(
    request: AdapterHttpRequest
  ): Promise<AdapterHttpResponse<T>> {
    try {
      const response = await this.gotInstance<T>(request.url, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        json: request.body,
        searchParams: request.queryParams,
        throwHttpErrors: false,
      });

      if (!response.ok) {
        throw new GotRequestError(
          response.statusMessage || 'HTTP Error',
          {},
          response.request
        );
      }

      return {
        statusCode: response.statusCode,
        data: response.body,
        headers: normalizeGotHeaders(response.headers),
      };
    } catch (error) {
      if (error instanceof GotRequestError) {
        const normalizedError: AdapterHttpError = {
          name: 'AdapterHttpError',
          message: error.message,
          stack: error.stack,
          isAdapterError: true,
          request: request,
          response: error.response
            ? {
                statusCode: error.response.statusCode,
                data: error.response.body,
                headers: normalizeGotHeaders(error.response.headers),
              }
            : undefined,
        };
        throw normalizedError;
      }
      throw error;
    }
  }
}

// --- Mock Server Setup ---
const MOCK_API_URL = 'https://api.example.com';

async function main() {
  console.log('--- Running Adapter-based HTTP Client Example ---');

  syntropyLog.init({
    logger: {
      level: 'trace',
      serviceName: 'adapter-based-example',
      transports: [new ClassicConsoleTransport()],
      serializerTimeoutMs: 50,
      serializers: {
        err: (e: any) => `[${e.name || 'Error'}] ${e.message?.split('\n')[0]}`,
      },
    },
    context: {
      correlationIdHeader: 'X-Correlation-ID',
    },
    http: {
      instances: [
        {
          instanceName: 'myAxiosApi',
          adapter: new AxiosAdapter(axios.create({ baseURL: MOCK_API_URL })),
        },
        {
          instanceName: 'myFetchApi',
          adapter: new FetchAdapter(),
        },
        {
          instanceName: 'myGotApi',
          adapter: new GotAdapter(got.extend({ prefixUrl: MOCK_API_URL })),
        },
      ],
    },
  });

  const contextManager = syntropyLog.getContextManager();
  await contextManager.run(async () => {
    const correlationId = randomUUID();
    contextManager.set(
      contextManager.getCorrelationIdHeaderName(),
      correlationId
    );

    const logger = syntropyLog.getLogger('main');
    const axiosClient = syntropyLog.getHttp('myAxiosApi');
    const gotClient = syntropyLog.getHttp('myGotApi');
    const fetchClient = syntropyLog.getHttp('myFetchApi');

    // Mock the responses
    nock(MOCK_API_URL)
      .get('/users/1')
      .reply(200, { id: 1, name: 'User via Axios' });
    nock(MOCK_API_URL)
      .get('/products/123')
      .reply(200, { id: 123, name: 'Product via Got' });
    nock(MOCK_API_URL)
      .get('/inventory/1')
      .reply(200, { id: 1, stock: 100 });

    logger.info('--- Testing the Axios-based client ---');
    await axiosClient.request({ method: 'GET', url: '/users/1', headers: {} });

    logger.info('--- Testing the Got-based client ---');
    await gotClient.request({
      method: 'GET',
      url: 'products/123',
      headers: {},
    });

    logger.info('--- Testing the Fetch-based client ---');
    await fetchClient.request({
      method: 'GET',
      url: `${MOCK_API_URL}/inventory/1`,
      headers: {},
    });
  });
  await syntropyLog.shutdown();
  console.log('\n✅ Adapter-based example finished successfully.');
}

main().catch((error) => {
  console.error(`Unexpected error in main: ${error.message}`);
  process.exit(1);
});
