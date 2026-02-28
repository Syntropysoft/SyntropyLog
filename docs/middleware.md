# Middleware & Framework Integration

SyntropyLog is framework-agnostic but provides patterns to integrate with the most popular Node.js web frameworks.

## 🌊 How Middleware Works in SyntropyLog

The goal of the middleware is to:
1. **Initialize the Context**: Start an asynchronous storage scope.
2. **Assign Correlation IDs**: Extract from headers or generate a new one.
3. **Bind Loggers**: Provide a context-aware logger to the request.

---

## 🚀 Native Integration Patterns

### **Express.js**
```typescript
import { syntropyLog } from 'syntropylog';

const syntropyMiddleware = (req, res, next) => {
  const contextManager = syntropyLog.getContextManager();
  
  contextManager.run(async () => {
    // Generate/Extract correlation ID
    const correlationId = req.headers['x-correlation-id'] || uuid();
    contextManager.set('correlationId', correlationId);
    
    // Attach logger to request for convenience
    req.logger = syntropyLog.getLogger('http');
    
    next();
  });
};

app.use(syntropyMiddleware);
```

### **NestJS**
Use a Global Interceptor or Middleware to wrap the execution context.
```typescript
@Injectable()
export class ObservabilityMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    syntropyLog.getContextManager().run(() => {
        // Context setup logic
        next();
    });
  }
}
```

---

## 🛠️ "The Middleware that needs to be done"

We are currently working on a unified `@syntropylog/middleware` package that will provide:
- **Auto-masking** for body/headers out of the box.
- **Performance tracking** (auto log request duration).
- **Graceful Error Handling** middleware.

Until the official package is released, we recommend using the **Express + Redis + Axios** example as a reference for a production-ready implementation:
👉 [See Example 12: Express + Redis + Axios](./examples/12-express-redis-axios/)
