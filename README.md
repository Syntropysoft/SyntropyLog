<p align="center">
  <img src="assets/beaconLog-2.png" alt="SyntropyLog Logo" width="150"/>
</p>
<p align="center">
  <strong>Observability, compliance, and resilience—by design.</strong>
</p>

<!-- Badges (activate when you publish to npm and have CI configured) -->
<!--
<p align="center">
  <a href="[https://github.com/Syntropysoft/syntropylog/actions](https://github.com/Syntropysoft/syntropylog/actions)"><img src="[https://github.com/Syntropysoft/syntropylog/workflows/CI/badge.svg](https://github.com/Syntropysoft/syntropylog/workflows/CI/badge.svg)" alt="Build Status"></a>
  <a href="[https://www.npmjs.com/package/syntropylog](https://www.npmjs.com/package/syntropylog)"><img src="[https://img.shields.io/npm/v/syntropylog.svg](https://img.shields.io/npm/v/syntropylog.svg)" alt="NPM Version"></a>
  <a href="[https://www.npmjs.com/package/syntropylog](https://www.npmjs.com/package/syntropylog)"><img src="[https://img.shields.io/npm/l/syntropylog.svg](https://img.shields.io/npm/l/syntropylog.svg)" alt="License"></a>
</p>
-->

**SyntropyLog** is a unified and declarative observability framework for Node.js, designed to maximize developer productivity, ensure data security, and provide production-grade resilience out of the box.

# Requirements: Node.js >= 18

## Compatibility Matrix
| Node | Status                                               | Notes |
| ---- | ---------------------------------------------------- | ----- |
| 20   | ✅ Supported (CI)                                     |
| 18   | ✅ Supported (CI)                                     |
| 16   | ⚠️ Should work (CJS build) – EOL, no security patches |

------------------------------------------------------------------------

## ✨ Design Principles

- **Framework, not a Library**: Provides an integrated solution for logging, tracing, masking, and instrumentation, not just a logging tool.
- **Declarative and Centralized**: Define the entire behavior in a single `init()` configuration object. Declare the desired state, and the framework handles the implementation.
- **Security by Default**: Robust data masking, configuration sanitization, and defense mechanisms against poorly programmed components.
- **Sublime Developer Experience (DX)**: A fluent and intuitive API, "pretty-printing" for development, and a proactive "Doctor" to diagnose configuration issues.
- **Performance and Resilience**: Asynchronous "fire-and-forget" core, "graceful shutdown" to prevent data loss, and "failing clients" that prevent a downed service from crashing your application.

---

## 🚀 Quick Start

The `syntropyLog` singleton is the single entry point for configuring and using all framework modules.

```typescript
import { syntropyLog, ConsoleTransport, PrettyConsoleTransport } from 'syntropylog';

async function main() {
  // 1. Configure and initialize SyntropyLog once when your application starts.
  await syntropyLog.init({
    // The logger configuration is now simpler.
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      serviceName: 'my-awesome-app',
      // Use the appropriate transport for each environment.
      transports: [
        process.env.NODE_ENV === 'production'
          ? new ConsoleTransport() // Raw JSON for production
          : new PrettyConsoleTransport(), // Colored logs for development
      ],
      // Define how to transform complex objects into readable text.
      serializers: {
        user: (user) => `User(id=${user.id}, email=${user.email})`,
      },
    },
    // Define the header for the correlation ID.
    context: {
      correlationIdHeader: 'X-Correlation-ID',
    },
    // SINGLE SOURCE OF TRUTH for data masking.
    masking: {
      maskChar: '�',
      maxDepth: 8,
      fields: [
        // Simple and advanced rules for masking data in ANY log.
        { path: 'password', type: 'full' },
        { path: 'accessToken', type: 'full' },
        { path: 'creditCardNumber', type: 'partial', showLast: 4 },
        { path: /session-id/i, type: 'full' }, // Regex for keys
      ],
    },
    // Redis instance configuration.
    redis: {
      instances: [
        {
          instanceName: 'cache',
          mode: 'single',
          url: process.env.REDIS_CACHE_URL || 'redis://localhost:6379',
          // Granular logging configuration per instance.
          logging: {
            onSuccess: 'trace', // More verbose for this specific instance
            logCommandValues: true,
          },
        },
      ],
    },
    // HTTP instance configuration.
    http: {
      instances: [
        {
          instanceName: 'paymentApi',
          type: 'axios',
          config: { baseURL: 'https://api.payments.com', timeout: 5000 },
        },
      ],
    },
  });

  // 2. Get your tools directly from the `syntropyLog` singleton.
  const logger = syntropyLog.getLogger('main-flow');
  const cache = syntropyLog.getRedis('cache');
  const paymentApi = syntropyLog.getHttp('paymentApi');

  logger.info('Application started and ready.');

  // 3. Use the clients in your business logic.
  try {
    const user = { id: 'usr_123', email: 'test@example.com', password: 'a-very-secret-password' };
    
    // The central logger will handle serialization and masking.
    logger.info({ user }, 'Processing user');
    
    await cache.set('user:123', JSON.stringify(user));
    
    // The API call will be instrumented automatically.
    // await paymentApi.post('/charge', { amount: 100, creditCardNumber: '1234-5678-9012-3456' });

  } catch (error) {
    logger.error({ err: error }, 'An error occurred in the main flow');
  } finally {
    // 4. Gracefully close all connections upon termination.
    await syntropyLog.shutdown();
  }
}

main();
```

