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
      serviceName: 'dispatch-service',
      serializerTimeoutMs: 100,
    },
  });

  const logger = syntropyLog.getLogger();

  logger.info('Dispatch service started and connected to NATS.');

  const broker = syntropyLog.getBroker('nats-broker');

  await broker.subscribe('dispatch.process', async (message: BrokerMessage, { ack }: MessageLifecycleControls) => {
    try {
      const order = JSON.parse(message.payload.toString()) as { orderId: string; items: any[] };
      logger.info('Processing dispatch for order', { orderId: order.orderId });

      // Simulate dispatch processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      logger.info('Dispatch for order completed', { orderId: order.orderId });
      await ack();
    } catch (error) {
      logger.error('Error processing dispatch', {
        error: error instanceof Error ? error.message : String(error),
      });
      // In a real scenario, you might nack() or send to a dead-letter queue.
    }
  });
}

main().catch((err) => {
  const logger = syntropyLog.getLogger();
  logger.fatal('Dispatch service failed to start', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
