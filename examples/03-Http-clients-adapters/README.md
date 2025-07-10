# 03-Http Clients adapters

This example demonstrates the powerful **adapter-based architecture** for instrumenting HTTP clients in `syntropylog`.

Instead of being limited to pre-defined client types, this new approach allows you to create and inject your own adapters. This gives you the freedom to use **any** HTTP client library (like `axios`, `got`, `node-fetch`, or a custom one) while benefiting from `syntropylog`'s automatic context propagation, logging, and instrumentation.

This example shows how to instrument `axios`, `got`, and `node-fetch` side-by-side using this pattern.

## Prerequisites

Before running this example, you must first build the main `syntropylog` library from the project's root directory:

```bash
# From the project root
npm run build
```

This step ensures that the local `beaconlog` dependency used by this example is up-to-date. After building, you can proceed with installing the example's dependencies.

## Running the example

 **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the example:**
   ```bash
   npm start
   ```

This will execute the `index.ts` file, which logs messages with an associated context.

## Example

```ts
/**
 * EXAMPLE: THE NEW HTTP CLIENT ARCHITECTURE (WITH ADAPTERS)
 *
 * This example demonstrates the power of the new Inversion of Control (IoC) architecture.
 * Instead of configuring a client "type," we now inject an "adapter."
 * This gives us the freedom to use ANY HTTP client, regardless of its version,
 * in a consistent manner.
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
            // Disable retries to ensure predictable behavior for this example
            retry: { limit: 0 },
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
      .reply(500, { error: 'Internal Server Error' });

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

```

## Output result

```log
npm run start

> 03-fetch_and_got@1.0.0 start
> tsx src/index.ts

--- Running Adapter-based HTTP Client Example ---
2025-07-10 17:03:30 DEBUG [redis-manager]  :: No Redis configuration was provided or no instances were defined. RedisManager initialized empty.
2025-07-10 17:03:30 INFO  [http-manager]  :: HTTP client instance "myAxiosApi" created successfully via adapter.
2025-07-10 17:03:30 INFO  [http-manager]  :: HTTP client instance "myFetchApi" created successfully via adapter.
2025-07-10 17:03:30 INFO  [http-manager]  :: HTTP client instance "myGotApi" created successfully via adapter.
2025-07-10 17:03:30 INFO  [syntropylog-main]  :: SyntropyLog framework initialized successfully.
2025-07-10 17:03:30 INFO  [main] [X-Correlation-ID="0dcfb0a4-28ea-4399-bbee-f471d09dde69"] :: --- Testing the Axios-based client ---
2025-07-10 17:03:30 INFO  [myAxiosApi] [X-Correlation-ID="0dcfb0a4-28ea-4399-bbee-f471d09dde69" method="GET" url="/users/1"] :: Starting HTTP request
2025-07-10 17:03:30 INFO  [myAxiosApi] [X-Correlation-ID="0dcfb0a4-28ea-4399-bbee-f471d09dde69" statusCode=200 url="/users/1" method="GET" durationMs=14] :: HTTP response received
2025-07-10 17:03:30 INFO  [main] [X-Correlation-ID="0dcfb0a4-28ea-4399-bbee-f471d09dde69"] :: --- Testing the Got-based client ---
2025-07-10 17:03:30 INFO  [myGotApi] [X-Correlation-ID="0dcfb0a4-28ea-4399-bbee-f471d09dde69" method="GET" url="products/123"] :: Starting HTTP request
2025-07-10 17:03:30 INFO  [myGotApi] [X-Correlation-ID="0dcfb0a4-28ea-4399-bbee-f471d09dde69" statusCode=200 url="products/123" method="GET" durationMs=8] :: HTTP response received
2025-07-10 17:03:30 INFO  [main] [X-Correlation-ID="0dcfb0a4-28ea-4399-bbee-f471d09dde69"] :: --- Testing the Fetch-based client ---
2025-07-10 17:03:30 INFO  [myFetchApi] [X-Correlation-ID="0dcfb0a4-28ea-4399-bbee-f471d09dde69" method="GET" url="https://api.example.com/inventory/1"] :: Starting HTTP request
2025-07-10 17:03:30 INFO  [myFetchApi] [X-Correlation-ID="0dcfb0a4-28ea-4399-bbee-f471d09dde69" statusCode=200 url="https://api.example.com/inventory/1" method="GET" durationMs=11] :: HTTP response received
2025-07-10 17:03:30 INFO  [syntropylog-main]  :: Shutting down SyntropyLog framework...
2025-07-10 17:03:30 INFO  [redis-manager]  :: Closing all Redis connections...
2025-07-10 17:03:30 INFO  [redis-manager]  :: All Redis connections have been closed.
2025-07-10 17:03:30 INFO  [syntropylog-main]  :: SyntropyLog shut down successfully.

✅ Adapter-based example finished successfully.
```