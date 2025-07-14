import { Request, Response, NextFunction } from 'express';
import { syntropyLog } from 'syntropylog';
import { randomUUID } from 'crypto';

export function contextMiddleware(req: Request, res: Response, next: NextFunction) {
  const contextManager = syntropyLog.getContextManager();

  contextManager.run(() => {
    // 1. Restore the entire context from incoming headers.
    // This is a more robust approach that makes no assumptions about which
    // headers are present.
    for (const key in req.headers) {
      if (typeof req.headers[key] === 'string') {
        contextManager.set(key, req.headers[key] as string);
      }
    }

    // 2. Normalize the 'correlationId' and 'transactionId' keys for consistent access within the logger.
    const correlationIdHeaderName = contextManager.getCorrelationIdHeaderName();
    let correlationId = contextManager.get<string>(correlationIdHeaderName);
    
    // Ensure a correlation ID exists, creating one if it wasn't in the headers.
    if (!correlationId) {
      correlationId = randomUUID();
      contextManager.set(correlationIdHeaderName, correlationId);
    }
    // Set the normalized key.
    contextManager.set('correlationId', correlationId);

    const transactionIdHeaderName = contextManager.getTransactionIdHeaderName();
    const transactionId = contextManager.get<string>(transactionIdHeaderName);
    if (transactionId) {
      // Set the normalized key.
      contextManager.set('transactionId', transactionId);
    }
    
    next();
  });
} 