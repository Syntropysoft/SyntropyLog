import express from 'express';
import { syntropyLog } from 'syntropylog';
import { randomUUID } from 'crypto';
import { NatsAdapter } from '../adapters/NatsAdapter.js';
import { SyntropyLog } from 'syntropylog';
import { BrokerMessage } from 'syntropylog';
import { v4 as uuidv4 } from 'uuid';

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
      serviceName: 'api-gateway',
      serializerTimeoutMs: 100,
    },
  });

  const logger = syntropyLog.getLogger();

  const app = express();
  const port = process.env.PORT || 3000;

  // Middleware to attach logger to request
  app.use((req, res, next) => {
    (req as any).logger = logger;
    next();
  });

  app.use(express.json());

  // Endpoint to create a new sale
  app.post('/sales', async (req: express.Request, res: express.Response) => {
    const saleData = req.body;
    const correlationId = (req as any).logger.getCorrelationId?.();

    const saleMessage: BrokerMessage = {
      payload: saleData,
      headers: { 'x-correlation-id': correlationId || uuidv4() },
    };

    try {
      logger.info('Received new sale request', { saleData });
      const broker = syntropyLog.getBroker('nats-broker');
      await broker.publish('sales.new', saleMessage);
      logger.info('Sale event published to NATS', { saleData });
      res.status(202).json({ message: 'Sale processing started' });
    } catch (error) {
      logger.error('Failed to publish sale event', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });

  app.listen(port, () => {
    logger.info(`API Gateway listening on port ${port}`);
  });
}

main().catch((err) => {
  const logger = syntropyLog.getLogger();
  logger.fatal('API Gateway failed to start', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
