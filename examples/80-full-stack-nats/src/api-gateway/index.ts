import express from 'express';
import { syntropyLog } from 'syntropylog';
import { AxiosAdapter } from 'syntropylog/http';
import { randomUUID } from 'crypto';
import axios from 'axios';

syntropyLog.init({
  logger: {
    serviceName: 'api-gateway',
    serializerTimeoutMs: 100,
  },
  http: {
    instances: [
      {
        instanceName: 'axios-default',
        adapter: new AxiosAdapter(axios),
      },
    ],
  },
});

const app = express();
const port = 3000;
const logger = syntropyLog.getLogger('api-gateway');
const contextManager = syntropyLog.getContextManager();

app.get('/create-sale', (req, res) => {
  contextManager.run(async () => {
    const correlationId = req.headers['x-correlation-id'] || randomUUID();
    contextManager.set('correlationId', correlationId);

    logger.info('Received request to create a new sale.');

    try {
      logger.info('Calling sales-service...');
      const salesServiceUrl = 'http://sales-service:3001/process-sale';
      
      const response = await axios.post(salesServiceUrl, {
        item: 'example-item',
        quantity: 1,
      });

      logger.info({ response: response.data }, 'Response from sales-service');
      
      res.status(202).send({
        message: 'Sale creation initiated and forwarded to sales-service.',
        correlationId,
      });
    } catch (error: any) {
      logger.error({ err: error.message }, 'Error calling sales-service');
      res.status(500).send({
        message: 'Failed to call sales-service.',
        correlationId,
      });
    }
  });
});

app.listen(port, () => {
  logger.info(`API Gateway listening at http://localhost:${port}`);
}); 