/**
 * EXAMPLE: HTTP CLIENTS (GOT)
 *
 * This example demonstrates how to configure and use instrumented HTTP clients.
 * syntropyLog automatically logs key information about each request and response.
 *
 * To run this example:
 * 1. Make sure you have installed the necessary peer dependencies: `npm install got`
 */

import got from 'got';
import nock from 'nock';
import { randomUUID } from 'node:crypto';
import {
  syntropyLog,
  CompactConsoleTransport,
  ConsoleTransport,
  ClassicConsoleTransport,
  PrettyConsoleTransport,
} from 'syntropylog';

// --- Mock Server Setup ---
// We use nock to simulate an external API. This ensures the example
// runs predictably without real network calls.
const MOCK_API_URL = 'https://api.example.com';

async function main() {
  console.log('--- Running HTTP Client Instrumentation Example ---')

  // 1. Initialize syntropyLog with HTTP client configurations
  syntropyLog.init({
    logger: {
      level: 'info',
      serviceName: 'http-client-example',
      serializerTimeoutMs: 50,
      transports: [new ClassicConsoleTransport()],
      serializers: {
        err: (e: any) => {
          // Para errores de Axios, Got, Nock, etc., que tienen un código y mensaje.
          if (e.code && e.message) {
            // Crea un resumen de una sola línea.
            return `[${e.name || 'Error'}] (${e.code}) ${e.message.split('\n')[0]}`;
          }
          // Para errores genéricos.
          return `[${e.name || 'Error'}] ${e.message}`;
        },
      },
    },
    context: {
      correlationIdHeader: 'X-something-ID',
    },
    http: {
      instances: [
        {
          instanceName: 'myGot',
          type: 'got',
          config: {
            prefixUrl: MOCK_API_URL,
          },
        },
      ],
    },
  });

  // 2. Create a context for this "unit of work".
  // In a real app, this would wrap an incoming web request.
  const contextManager = syntropyLog.getContextManager();
  await contextManager.run(async () => {
    // 3. Set the correlation ID for this context.
    // All subsequent operations (logs, HTTP calls) will automatically use it.
    const correlationIdHeaderName = contextManager.getCorrelationIdHeaderName();
    const correlationId = randomUUID();
    contextManager.set(correlationIdHeaderName, correlationId);

    const gotClient = syntropyLog.getHttp('myGot');

    // Get a logger instance. The name ('main') is a key to retrieve this specific
    // logger from anywhere in the application. If it doesn't exist, it's created.
    //
    // Note on log output: The 'serviceName' configured in init() takes precedence
    // as the logger's name in the output. The name provided here ('main') is
    // primarily for retrieval and acts as a fallback name if 'serviceName'
    // is not set.
    const logger = syntropyLog.getLogger('main');

    logger.info('Context created. Making request with instrumented got...');

    // Setup the mock response for the API endpoint, including the correlation ID
    // in the response headers.
    nock(MOCK_API_URL)
      .get('/users/1')
      .reply(200, { id: 1, name: 'Mocked User' });
    
    nock(MOCK_API_URL)
    .get('/product/1')
    .reply(500, 'Internal Server Error' )

    // The correlation ID will be injected into the headers automatically.
    await (gotClient as typeof got).get('users/1');
    try {

      await (gotClient as typeof got).get('product/1');
    } catch (err) { 
      syntropyLog.getLogger('main').error(`Error: ${err.message}`)
    }

  });

  // 4. Gracefully shut down when the application finishes
  await syntropyLog.shutdown();

  console.log(
    '\n✅ Example finished. Check the console output for the structured JSON logs.'
  );
  console.log(
    'Each log entry for the HTTP requests should contain details like `http.method`, `http.url`, `http.status_code`, and `http.duration_ms`.'
  );
}

main().catch((error) => {
  console.error(`Error running example: ${error.message}`);
  process.exit(1);
});
