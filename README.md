<p align="center">
  <img src="https://raw.githubusercontent.com/Syntropysoft/syntropylog-examples-/main/assets/syntropyLog-logo.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>The Observability Framework for High-Performance Teams.</strong>
  <br />
  Ship resilient, secure, and cost-effective Node.js applications with confidence.
</p>

<p align="center">
  <a href="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yml"><img src="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-95.6%25-brightgreen" alt="Test Coverage"></a>
</p>

# SyntropyLog
[![Project Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)](https://shields.io/)

**The Observability Framework for High-Performance Teams.**
Ship resilient, secure, and cost-effective Node.js applications with confidence.

> ## 🚀 Project Status: Alpha Version 🚀
>
> **SyntropyLog is currently in alpha phase with a solid foundation and comprehensive test coverage.**
>
> The core API is taking shape with **95.6% test coverage** across **530+ tests**. While the framework shows great promise, it's still in active development and not yet ready for production use.
>
> We're actively working on completing examples, refining the API, and adding missing features. Your feedback and contributions are highly welcome!

---

## The SyntropyLog Advantage: A Framework for Every Role

<details>
<summary><strong>For the Developer: An Effortless Experience</strong></summary>

> "I just want to get my work done. I need tools that are simple, powerful, and don't get in my way."

-   **Fluent & Agnostic API**: Use a clean, unified API (`.getHttp()`, `.getBroker()`) for all your external communications. Switch from `axios` to `fetch` or from Kafka to RabbitMQ by changing one line in the configuration, not your application code.
-   **Zero Boilerplate**: The `correlationId` is propagated automatically. The logger is context-aware. You just call `logger.info()` and the hard work is done for you.
-   **Rich Testability**: With built-in mocks and spy transports, writing meaningful tests for your instrumentation is trivial, not a chore.
-   **Comprehensive Type Safety**: Full TypeScript support with detailed type definitions and IntelliSense support.

</details>

<details>
<summary><strong>For the Tech Lead: Instant, End-to-End Clarity</strong></summary>

> "When something breaks at 2 AM, I need to find the root cause in minutes, not hours. I need to see the whole story."

-   **Automatic Distributed Tracing**: SyntropyLog automatically injects and retrieves a `correlationId` across service boundaries. A single ID connects a user's request from your API gateway, through your services, and across your message queues.
-   **Structured & Actionable Logs**: All logs are JSON-structured for powerful querying. Contextual information (service name, HTTP method, broker topic) is added automatically, turning ambiguous log messages into clear, actionable data.
-   **Robust Pipeline Architecture**: The logging pipeline includes serialization, masking, and context management, ensuring consistent and secure log output across your entire application.

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

-   **Declarative Log Scoping with Logging Matrix**: Stop paying to ingest verbose logs that you don't need. With the `loggingMatrix`, you can declaratively define *exactly* what parts of the context get logged for each severity level. Keep success logs lean and cheap, while capturing the full, rich context when an error occurs.
    ```typescript
    // In your config:
    loggingMatrix: {
      default: ['correlationId'], // Keep it minimal for info, debug, etc.
      error: ['*'],               // Log everything on error.
      fatal: ['*']
    }
    ```
-   **Automated Governance with Doctor CLI**: The `syntropylog doctor` is your automated gatekeeper for CI/CD. It validates configurations *before* deployment, preventing costly mistakes like overly verbose logging in production (saving on ingestion costs) or insecure setups.
-   **Tame Your ORMs with Custom Serializers**: Stop leaking data or polluting logs with massive objects. Define a serializer once for your `Prisma` or `TypeORM` models to ensure that only clean, safe data is ever logged.
-   **Security by Default**: A powerful, zero-dependency masking engine automatically finds and redacts sensitive data like `"password"` or `"creditCardNumber"` at any level of your log objects, ensuring you stay compliant.
-   **Production-Ready Transports**: Multiple transport options including JSON for production tools and human-readable formats for development environments.
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
  // Define what context gets logged. Keep it minimal by default, but verbose on error.
  loggingMatrix: {
    default: ['correlationId'],
    error: ['*'], // '*' means log the entire context
    fatal: ['*'],
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
});

