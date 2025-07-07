import { beaconLog } from 'beaconlog';
import { randomUUID } from 'crypto';

/**
 * Simulates a top-level service function.
 */
async function processOrder() {
  const logger = beaconLog.getLogger('order-service');
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
  const logger = beaconLog.getLogger('inventory-service');
  // This log will automatically contain the correlationId and userId from the context.
  logger.info('Checking inventory for the order.');
}

async function main() {
  // 1. Initialize BeaconLog with a minimal configuration.
  beaconLog.init({
    logger: {
      level: 'info',
      serviceName: 'my-app',
    },
    context: {
      correlationIdHeader: 'x-correlation-id-test',
    }
  });

  // For advanced use cases like this, we get the ContextManager from the factory.
  const contextManager = beaconLog.getContextManager();
  const correlationId = randomUUID();

  console.log(`--- Starting operation with Correlation ID: ${correlationId} ---`);

  // 2. Create an isolated context for the operation using contextManager.run()
  await contextManager.run(async () => {
   contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);
   await processOrder() 
  });

  console.log(`\n--- Operation finished. Context is now empty. ---`);

  // 4. Any logging outside the `run` block will not have the context.
  const logger = beaconLog.getLogger('main');
  logger.info('This log is outside the context and will not have a correlationId.');
}

main();