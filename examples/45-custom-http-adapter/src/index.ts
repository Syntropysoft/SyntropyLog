import { syntropyLog, CompactConsoleTransport } from 'syntropylog';
import {
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
  AdapterHttpError,
} from 'syntropylog/http';
import { randomUUID } from 'crypto';
import nock from 'nock';
import got, { Got, RequestError as GotRequestError } from 'got';
import type { IncomingHttpHeaders } from 'http';

const MOCK_API_URL = 'https://api.example.com';

// --- STEP 1: Implement the custom adapter ---

/**
 * A helper to convert Got's complex header object into a simple Record.
 */
function normalizeGotHeaders(headers: IncomingHttpHeaders): Record<string, string | number | string[]> {
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

/**
 * This is our custom adapter for the 'got' library.
 * It implements the IHttpClientAdapter interface, acting as a translator.
 */
class GotAdapter implements IHttpClientAdapter {
  private readonly gotInstance: Got;

  constructor(instance: Got) {
    this.gotInstance = instance;
  }

  async request<T>(request: AdapterHttpRequest): Promise<AdapterHttpResponse<T>> {
    try {
      // Translate the generic request to a Got-specific one
      const response = await this.gotInstance<T>(request.url, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        json: request.body,
        searchParams: request.queryParams,
        throwHttpErrors: false,
      });

      if (!response.ok) {
        throw new GotRequestError(response.statusMessage || 'HTTP Error', {}, response.request);
      }
      
      // Translate the Got response back to the generic format
      return {
        statusCode: response.statusCode,
        data: response.body,
        headers: normalizeGotHeaders(response.headers),
      };
    } catch (error: any) {
      if (error instanceof GotRequestError) {
        // Translate a Got error back to the generic format
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


// --- STEP 2: Use the custom adapter ---

async function main() {
  syntropyLog.init({
    logger: {
      serviceName: 'custom-adapter-example',
      level: 'info',
      transports: [new CompactConsoleTransport()],
      serializerTimeoutMs: 100,
    },
    context: {
      correlationIdHeader: 'X-Correlation-ID',
    },
    http: {
      instances: [
        {
          instanceName: 'my-got-client',
          // Here we pass an *instance* of our custom adapter.
          adapter: new GotAdapter(got.extend({ prefixUrl: MOCK_API_URL })),
        },
      ],
    },
  });

  const logger = syntropyLog.getLogger('main');
  logger.info('Initialized.');

  nock(MOCK_API_URL)
    .get('/products/456')
    .reply(200, function (uri, requestBody) {
      const correlationHeader = this.req.headers['x-correlation-id'];
      if (!correlationHeader) {
        throw new Error('X-Correlation-ID header was not received!');
      }
      logger.info('Nock mock confirmed: Correlation ID received!', { correlationId: correlationHeader });
      return { id: 456, name: 'SyntropyWidget' };
    });

  const contextManager = syntropyLog.getContextManager();
  await contextManager.run(async () => {
    const correlationId = randomUUID();
    contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
    
    logger.info('Context created. Making HTTP call...');

    const apiClient = syntropyLog.getHttp('my-got-client');

    try {
      await apiClient.request({
        method: 'GET',
        url: '/products/456',
        headers: {},
      });
    } catch (error: any) {
      logger.error('API call failed', { error });
    }
    
    logger.info('Request finished.');
  });
  
  await syntropyLog.shutdown();
}

main(); 