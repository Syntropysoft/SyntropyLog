// examples/05-advanced-brokers-rabbitmq/src/index.ts
import { syntropyLog } from 'syntropylog';
import { BrokerMessage } from 'syntropylog';
import { randomUUID } from 'node:crypto';
// Note: RabbitMQAdapter would be implemented in a separate adapter package
// For this example, we'll use a mock adapter
const RabbitMQAdapter = class {
  constructor(url: string, exchange: string) {
    this.url = url;
    this.exchange = exchange;
  }
  private url: string;
  private exchange: string;
  async connect() {}
  async disconnect() {}
  async publish(topic: string, message: BrokerMessage) {}
  async subscribe(queue: string, handler: (message: BrokerMessage, controls: any) => Promise<void>) {}
};

const exchangeName = 'user-events';
const userCreatedTopic = 'user.created';
const userUpdatedTopic = 'user.updated';
const userQueue = 'user-service-queue';

async function main() {
  console.log('--- Running Advanced RabbitMQ Broker Example ---');

  syntropyLog.init({
    logger: {
      serviceName: 'rabbitmq-example',
      level: 'info',
      serializerTimeoutMs: 100,
    },
    brokers: {
      instances: [
        {
          instanceName: 'rabbit-main',
          adapter: new RabbitMQAdapter(
            'amqp://user:password@localhost:5672',
            exchangeName
          ),
        },
      ],
    },
  });

  const rabbitBroker = syntropyLog.getBroker('rabbit-main');
  await rabbitBroker.connect();

  // Subscribe to the queue before publishing
  await rabbitBroker.subscribe(userQueue, async (message, controls) => {
    const logger = syntropyLog.getLogger('consumer');
    logger.info('Received message:', {
      payload: message.payload.toString(),
      headers: message.headers,
    });
    await controls.ack();
  });

  // Create a context for the publishing operation
  await syntropyLog.getContextManager().run(async () => {
    const correlationId = randomUUID();
    syntropyLog.getContextManager().set('X-Correlation-ID', correlationId);

    const producerLogger = syntropyLog.getLogger('producer');
    producerLogger.info('Publishing user.created event...');

    const message: BrokerMessage = {
      payload: Buffer.from(JSON.stringify({ userId: 1, name: 'John Doe' })),
    };

    // The instrumented client calls the adapter's publish method
    await rabbitBroker.publish(userCreatedTopic, message);
    producerLogger.info('Message published.');
  });

  // Give some time for the message to be processed
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await rabbitBroker.disconnect();
  await syntropyLog.shutdown();

  console.log('✅ RabbitMQ example finished.');
}

main().catch(console.error); 