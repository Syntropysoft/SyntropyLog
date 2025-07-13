import express from 'express';
import { syntropyLog } from 'syntropylog';
import { AxiosAdapter } from 'syntropylog/http';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { contextMiddleware } from '../shared/context.middleware';

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
app.use(contextMiddleware); // Use the context middleware for all requests

const port = 3000;
const logger = syntropyLog.getLogger('api-gateway');
const contextManager = syntropyLog.getContextManager();

app.get('/create-sale', async (req, res) => {
  // No need for contextManager.run() or setting correlationId here.
  // The middleware handles it.
  
  logger.info('Received request to create a new sale.');

  try {
    logger.info('Calling sales-service...');
    
    const instrumentedAxios = syntropyLog.getHttp('axios-default');
    const correlationId = contextManager.get('correlationId');

    const response = await instrumentedAxios.request({
      method: 'POST',
      url: 'http://sales-service:3001/process-sale',
      body: {
        item: 'example-item',
        quantity: 1,
      },
      headers: {
        'x-correlation-id': correlationId || '',
      },
    });

    logger.info({ response: response.data }, 'Response from sales-service');
    
    res.status(202).send({
      message: 'Sale creation initiated and forwarded to sales-service.',
      correlationId,
    });
  } catch (error: any) {
    logger.error({ err: error.message }, 'Error calling sales-service');
    const correlationId = contextManager.get('correlationId');
    res.status(500).send({
      message: 'Failed to call sales-service.',
      correlationId,
    });
  }
});

app.listen(port, () => {
  logger.info(`API Gateway listening at http://localhost:${port}`);
});
