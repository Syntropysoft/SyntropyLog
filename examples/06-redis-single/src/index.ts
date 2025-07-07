/**
 * EXAMPLE: REDIS CLIENT (SINGLE INSTANCE)
 *
 * This example demonstrates how to configure and use an instrumented Redis client
 * connected to a single Redis instance. BeaconLog automatically logs key information
 * about each command, including duration and context.
 *
 * To run this example:
 * 1. Make sure you have installed the necessary peer dependencies: `npm install redis`
 * 2. Start a local Redis instance. You can use the provided `docker-compose.yml`:
 *    `docker-compose up -d`
 */

import { randomUUID } from 'node:crypto';
import { beaconLog } from '../../../src';

async function main() {
  console.log('--- Running Redis Client (Single Instance) Example ---');

  // 1. Initialize BeaconLog with Redis client configurations.
  beaconLog.init({
    logger: {
      // NOTE: Redis command logs are emitted at the 'debug' level.
      // We set the level to 'debug' here to make them visible in the console.
      level: 'debug',
      serviceName: 'redis-single-example',
    },
    context: {
      correlationIdHeader: 'X-TRACE-ID',
    },
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
    },
  });

  // 2. Get the instrumented Redis client by its name.
  const redisClient = beaconLog.getRedis('cache');
  const logger = beaconLog.getLogger('main');

  // 2. Create a context for this "unit of work".
  const contextManager = beaconLog.getContextManager();
  await contextManager.run(async () => {
    // 3. Set the correlation ID for this context.
    // All subsequent operations (logs, Redis commands) will automatically use this ID.
    const correlationIdHeaderName = contextManager.getCorrelationIdHeaderName();
    const correlationId = randomUUID();
    contextManager.set(correlationIdHeaderName, correlationId);

    logger.info('Context created. Performing Redis operations...');

    const userKey = `user:${randomUUID()}`;
    const userData = { name: 'John Doe', email: 'john.doe@example.com' };

    try {
      // Use the client just like you would with the `redis` library.
      // Each command will be logged with its context and performance metrics.
      await redisClient.set(userKey, JSON.stringify(userData));
      
      await redisClient.del(userKey);
    } catch (error) {
      logger.error('An error occurred during Redis operations.', { error });
    }
  });

  // 4. Gracefully shut down all connections when the application finishes.
  await beaconLog.shutdown();

  console.log(
    '\n✅ Example finished. Check the console output for the structured JSON logs.'
  );
  console.log(
    'Each log entry for the Redis commands should contain details like `redis.command`, `redis.instance_name`, and `redis.duration_ms`.'
  );
}

main().catch((error) => {
  console.error('Error running example:', error);
  // Ensure Redis client is disconnected on error
  beaconLog.shutdown().finally(() => {
    process.exit(1);
  });
});
