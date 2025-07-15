import { syntropyLog } from 'syntropylog';
import { NatsAdapter } from '../../../../external-adapters/brokers/NatsAdapter';

async function main() {
  await syntropyLog.init({
    logger: {
      serviceName: 'sales-service',
      level: 'debug',
      serializerTimeoutMs: 100,
    },
    context: {
      // These headers are used by the BrokerManager to extract context from incoming messages.
      correlationIdHeader: 'x-correlation-id',
      transactionIdHeader: 'x-trace-id',
    },
    brokers: {
      instances: [
        {
          instanceName: 'nats-main',
          adapter: new NatsAdapter(),
          isDefault: true,
        },
      ],
    },
  });

  const logger = syntropyLog.getLogger('sales-service');
  const broker = syntropyLog.getBroker(); // Gets the default 'nats-main' broker

  try {
    // The BrokerManager automatically calls connect on init.
    // We subscribe to the topic where the api-gateway publishes orders.
    await broker.subscribe('orders.create', async (message) => {
      // The BrokerManager wraps this handler in a context, so logging and publishing are correlated.
      const order = JSON.parse(message.payload.toString());
      logger.info({ order }, 'Received order from api-gateway. Processing sale...');
      
      // ... business logic to process the sale would go here ...
      
      const processedOrder = { ...order, processedAt: new Date() };
      
      // Publish an event to notify that the sale has been processed.
      await broker.publish('sales.processed', {
        payload: Buffer.from(JSON.stringify(processedOrder)),
      });
      
      logger.info({ orderId: order.id }, 'Sale processed and "sales.processed" event published.');
    });

    logger.info('Sales service is ready and listening for "orders.create" events.');

  } catch (err: any) {
    logger.error({ err: err.message, stack: err.stack }, 'Failed to initialize sales-service.');
    process.exit(1);
  }
}

main().catch(err => {
  // Fallback logger in case syntropyLog isn't initialized.
  console.error('Critical error during sales-service startup:', err);
  process.exit(1);
}); 