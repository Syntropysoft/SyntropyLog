<p align="center">
  <img src="./assets/beaconLog-2.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>An Observability Framework for Node.js: Resilient, Secure, and Extensible by Design.</strong>
</p>

<p align="center">
  <a href="https://github.com/Syntropysoft/syntropylog/actions"><img src="https://github.com/Syntropysoft/syntropylog/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/syntropylog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
</p>

**SyntropyLog** is not just another logging library. It's a declarative and agnostic observability framework for Node.js, built for high-demand production systems. Its architecture focuses on three pillars: **developer freedom, security by default, and resilience against failure.**

**Requirements**: Node.js >= 18

---

## ✨ Core Philosophy: True Inversion of Control

The core of SyntropyLog is the **Adapter Pattern**. Instead of being tightly coupled to specific libraries like `axios` or `kafkajs`, the framework defines a universal "contract" (an interface). You simply provide an adapter to make any library speak the framework's language.

This gives you unprecedented freedom:
* **Use Any Client**: Instrument `axios`, `got`, `fetch`, or even a deprecated client like `request` with the same unified API.
* **Use Any Version**: Update your libraries without fear of breaking your instrumentation.
* **Future-Proof**: When a new message broker is released tomorrow, you don't have to wait for an update. You write a simple adapter, and it just works.

## 🚀 Key Features

* 🔌 **Agnostic Instrumentation**: Unified interfaces for HTTP clients, Message Brokers, and Caching clients (Redis).
* 🔒 **Secure by Default**: A processing pipeline with **serialization, masking, and sanitization** engines to protect sensitive data and prevent log injection.
* 💪 **Resilient by Design**: If a client (HTTP, Redis) fails to initialize, the application doesn't crash. Instead, a *placeholder* is injected that fails gracefully only when used, providing a clear error message.
* 🛠️ **Intelligent CLI**: Validate your configurations with `syntropylog doctor` and `audit` to prevent errors before deployment, perfect for CI/CD pipelines.
* 🧪 **Highly Testable**: Includes high-fidelity mocks (like `BeaconRedisMock`) and spy transports (`SpyTransport`) to facilitate robust unit and integration testing.
* 🕊️ **Lightweight Core**: The framework stays focused and composes with specialized libraries (e.g., for file rotation) instead of reinventing the wheel.

---

## ⚡ Quick Start: Instrumenting an HTTP Client

Getting started is as simple as configuring, injecting an adapter, and using the unified API.

```typescript
import { syntropyLog, ClassicConsoleTransport } from 'syntropylog';
import { AxiosAdapter } from 'syntropylog/http';
import axios from 'axios';

// 1. Configure and initialize SyntropyLog once.
syntropyLog.init({
  logger: {
    level: 'info',
    serviceName: 'my-app',
    transports: [new ClassicConsoleTransport()],
    // The timeout configuration is mandatory by design, forcing you
    // to actively consider the balance between fidelity and performance.
    serializerTimeoutMs: 50,
  },
  context: {
    correlationIdHeader: 'X-Correlation-ID',
  },
  http: {
    instances: [
      {
        instanceName: 'myApi',
        // You inject an adapter instance, not a 'type'.
        adapter: new AxiosAdapter(axios.create({ baseURL: 'https://api.example.com' })),
      },
    ],
  },
});

// 2. Get the instrumented client wherever you need it.
const apiClient = syntropyLog.getHttp('myApi');

// 3. Use the unified API, which is always .request().
await apiClient.request({
  method: 'GET',
  url: '/users/1',
});
```

---

## 🌐 The Power in Action: "Bring Your Own Client"

This example demonstrates how the framework instruments four different HTTP clients—modern, native, and deprecated—with the same core logic, validating the power of the adapter pattern.

[**INSERT COMPLETE HTTP ADAPTERS EXAMPLE HERE**]

---

##  kafka  Asynchronous Instrumentation: Message Brokers

Context propagation is crucial in asynchronous systems. SyntropyLog maintains the `correlationId` across messaging systems like Kafka, enabling complete end-to-end tracing.

[**INSERT COMPLETE KAFKA EXAMPLE HERE**]

---

## redis Caching Instrumentation: Redis

The same philosophy applies to caching clients like Redis. The `BeaconRedis` API is consistent, and the instrumentation is automatic.

```typescript
// Example configuration for Redis
syntropyLog.init({
  // ...other configurations...
  redis: {
    instances: [
      {
        instanceName: 'my-cache',
        mode: 'single',
        url: 'redis://localhost:6379',
        logging: {
          logCommandValues: true,
          logReturnValue: true,
        },
      },
    ],
  },
});

const redisClient = syntropyLog.getRedis('my-cache');

// --- Using the Instrumented Redis Client ---
// [**INSERT REDIS (SET/GET/DEL) EXAMPLE HERE**]
```

---

## 🏛️ Deep Dive: The Processing Pipeline

Every log you generate passes through a robust and secure pipeline before reaching its final destination.

* **1. Intelligent Serialization**: Transforms complex objects (like `Error`) into safe JSON representations. Most importantly, you can **inject your own serializers** for custom data types. To prevent a faulty serializer from impacting performance, the **`serializerTimeoutMs` setting is mandatory by design**—a decision that forces you to actively consider the balance between fidelity and stability.

* **2. Advanced Masking**: The `MaskingEngine` obfuscates sensitive data based on rules that support both strings and `RegExp`. It can even **sanitize sensitive parameters within URLs** in your logs.

* **3. Final Sanitization**: As a final layer of defense, production-oriented transports (like the default `ConsoleTransport`) use a `SanitizationEngine` to strip malicious characters (e.g., ANSI escape codes) and prevent log injection attacks.

---

## 🩺 The CLI: Your Configuration Guardian

SyntropyLog includes a command-line tool, `syntropylog`, to validate your configurations and ensure quality.

* **`syntropylog doctor <file>`**: Analyzes a single configuration file for quick feedback during development.
* **`syntropylog audit`**: Runs a full audit plan against multiple configurations (staging, production), perfect for CI/CD pipelines. If any rule fails, the process exits with an error code, stopping a faulty deployment.

Use `npx syntropylog init --rules --audit` to generate starter manifests.

---

## 🗺️ Instrumentation Roadmap

The framework is designed to grow. The adapter architecture will be extended to support more messaging and cloud services.

* **[x] Kafka** (`kafkajs`)
* **[ ] RabbitMQ** (`amqplib`)
* **[ ] NATS** (`nats.js`)
* **[ ] Google Cloud Pub/Sub**
* **[ ] Amazon SQS / Kinesis**
* **[ ] Azure Service Bus & Event Hubs**