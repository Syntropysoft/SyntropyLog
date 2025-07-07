import axios, { AxiosInstance } from 'axios';
import nock from 'nock';
import { randomUUID } from 'node:crypto';
import { beaconLog } from '../../../src';

// --- Mock Server Setup ---
// We use nock to simulate an external API. This ensures the example
// runs predictably without real network calls.
const MOCK_API_URL = 'https://api.example.com';

async function main() {
  console.log('--- Running HTTP Client Instrumentation Example ---');

  // 1. Initialize BeaconLog with HTTP client configurations.
  beaconLog.init({
    logger: {
      level: 'info',
      serviceName: 'http-client-axios-example',
    },
    context: {
      correlationIdHeader: 'X-TRACE-ID',
    },
    http: {
      instances: [
        {
          instanceName: 'myAxios',
          type: 'axios',
          // You can pass native axios config here.
          // The instrumented client will be an axios instance created with this config.
          config: { baseURL: MOCK_API_URL },
        },
      ],
    },
  });

  // 2. Create a context for this "unit of work".
  // In a real app, this would wrap an incoming web request.
  const contextManager = beaconLog.getContextManager();
  await contextManager.run(async () => {
    // 3. Set the correlation ID for this context.
    // All subsequent operations (logs, HTTP calls) will automatically use this ID.
    const correlationIdHeaderName = contextManager.getCorrelationIdHeaderName();
    const correlationId = randomUUID();
    contextManager.set(correlationIdHeaderName, correlationId);

    const axiosClient = beaconLog.getHttpClient('myAxios');

    // Get a logger instance. The name ('main') is a key to retrieve this specific
    // logger from anywhere in the application. If it doesn't exist, it's created.
    //
    // Note on log output: The 'serviceName' configured in init() takes precedence
    // as the logger's name in the output. The name provided here ('main') is
    // primarily for retrieval and acts as a fallback name if 'serviceName'
    // is not set.
    const logger = beaconLog.getLogger('main');

    logger.info('Context created. Making request with instrumented axios...');

    // Setup the mock response for the API endpoint, including the correlation ID
    // in the response headers.
    nock(MOCK_API_URL)
      .get('/users/1')
      .reply(200, { id: 1, name: 'Mocked User' });

    // The correlation ID will be injected into the headers automatically.
    await (axiosClient as AxiosInstance).get('/users/1');
  });

  // 4. Gracefully shut down when the application finishes
  await beaconLog.shutdown();

  console.log(
    '\n✅ Example finished. Check the console output for the structured JSON logs.'
  );
  console.log(
    'Each log entry for the HTTP requests should contain details like `http.method`, `http.url`, `http.status_code`, and `http.duration_ms`.'
  );
}

main().catch((error) => {
  console.error('Error running example:', error);
  process.exit(1);
});
