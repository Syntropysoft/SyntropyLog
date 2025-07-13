import { Request, Response, NextFunction } from 'express';
import { syntropyLog } from 'syntropylog';
import { randomUUID } from 'crypto';

const CORRELATION_ID_HEADER = 'x-correlation-id';

export function contextMiddleware(req: Request, res: Response, next: NextFunction) {
  const contextManager = syntropyLog.getContextManager();
  
  contextManager.run(() => {
    const correlationId = (req.headers[CORRELATION_ID_HEADER] as string) || randomUUID();
    contextManager.set('correlationId', correlationId);
    next();
  });
} 