import { SyntropyLog } from 'syntropylog';
import { randomUUID } from 'crypto';

// This simulates a service responsible for inventory management.
// Notice it doesn't need to know anything about correlation IDs.
// It just receives the logger instance.
const inventoryService = {
  checkStock: (logger, item) => {
    const stockLogger = logger.child({ service: 'inventory-service' });
    stockLogger.info('Checking inventory...', { item });
    // ... some logic to check stock ...
  },
};

// This simulates a service responsible for handling orders.
const orderService = {
  process: (logger, order) => {
    const orderLogger = logger.child({ service: 'order-service' });
    orderLogger.info('Processing order...', { payload: order });
    inventoryService.checkStock(logger, order.productId);
  },
};

// --- Main Application Logic ---
async function main() {
  // 1. Initialize the logger for the whole application.
  const logger = new SyntropyLog({
    service: 'main',
    // We'll use a compact console transport for cleaner output in this example.
    transports: ['compact'],
  });

  logger.info('Starting application...');

  // 2. Simulate an incoming request.
  // We'll create a unique ID to trace this specific operation.
  const correlationId = randomUUID();

  // 3. This is the magic!
  // We use `runWith` to create an async context. Everything that runs
  // inside this callback will automatically have the `correlationId`.
  await logger.runWith({ correlationId }, async (contextualLogger) => {
    const order = {
      productId: 'B-001',
      quantity: 2,
    };
    // We pass the contextualLogger to our services.
    orderService.process(contextualLogger, order);
  });

  logger.info('Application finished.');
}

main();