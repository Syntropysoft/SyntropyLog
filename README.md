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

Instrumentación y logging declarativo, listo para compliance y multi-transporte en segundos.

```ts
import { syntropyLog, ConsoleTransport, FileTransport } from 'syntropylog';

// 1. Inicializa SyntropyLog con tus transportes preferidos
syntropyLog.init({
  transports: [
    new ConsoleTransport(), // Logs a consola (JSON o pretty)
    new FileTransport({ filename: 'logs.log' }), // Logs a archivo local
  ],
  masking: { fields: ['password', 'credit_card'] }, // Ofuscación automática
});

// 2. Crea un logger de contexto (ejemplo: módulo "Auth")
const logger = syntropyLog.getLogger('Auth');

// 3. Loguea eventos con contexto, metadata y compliance (opcional)
logger
  .withTransactionId('TX123')
  .info('User login success', {
    userId: 42,
    email: 'user@mail.com',
    credit_card: '4111-1111-1111-1111', // será ofuscado automáticamente
    meta: { retention_days: 30, compliance: ['PCI'] },
  });

// 4. Usa shutdown en producción para asegurar que no se pierdan logs
await syntropyLog.shutdown();
```


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

## The Audit Platform: Doctor & Auditor

SyntropyLog includes a powerful command-line tool, the **Doctor & Auditor**, designed to validate your configuration files, enforce best practices, and prevent deployment errors. It's a professional-grade feature, especially useful for DevOps teams and for ensuring robustness in production environments.

### The Philosophy

The platform is divided into two main commands with distinct purposes:

* **`syntropylog doctor`**: A tool for the developer. It performs a quick, on-the-fly analysis of a single configuration file, providing instant feedback.
* **`syntropylog audit`**: A tool for continuous integration (CI/CD). It executes a complete audit plan against multiple configuration files, using different sets of rules for each environment (e.g., `staging` vs. `production`).

### The Professional Workflow

Here’s how a team would make the most of the audit platform:

#### Step 1: Initialize the Manifests

First, use the `init` command to generate the necessary configuration files. The CLI will intelligently detect if your project uses TypeScript/JavaScript and ESM/CommonJS.

```bash
# In your project's root directory, run:
npx syntropylog init --rules --audit
```

This command generates two key files:

* `syntropylog.doctor.ts`: A manifest to define and compose diagnostic rule sets.
* `syntropylog.audit.ts`: A plan that defines which rule sets to run against which configuration files.

#### Step 2: Define Custom Rules (Optional but Powerful)

This is where the real magic happens. You can create your own diagnostic rules tailored to your company's policies.

**Example: `my-checks/security-rules.ts`**
```typescript
import type { DiagnosticRule } from 'syntropylog/doctor';
import type { SyntropyLogConfig } from 'syntropylog';

export const securityRules: DiagnosticRule[] = [
  {
    id: 'corp-no-http-in-prod',
    description: 'Ensures all external URLs use HTTPS in production.',
    check: (config: SyntropyLogConfig) => {
      const httpInstances = config.http?.instances ?? [];
      const insecureInstances = httpInstances.filter(
        (i) => i.config?.baseURL?.startsWith('http://')
      );
      if (insecureInstances.length > 0) {
        return [{
          level: 'ERROR',
          title: 'Insecure BaseURL in Production',
          message: `Found HTTP instances with a non-HTTPS baseURL: ${insecureInstances.map(i => i.instanceName).join(', ')}`,
          recommendation: 'All external API endpoints must use HTTPS in production.'
        }];
      }
      return [];
    }
  }
];
```

#### Step 3: Compose Your Audit Plan

Now, edit the generated `syntropylog.audit.ts` file to define your validation strategy.

**Example: `syntropylog.audit.ts`**
```typescript
/**
 * SYNTROPYLOG AUDIT PLAN
 * ----------------------
 * This file defines the audit plan for your project's configurations.
 * The `syntropylog audit` command will execute each job defined in this array.
 */
import { coreRules } from 'syntropylog/doctor';
import type { DiagnosticRule } from 'syntropylog/doctor';

// Import your custom rules
import { securityRules } from './my-checks/security-rules';

export default [
  {
    name: 'Production Config Audit',
    configFile: './config/production.yaml',
    // For production, we want all core rules plus our custom security rules.
    rules: [
        ...coreRules,
        ...securityRules
    ],
  },
  {
    name: 'Staging Config Audit',
    configFile: './config/staging.yaml',
    // For staging, we might want to be less strict and disable some rules.
    rules: coreRules.filter(rule => rule.id !== 'prod-log-level'),
  },
];
```

#### Step 4: Integrate into Your CI/CD Pipeline

This is the final and most crucial step for DevOps teams. Add a single command to your pipeline to run the full audit.

**Example: `.github/workflows/ci.yml` (for GitHub Actions)**
```yaml
name: Build, Test and Audit

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Unit & Integration Tests
        run: npm test

      - name: 🕵️‍♂️ Run SyntropyLog Configuration Audit
        run: npx syntropylog audit
```

### How It Works

* **The Command**: The `npx syntropylog audit` command in your pipeline needs no arguments.
* **Execution**: It automatically finds and loads your `syntropylog.audit.ts` manifest.
* **The Audit**: It runs each "job" sequentially.
* **The Result**: If any rule in any job returns an `ERROR`-level result, the `npx syntropylog audit` command will exit with a non-zero status code. This **automatically fails the CI pipeline step**, preventing the faulty configuration from being merged or deployed. The developer gets instant, clear feedback directly in their Pull Request.

This transforms the Doctor from a simple utility into a powerful, automated quality gate for your application's configuration.


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