## 🏛️ Architecture and Data Flow

Every log generated in the framework passes through a clear and consistent processing pipeline.

```ascii
  User Call
  logger.info({ req: {...} }, 'Incoming request')
           │
           ▼
┌───────────────────────┐
│     Logger Engine     │
│   (Main Pipeline)     │
└───────────────────────┘
           │
           ├─► 1. Serialization
           │      (Transforms complex objects using your functions)
           │      (Protected with Timeouts)
           │
           ├─► 2. Masking
           │      (Masks sensitive data from global config)
           │      (Protected with Depth Limit)
           │
           ├─► 3. Final LogEntry Assembly
           │      (Adds timestamp, level, service, etc.)
           │
           ▼
┌───────────────────────┐
│      Dispatcher       │
└───────────────────────┘
           │
           ├──────────────────► ┌─────────────────────────┐
           │                    │  Transport A (Console)  │
           │                    └─────────────────────────┘
           │                                │
           │                                ▼
           │                       Formatter for Datadog
           │                                ▼
           │                          Output in Datadog format
           │
           └──────────────────► ┌─────────────────────────┐
                                │   Transport B (File)    │
                                └─────────────────────────┘
                                           │
                                           ▼
                                   Formatter for ECS
                                           ▼
                                    Output in ECS format
```

## 💡 Frequently Asked Questions (FAQ)

* **What happens if a transport (e.g., an external service) goes down?**
    * Transports are isolated. If one fails, `syntropyLog` will log an error internally but **will not affect other transports** or crash the application. The rest of the logs will continue to flow to the working destinations.

* **How do I add a custom formatter for Splunk/Datadog/etc.?**
    1.  Create a class that implements the `LogFormatter` interface.
    2.  Inside, implement the `format(entry)` method to return an object with the structure your tool requires.
    3.  In the `init` config, instantiate your formatter and pass it to the desired transport: `new ConsoleTransport({ formatter: new MySplunkFormatter() })`.

* **How does `shutdown` work in clusters (e.g., Kubernetes)?**
    * `syntropyLog.shutdown()` is a process-level command. In a cluster, the orchestrator (Kubernetes) sends a shutdown signal (e.g., `SIGTERM`) to each pod. Inside your application, you must catch that signal and call `syntropyLog.shutdown()`. This ensures that each instance gracefully flushes its transport buffers before the pod terminates.

## 🗺️ Instrumentation Roadmap

SyntropyLog continues to evolve. The roadmap is focused on instrumenting asynchronous communication.

#### Phase 1: The Pillars of Messaging

-   **Kafka** (`kafkajs`): For high-throughput, persistent event streaming.
-   **RabbitMQ** (`amqplib`): For complex routing and reliable job queuing.
-   **NATS** (`nats.js`): For high-performance, low-latency messaging.

#### Phase 2: The Cloud Giants

-   Google Cloud Pub/Sub
-   Amazon SQS / Kinesis
-   Azure Service Bus & Event Hubs

---

*For more details on the API, advanced configuration, and the "Doctor" CLI, please refer to the full documentation.*
