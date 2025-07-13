import express from 'express';
import { syntropyLog } from 'syntropylog';
import { StringCodec } from 'nats';
import { NatsAdapter } from '../shared/NatsAdapter';

syntropyLog.init({
  logger: {
    serviceName: 'sales-service',
    serializerTimeoutMs: 100,
  },
  brokers: {
    instances: [
      {
        instanceName: 'nats-default',
        adapter: new NatsAdapter(), // The manager will call .connect()
      },
    ],
  },
});

const app = express();
const port = 3001;
const logger = syntropyLog.getLogger('sales-service');
const contextManager = syntropyLog.getContextManager();
const sc = StringCodec();

app.use(express.json());

app.post('/process-sale', async (req, res) => {
  // The context is automatically managed by the BrokerManager
  // when it calls the message handler. For an HTTP entrypoint like this,
  // we would typically rely on an Express middleware for context creation.
  // For simplicity, we create it manually here.
  await contextManager.run(async () => {
    const correlationId = req.headers['x-correlation-id'] || 'missing-correlation-id';
    contextManager.set('correlationId', correlationId);

    logger.info({ saleData: req.body }, 'Processing sale...');

    const instrumentedNats = syntropyLog.getBroker('nats-default');
    
    logger.info('Publishing event to NATS...');
    const payload = JSON.stringify({ ...req.body, processedAt: new Date() });
    await instrumentedNats.publish('sales.processed', { 
      payload: Buffer.from(payload),
      // Headers are now automatically injected by the InstrumentedBrokerClient
    });
    
    res.status(200).send({
      message: 'Sale processed and event published.',
      correlationId,
    });
  });
});

app.listen(port, async () => {
  try {
    const instrumentedNats = syntropyLog.getBroker('nats-default');
    await instrumentedNats.connect();
    logger.info('Broker client connected successfully.');
  } catch(err) {
    logger.error({ err }, 'Failed to connect to NATS broker');
    process.exit(1);
  }
  logger.info(`Sales Service listening at http://localhost:${port}`);
}); 