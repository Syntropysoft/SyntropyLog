<p align="center">
  <img src="https://raw.githubusercontent.com/Syntropyc/syntropylog/main/assets/sintropic-soft-1.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>The Observability Framework for High-Performance Teams.</strong>
  <br />
  Ship resilient, secure, and cost-effective Node.js applications with confidence.
</p>

<p align="center">
  <a href="https://github.com/Sintropyc/syntropylog/actions/workflows/ci.yml"><img src="https://github.com/Sintropyc/syntropylog/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Sintropyc/syntropylog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
</p>

Modern applications are a complex web of microservices, third-party APIs, and message brokers. Logging is no longer about printing lines to the console; it's about navigating this complexity. **SyntropyLog** is more than just a logger; it's a comprehensive **observability and governance framework** built to tame this complexity.

It provides a powerful, unified solution that empowers developers, accelerates troubleshooting for tech leads, and gives managers peace of mind on security and costs.

---

## The SyntropyLog Advantage: A Framework for Every Role

<details>
<summary><strong>For the Developer: An Effortless Experience</strong></summary>

> "I just want to get my work done. I need tools that are simple, powerful, and don't get in my way."

-   **Fluent & Agnostic API**: Use a clean, unified API (`.getHttp()`, `.getBroker()`) for all your external communications. Switch from `axios` to `fetch` or from Kafka to RabbitMQ by changing one line in the configuration, not your application code.
-   **Zero Boilerplate**: The `correlationId` is propagated automatically. The logger is context-aware. You just call `logger.info()` and the hard work is done for you.
-   **Rich Testability**: With built-in mocks and spy transports, writing meaningful tests for your instrumentation is trivial, not a chore.

</details>

<details>
<summary><strong>For the Tech Lead: Instant, End-to-End Clarity</strong></summary>

> "When something breaks at 2 AM, I need to find the root cause in minutes, not hours. I need to see the whole story."

-   **Automatic Distributed Tracing**: SyntropyLog automatically injects and retrieves a `correlationId` across service boundaries. A single ID connects a user's request from your API gateway, through your services, and across your message queues.
-   **Structured & Actionable Logs**: All logs are JSON-structured for powerful querying. Contextual information (service name, HTTP method, broker topic) is added automatically, turning ambiguous log messages into clear, actionable data.

```mermaid
graph TD
    A["HTTP Request<br/>(X-Correlation-ID: 123)"] --> B(API Gateway);
    B -- "Adds ID to Log" --> C{Log Stream};
    B -- "Forwards ID in Header" --> D[User Service];
    D -- "Adds ID to Log" --> C;
    D -- "Publishes Message with ID" --> E(Kafka Topic);
    E --> F[Dispatch Service];
    F -- "Extracts ID from Message" --> F;
    F -- "Adds ID to Log" --> C;
```

</details>

<details>
<summary><strong>For the Manager & DevOps: Ship with Confidence & Control</strong></summary>

> "I need to ensure our systems are secure, compliant, and cost-effective. Surprises are not an option."

-   **Automated Governance with Doctor CLI**: The `syntropylog doctor` is your automated gatekeeper for CI/CD. It validates configurations *before* deployment, preventing costly mistakes like overly verbose logging in production (saving on ingestion costs) or insecure setups.
-   **Tame Your ORMs with Custom Serializers**: Stop leaking data or polluting logs with massive objects. Define a serializer once for your `Prisma` or `TypeORM` models to ensure that only clean, safe data is ever logged.
-   **Security by Default**: A powerful, zero-dependency masking engine automatically finds and redacts sensitive data like `"password"` or `"creditCardNumber"` at any level of your log objects, ensuring you stay compliant.
</details>

---

## ⚡ Quick Start

This example shows how to initialize the logger and make an instrumented HTTP request.

```typescript
import { syntropyLog, PrettyConsoleTransport, AxiosAdapter } from 'syntropylog';
import axios from 'axios';

// 1. Configure SyntropyLog once in your application's entry point.
syntropyLog.init({
  logger: {
    level: 'info',
    serviceName: 'my-app',
    transports: [new PrettyConsoleTransport()], // Human-readable for dev
  },
  context: {
    correlationIdHeader: 'X-Correlation-ID',
  },
  http: {
    instances: [
      {
        instanceName: 'myApi',
        adapter: new AxiosAdapter(axios.create({ baseURL: 'https://api.example.com' })),
      },
    ],
  },
  // Define a one-time serializer for a complex object
  serializers: {
    user: (user) => `User(id=${user.id}, email=${user.email})`
  }
});

// 2. Get the instrumented client and logger anywhere you need them.
const apiClient = syntropyLog.getHttp('myApi');
const logger = syntropyLog.getLogger();

// 3. Use them. The framework handles the rest.
async function main() {
    const user = { id: 1, email: 'test@example.com', passwordHash: 'secret' };
    logger.info('User data fetched', { user }); // 'user' will be sanitized by the serializer

    await apiClient.request({
      method: 'GET',
      url: '/users/1',
    }); // Logs will contain the correlationId
}

main();
```

---

## 📂 Learn by Example

The best way to learn SyntropyLog is to see it in action. We have a comprehensive collection of examples in the `/examples` directory.

Each example is a self-contained project that demonstrates a specific feature, from data masking to building a fully correlated full-stack application.

**[➡️ Explore the Examples](./examples/README.md)**
