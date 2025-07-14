import express from 'express';
import { syntropyLog } from 'syntropylog';
import { AxiosAdapter } from '../../../../external-adapters/http/AxiosAdapter';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { contextMiddleware } from '../shared/context.middleware';

syntropyLog.init({
  logger: {
    serviceName: 'api-gateway',
    serializerTimeoutMs: 100,
  },
  loggingMatrix: {
    // By default, only log the correlationId and transactionId from the context.
    default: ['correlationId', 'transactionId'],
    // On error or fatal, log the entire context.
    error: ['*'],
    fatal: ['*'],
  },
  context: {
    correlationIdHeader: 'x-correlation-id',
    transactionIdHeader: 'x-trace-id',
  },
  http: {
    instances: [
      {
        instanceName: 'axios-default',
        adapter: new AxiosAdapter(axios),
        propagate: ['x-trace-id', 'x-session-id', 'x-request-agent'],
      },
    ],
  },
});

const app = express();
app.use(express.json()); // Add JSON body parser middleware
app.use(contextMiddleware); // Use the context middleware for all requests

const port = 3000;
const logger = syntropyLog.getLogger('api-gateway');
const contextManager = syntropyLog.getContextManager();

app.post('/orders', async (req, res) => {
  // No need for contextManager.run() or setting correlationId here.
  // The middleware handles it.
  
  logger.info('Received request to create a new order.');

  try {
    logger.info('Calling sales-service...');
    
    const instrumentedAxios = syntropyLog.getHttp('axios-default');

    // --- Retry Logic to handle service startup race conditions ---
    let response;
    const maxRetries = 5;
    const retryDelayMs = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await instrumentedAxios.request({
          method: 'POST',
          url: 'http://sales-service:3001/process-sale',
          body: req.body, // Use the body from the incoming request
          headers: {
            // No longer needed. The instrumented client handles this automatically.
          },
        });
        // If successful, break the loop
        break;
      } catch (error: any) {
        logger.warn(
          { attempt, maxRetries, err: error.message },
          `Failed to connect to sales-service. Retrying in ${retryDelayMs}ms...`
        );
        if (attempt === maxRetries) {
          // If this was the last attempt, re-throw the error
          throw error;
        }
        await new Promise(res => setTimeout(res, retryDelayMs));
      }
    }
    // --- End of Retry Logic ---

    // The request was successful if response is not undefined.
    if (response) {
      logger.info({ response: response.data }, 'Response from sales-service');
      const correlationId = contextManager.get('correlationId');
      res.status(202).send({
        message: 'Order creation initiated and forwarded to sales-service.',
        correlationId,
      });
    } else {
      // This block will be reached if all retries failed.
      // The error has already been thrown inside the loop, but as a safeguard:
      logger.error('Failed to get a response from sales-service after all retries.');
      res.status(500).send({
        message: 'Failed to call sales-service after multiple retries.',
        correlationId: contextManager.get('correlationId'),
      });
    }

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
