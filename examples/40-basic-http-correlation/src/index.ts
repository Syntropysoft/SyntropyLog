import { syntropyLog, CompactConsoleTransport } from 'syntropylog';
import { AxiosAdapter } from 'syntropylog/http';
import { randomUUID } from 'crypto';
import nock from 'nock';
import axios from 'axios';

const MOCK_API_URL = 'https://api.example.com';

async function main() {
  // 1. Configure and initialize SyntropyLog.
  syntropyLog.init({
    logger: {
      serviceName: 'http-example',
      level: 'info',
      transports: [new CompactConsoleTransport()],
      serializerTimeoutMs: 100,
    },
    context: {
      // Define the header name for correlation ID propagation.
      correlationIdHeader: 'X-Correlation-ID',
    },
    http: {
      instances: [
        {
          instanceName: 'my-axios-client',
          // Here's the key: We instantiate the adapter.
          // We can pass a pre-configured axios instance or a config object.
          adapter: new AxiosAdapter(axios.create({ baseURL: MOCK_API_URL })),
        },
      ],
    },
  });

  const logger = syntropyLog.getLogger('main');
  logger.info('Initialized.');

  // 2. Mock the external API endpoint with Nock.
  nock(MOCK_API_URL)
    .get('/users/1')
    .reply(200, function (uri, requestBody) {
      const correlationHeader = this.req.headers['x-correlation-id'];
      if (!correlationHeader) {
        throw new Error('X-Correlation-ID header was not received!');
      }
      logger.info('Nock mock confirmed: Correlation ID received!', { correlationId: correlationHeader });
      return { id: 1, name: 'John Doe' };
    });

  // 3. Create a context for the operation using the ContextManager.
  const contextManager = syntropyLog.getContextManager();
  await contextManager.run(async () => {
    // Set the correlation ID for this context.
    const correlationId = randomUUID();
    contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
    
    logger.info('Context created. Making HTTP call...');

    // 4. Get the instrumented client.
    const apiClient = syntropyLog.getHttp('my-axios-client');

    // 5. Use the generic .request() method to make the call.
    try {
      await apiClient.request({
        method: 'GET',
        url: '/users/1', // The baseURL from the adapter config is used.
        headers: {}, // Headers can be added here.
      });
    } catch (error) {
      logger.error('API call failed', { error });
    }
    
    logger.info('Request finished.');
  });
  
  await syntropyLog.shutdown();
}

main();
