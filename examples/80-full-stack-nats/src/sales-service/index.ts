import { syntropyLog, BrokerMessage, MessageLifecycleControls, SyntropyLog } from 'syntropylog';
import { NatsAdapter } from '../adapters/NatsAdapter.js';

async function main() {
  const natsAdapter = new NatsAdapter();
  await natsAdapter.connect();

  await syntropyLog.init({
    brokers: {
      instances: [
        {
          instanceName: 'nats-broker',
          adapter: natsAdapter,
          isDefault: true,
        },
      ],
    },
    logger: {
      level: 'trace',
      serviceName: 'sales-service',
      serializerTimeoutMs: 100,
    },
  });

  const logger = syntropyLog.getLogger();

  logger.info('Sales service started and connected to NATS.');

  const broker = syntropyLog.getBroker('nats-broker');

  await broker.subscribe('sales.new', async (message: BrokerMessage, { ack }: MessageLifecycleControls) => {
    try {
      const saleData = JSON.parse(message.payload.toString()) as { customerId: string; items: any[] };
      logger.info('Processing new sale', { saleData });

      // Simulate some business logic for processing the sale
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const dispatchMessage: BrokerMessage = {
        payload: Buffer.from(JSON.stringify({
          orderId: `ORD-${Date.now()}`,
          items: saleData.items,
        })),
        headers: message.headers, // Propagate headers
      };

      await broker.publish('dispatch.process', dispatchMessage);

      logger.info('Sale processed and sent to dispatch', {
        orderId: JSON.parse(dispatchMessage.payload.toString()).orderId,
      });
      await ack(); // Acknowledge the message
    } catch (error) {
      logger.error('Error processing sale', {
        error: error instanceof Error ? error.message : String(error),
      });
      // In a real-world scenario, you might want to nack() the message
      // or move it to a dead-letter queue.
    }
  });
}

main().catch((err) => {
  const logger = syntropyLog.getLogger();
  logger.fatal('Sales service failed to start', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
}); 