// 2. Get the instrumented client and logger anywhere you need them.
const apiClient = syntropyLog.getHttp('myApi');
const logger = syntropyLog.getLogger();

// 3. Use them. The framework handles the rest.
async function main() {
    // Add extra data to the context for this specific operation
    syntropyLog.getContextManager().set('userId', 123);

    logger.info('Fetching user data...'); // Will only have `correlationId` in the context
    
    try {
      await apiClient.request({
        method: 'GET',
        url: '/users/1/posts',
      });
    } catch (err) {
      // This log will contain the full context, including `userId`, because the level is 'error'.
      logger.error({ err }, 'Failed to fetch posts');
    }
}

main();
```

---

## 📂 Learn by Example

The best way to learn SyntropyLog is to see it in action. We have a comprehensive collection of examples in the `/modules/syntropyLog-examples` directory.

Each example is a self-contained project that demonstrates a specific feature, from data masking to building a fully correlated full-stack application.

**[➡️ Explore the Examples](./modules/syntropyLog-examples/README.md)**

### Example Categories:
- **01-hello-world**: ✅ **Complete** - Basic logger setup and usage
- **10-basic-context**: 🚧 **In Progress** - Context management fundamentals  
- **20-context-ts**: 🚧 **In Progress** - TypeScript context examples
- **30-data-masking**: 🚧 **In Progress** - Security and data protection
- **40-basic-http-correlation**: 🚧 **In Progress** - HTTP request correlation
- **45-custom-http-adapter**: 🚧 **In Progress** - Custom HTTP adapters
- **50-basic-kafka-correlation**: 🚧 **In Progress** - Message broker correlation
- **60-advanced-rabbitmq-broker**: 🚧 **In Progress** - Advanced RabbitMQ integration
- **70-full-stack-correlation**: 🚧 **In Progress** - Complete distributed tracing
- **75-full-stack-correlation-http-redis**: 🚧 **In Progress** - HTTP + Redis correlation
- **80-full-stack-nats**: 🚧 **In Progress** - NATS microservices architecture
- **90-compliance-retention**: 🚧 **In Progress** - Log retention and compliance
- **100-custom-serializers**: 🚧 **In Progress** - Custom data serialization
- **110-diagnostics-doctor**: 🚧 **In Progress** - Configuration validation
- **120-private-package-registry**: 🚧 **In Progress** - Private package registry setup
- **130-github-packages-consumer**: 🚧 **In Progress** - GitHub packages integration

---

## 🧪 Testing & Quality

SyntropyLog is built with quality and reliability in mind:

- **95.6% Test Coverage** across 530+ tests
- **42 Test Files** covering all major components
- **Integration Tests** for end-to-end scenarios
- **Comprehensive Mock System** for easy testing
- **Type Safety** with full TypeScript support

Run the test suite:
```bash
npm test                    # Unit tests
npm run test:integration    # Integration tests
npm run test:coverage       # Coverage report
```

---

## 🛠️ Development

### Project Structure

SyntropyLog has been reorganized into a modular structure:

- **`syntropyLog/`**: Main library source code and tests
- **`modules/syntropyLog-examples/`**: Complete examples demonstrating framework features
- **`modules/syntropyLog-adapters/`**: External adapters for HTTP clients and message brokers

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
git clone https://github.com/Syntropysoft/SyntropyLog.git
cd syntropylog
npm install
```

### Build
```bash
npm run build              # Build library and types
npm run build:types        # Generate type definitions only
```

### Development Workflow
```bash
npm run dev                # Start development mode
npm run lint               # Run linter
npm run format             # Format code
```

---

## 📦 Installation

> **⚠️ Alpha Version Warning**: SyntropyLog is currently in alpha phase. The API may change between versions. Use with caution in production environments.

```bash
npm install syntropylog
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📞 Support

- 📖 [Documentation](./docs/)
- 🐛 [Issues](https://github.com/Syntropysoft/SyntropyLog/issues)
- 💬 [Discussions](https://github.com/Syntropysoft/SyntropyLog/discussions)
