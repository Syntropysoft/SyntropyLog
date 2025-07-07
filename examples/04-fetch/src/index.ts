/**
 * EXAMPLE: HTTP CLIENTS (FETCH)
 *
 * This example demonstrates how to configure and use instrumented HTTP clients.
 * BeaconLog automatically logs key information about each request and response.
 *
 * To run this example:
 * Node.js 18+ is recommended, as `fetch` is globally available.
 */

import { MockAgent, setGlobalDispatcher } from 'undici';
import { randomUUID } from 'node:crypto';
import { beaconLog } from '../../../src';

const MOCK_API_URL = 'https://api.example.com';

// --- Mock Server Setup using undici ---
// For native `fetch`, which is backed by `undici`, the most reliable way to
// mock requests is by using `undici`'s own `MockAgent`. This avoids
// compatibility issues that can occur with `nock`.

// 1. Create a MockAgent instance.
const mockAgent = new MockAgent();
mockAgent.disableNetConnect(); // Crucially, prevent any real network calls.

// 2. Set the global dispatcher to our mock agent.
// This intercepts all `fetch` calls globally.
setGlobalDispatcher(mockAgent);

async function main() {
  console.log('--- Running HTTP Client Instrumentation Example ---');

  // 1. Initialize BeaconLog with HTTP client configurations
  beaconLog.init({
    logger: {
      level: 'info',
      serviceName: 'http-client-fetch-example',
    },
    context: {
      correlationIdHeader: 'x-my-correlation-id',
    },
    http: {
      instances: [
        {
          instanceName: 'myFetch',
          type: 'fetch',
        },
      ],
    },
  });

  // 2. Create a context for this "unit of work".
  // In a real app, this would wrap an incoming web request.
  const contextManager = beaconLog.getContextManager();
  await contextManager.run(async () => {
    // 3. Set the correlation ID for this context.
    // All subsequent operations (logs, HTTP calls) will automatically use it.
    contextManager.set(
      contextManager.getCorrelationIdHeaderName(),
      randomUUID()
    );

    const fetchClient = beaconLog.getHttpClient('myFetch');

    // Get a logger instance. The name ('main-2') is a key to retrieve this specific
    // logger from anywhere in the application. If it doesn't exist, it's created.
    //
    // Note on log output: The 'serviceName' configured in init() takes precedence
    // as the logger's name in the output. The name provided here ('main-2') is
    // primarily for retrieval and acts as a fallback name if 'serviceName'
    // is not set.
    const logger = beaconLog.getLogger('main-2');

    logger.info('Context created. Making request with instrumented fetch...');

    // Define the mock for the specific API endpoint.
    const mockPool = mockAgent.get(MOCK_API_URL);
    mockPool
      .intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Mocked User' });

    // The correlation ID will be injected into the headers automatically.
    await (fetchClient as typeof fetch)(`${MOCK_API_URL}/users/1`);
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
