import express from 'express';
import { syntropyLog } from 'syntropylog';
import { StringCodec } from 'nats';
import { NatsAdapter } from '../../../../external-adapters/brokers/NatsAdapter';
import { contextMiddleware } from '../shared/context.middleware';

syntropyLog.init({
  logger: {
    serviceName: 'sales-service',
    serializerTimeoutMs: 100,
  },
  context: {
    correlationIdHeader: 'x-correlation-id',
    transactionIdHeader: 'x-trace-id',
  },
  brokers: {
    instances: [
      {
        instanceName: 'nats-default',
        adapter: new NatsAdapter('nats://nats-server:4222'), // The manager will call .connect()
        propagateFullContext: true,
      },
    ],
  },
});

const app = express();
app.use(express.json());
app.use(contextMiddleware); // Use the context middleware for all requests

const port = 3001;
const logger = syntropyLog.getLogger('sales-service');
const contextManager = syntropyLog.getContextManager();
const sc = StringCodec();

app.post('/process-sale', async (req, res) => {
  // The middleware now handles context creation and correlationId.
  logger.info({ saleData: req.body }, 'Processing sale...');

  const instrumentedNats = syntropyLog.getBroker('nats-default');
  
  logger.info('Publishing event to NATS...');
  const payload = JSON.stringify({ ...req.body, processedAt: new Date() });
  await instrumentedNats.publish('sales.processed', { 
    payload: Buffer.from(payload),
    // Headers are now automatically injected by the InstrumentedBrokerClient
  });
  
  const correlationId = contextManager.get('correlationId');
  res.status(200).send({
    message: 'Sale processed and event published.',
    correlationId,
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