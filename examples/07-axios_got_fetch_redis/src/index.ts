/**
 * EXAMPLE: HTTP & REDIS CLIENTS
 *
 * This example demonstrates how to configure and use instrumented HTTP and Redis
 * clients. All operations performed within the same asynchronous context will
 * share the same correlation ID, making it easy to trace a request's lifecycle
 * across different services.
 *
 * To run this example:
 * 1. Make sure you have installed the necessary peer dependencies: `npm install redis`
 * 2. Start a local Redis instance. You can use the provided `docker-compose.yml`:
 *    `docker-compose up -d`
 */

import { randomUUID } from 'node:crypto';
import { beaconLog } from '../../../src';
import { getUserServiceFetch } from './container/container';
import { MaskConfig } from '../../../dist/types/config/MaskConfig';
import { maskSensitiveData } from '../../../src/masking/maskSensitiveData';
import { sanitizeConfig } from '../../../src/utils/sanitizeConfig';

async function main() {
  let success = true;
  console.log('--- Running HTTP & Redis Client Example ---');

  // 1. Initialize BeaconLog with Redis client configurations.
  beaconLog.init({
    logger: {
      // NOTE: Redis and HTTP logs are emitted at the 'debug' and 'info' levels.
      // We set the level to 'debug' here to make them visible in the console.
      level: 'debug',
      serviceName: 'arch-example',
    },
    context: {
      correlationIdHeader: 'X-TRACE-ID',
    },
    // Global sensitive keys. These will be inherited by all modules.
    customSensitiveKeys: ['name'],
    redis: {
      instances: [
        {
          instanceName: 'cache',
          mode: 'single',
          // This URL should point to your Redis instance.
          // It's read from an environment variable for flexibility.
          url: process.env.REDIS_URL || 'redis://localhost:6379',
        },
      ],
      // (Optional) Module-specific keys, merged with the global ones.
      // customSensitiveKeys: ['email'],
    },
    http: {
      instances: [
        {
          instanceName: 'axios-client',
          type: 'axios',
          config: { baseURL: 'https://jsonplaceholder.typicode.com' },
        },
        {
          instanceName: 'got-client',
          type: 'got',
          config: { prefixUrl: 'https://jsonplaceholder.typicode.com' },
        },
        {
          instanceName: 'fetch-client',
          type: 'fetch',
          config: { baseURL: 'https://jsonplaceholder.typicode.com' },
        },
      ],
    },
  });

  // 2. Get the instrumented Redis client by its name.
  const redisClient = beaconLog.getRedis('cache');
  const logger = beaconLog.getLogger('main');

  // Get the user service *after* beaconLog has been initialized.
  // This call will trigger the lazy-loading in the container.
  const userServiceFetch = getUserServiceFetch();


  // 2. Create a context for this "unit of work".
  const contextManager = beaconLog.getContextManager();
  await contextManager.run(async () => {
    // 3. Set the correlation ID for this context.
    // All subsequent operations (logs, Redis commands) will automatically use this ID.
    const correlationIdHeaderName = contextManager.getCorrelationIdHeaderName();
    const correlationId = randomUUID();
    contextManager.set(correlationIdHeaderName, correlationId);

    logger.info(`--- Starting operation with Correlation ID: ${correlationId} ---`);

    const userKey = `user:${randomUUID()}`;
    const userData = { name: 'John Doe', email: 'john.doe@example.com' };

    try {
      // 4. Call the user service, which uses an instrumented HTTP client.
      // The outgoing request will automatically have the correlation ID header.
      console.log('\n--- Calling UserService (powered by Fetch) ---');
      const user = await userServiceFetch.getUser(1);
      logger.info('User fetched via Fetch adapter', { user });

      // Use the client just like you would with the `redis` library.
      // Each command will be logged with its context and performance metrics.
      await redisClient.set(userKey, JSON.stringify(userData));

      await redisClient.del(userKey);
    } catch (error) {
      success = false;
      logger.error('An error occurred in the main operation', { error });
    }

    logger.info('\n--- Operation finished ---');
  });

  // 4. Gracefully shut down all connections when the application finishes.
  await beaconLog.shutdown();

  console.log(
    '\n✅ Example finished. Check the console output for the structured JSON logs from both HTTP and Redis clients.'
  );
  console.log(
    'Each log entry for the Redis commands should contain details like `redis.command`, `redis.instance_name`, and `redis.duration_ms`.'
  );
}

main()
  .then(() => {
    console.log('Main function finished.');
  })
  .catch((error) => {
    // This catch block is for catastrophic errors that happen *outside* the main try/catch.
    // For example, an error during beaconLog.init().
    console.error('A catastrophic error occurred:', error);
    // Ensure shutdown is attempted before exiting.
    return beaconLog.shutdown();
  })
  .finally(() => process.exit(0));
