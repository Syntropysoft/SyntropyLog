import express from 'express';
import { syntropyLog } from 'syntropylog';
import { NatsAdapter } from '../../../../external-adapters/brokers/NatsAdapter';
import { randomUUID } from 'crypto';
import { contextMiddleware } from '../shared/context.middleware';

syntropyLog.init({
  logger: {
    serviceName: 'api-gateway',
    serializerTimeoutMs: 100,
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
  context: {
    correlationIdHeader: 'x-correlation-id',
    transactionIdHeader: 'x-trace-id',
  },
});

const app = express();
app.use(express.json()); // Add JSON body parser middleware
app.use(contextMiddleware); // Use the context middleware for all requests

const port = 3000;
const logger = syntropyLog.getLogger('api-gateway');
const contextManager = syntropyLog.getContextManager();

app.post('/orders', async (req, res) => {
  // The contextMiddleware has already set up the correlation context.
  logger.info({ order: req.body }, 'Received request to create a new order.');

  try {
    const broker = syntropyLog.getBroker(); // Gets the default broker
    
    // Publish the order details to the NATS topic.
    // The payload must be a Buffer.
    await broker.publish('orders.create', {
      payload: Buffer.from(JSON.stringify(req.body)),
      // Headers are automatically handled by the instrumented client.
    });

    logger.info('Order successfully published to NATS for processing.');
    
    const correlationId = contextManager.get('correlationId');
    res.status(202).send({
      message: 'Order creation request received and is being processed.',
      correlationId,
    });

  } catch (error: any) {
    logger.error({ err: error.message, stack: error.stack }, 'Failed to publish order to NATS.');
    const correlationId = contextManager.get('correlationId');
    res.status(500).send({
      message: 'Internal server error while processing the order.',
      correlationId,
    });
  }
});

app.listen(port, () => {
  logger.info(`API Gateway listening at http://localhost:${port}`);
});
