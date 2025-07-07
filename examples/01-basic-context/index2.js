import { syntropyLog, CompactConsoleTransport, ConsoleTransport,ClassicConsoleTransport, PrettyConsoleTransport } from 'syntropylog';
import { randomUUID } from 'crypto';

/**
 * Simulates a top-level service function.
 */
async function processOrder() {
  const logger = syntropyLog.getLogger('order-service');
  logger.info('Processing order...');
  // This function doesn't need to know about correlationId to pass it down.
  await checkInventory();
}

/**
 * Simulates a deep, nested business logic function.
 */
async function checkInventory() {
  // Get a logger instance. The name ('inventory-service') is a key to retrieve this specific
  // logger from anywhere in the application. If it doesn't exist, it's created.
  //
  // Note on log output: The 'serviceName' configured in init() takes precedence
  // as the logger's name in the output. The name provided here ('inventory-service') is
  // primarily for retrieval and acts as a fallback name if 'serviceName'
  // is not set.
  const logger = syntropyLog.getLogger('inventory-service');
  // This log will automatically contain the correlationId and userId from the context.
  logger.info('Checking inventory for the order.');
}

async function main() {
  // 1. Initialize BeaconLog with a minimal configuration.
  await syntropyLog.init({
    // The logger configuration is now simpler.
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      serviceName: 'my-awesome-app',
      // Use the appropriate transport for each environment.
      transports: [
        process.env.NODE_ENV === 'production'
          ? new ConsoleTransport() // Raw JSON for production
          : new ClassicConsoleTransport(), // Colored logs for development
      ],
      // Define how to transform complex objects into readable text.
      serializers: {
        user: (user) => `User(id=${user.id}, email=${user.email})`,
      },
    },
    // Define the header for the correlation ID.
    context: {
      correlationIdHeader: 'X-Correlation-ID',
    },
    // SINGLE SOURCE OF TRUTH for data masking.
    masking: {
      maskChar: '�',
      maxDepth: 8,
      fields: [
        // Simple and advanced rules for masking data in ANY log.
        { path: 'password', type: 'full' },
        { path: 'accessToken', type: 'full' },
        { path: 'creditCardNumber', type: 'partial', showLast: 4 },
        { path: /session-id/i, type: 'full' }, // Regex for keys
      ],
    },
  });

  // For advanced use cases like this, we get the ContextManager from the factory.
  const contextManager = syntropyLog.getContextManager();
  const correlationId = randomUUID();

  console.log(`--- Starting operation with Correlation ID: ${correlationId} ---`);

  // 2. Create an isolated context for the operation using contextManager.run()
  await contextManager.run(async () => {
   contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
   await processOrder() 
  });

  console.log(`\n--- Operation finished. Context is now empty. ---`);

  // 4. Any logging outside the `run` block will not have the context.
  const logger = syntropyLog.getLogger('main');
  logger.info('This log is outside the context and will not have a correlationId.');
}

main();