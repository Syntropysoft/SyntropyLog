import { syntropyLog, CompactConsoleTransport } from 'syntropylog';
import { randomUUID } from 'crypto';

// This simulates a service responsible for inventory management.
const inventoryService = {
  checkStock: (item) => {
    // No need to pass the logger around. We can get it from the singleton.
    const stockLogger = syntropyLog.getLogger('inventory-service');
    stockLogger.info({ item }, 'Checking inventory...');
    // ... some logic to check stock ...
  },
};

// This simulates a service responsible for handling orders.
const orderService = {
  process: (order) => {
    const orderLogger = syntropyLog.getLogger('order-service');
    orderLogger.info({ payload: order }, 'Processing order...');
    inventoryService.checkStock(order.productId);
  },
};

// --- Main Application Logic ---
async function main() {
  // 1. Configure and initialize SyntropyLog once for the whole application.
  syntropyLog.init({
    logger: {
      level: 'info',
      serviceName: 'main-app',
      transports: [new CompactConsoleTransport()],
    },
    context: {
      correlationIdHeader: 'X-Correlation-ID'
    }
  });

  const mainLogger = syntropyLog.getLogger('main');
  const contextManager = syntropyLog.getContextManager();

  mainLogger.info('Starting application...');

  // 2. Simulate an incoming request.
  const correlationId = randomUUID();

  // 3. This is the magic!
  // We use the context manager to create an async context.
  await contextManager.run(async () => {
    contextManager.set(contextManager.getCorrelationIdHeaderName(), correlationId);

    const order = {
      productId: 'B-001',
      quantity: 2,
    };
    orderService.process(order);
  });

  mainLogger.info('Application finished.');
  await syntropyLog.shutdown();
}

main();