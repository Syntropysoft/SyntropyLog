# SyntropyLog

<p align="center">
  <img src="./assets/beaconLog-2.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>Centralized Resource Management with Automatic Observability</strong>
  <br />
  One tool to rule your instances, a thousand insights to watch them grow.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml"><img src="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml/badge.svg" alt="CI Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-85.67%25-brightgreen" alt="Test Coverage"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-v0.8.9-brightgreen.svg" alt="Version 0.8.9"></a>
</p>

---

## 🎯 What is SyntropyLog?

SyntropyLog is a **Resource Instance Manager** for Node.js. It centralizes your connections (Redis, HTTP clients, Brokers) to prevent the "Chaos" of uncontrolled singletons, while automatically providing **distributed tracing and structured logging** with zero extra effort.

**Think of it as the "Brain" of your microservices that watches and manages everything they do.**

### **Why use it?**
- **🛑 Stop Connection Chaos**: Centralize Redis, HTTP, and Message Broker instances.
- **🕵️ Automatic Observability**: Correlation IDs and traces flow through your app without manual "plumbing".
- **🛡️ Data Privacy**: Built-in masking for sensitive information (GDPR ready).
- **⚡ Zero Overhead**: High-performance core that adds virtually no latency.

---

## 🚀 Quick Start (60 seconds)

### **1. Install**
```bash
npm install syntropylog
```

### **2. Setup & Use**
```typescript
import { syntropyLog } from 'syntropylog';

// Initialize central manager
await syntropyLog.init({
  logger: { serviceName: 'my-service', level: 'info' }
});

// Get a context-aware logger anywhere in your app
const logger = syntropyLog.getLogger();
logger.info('System is clean and ready.');

// Register and retrieve a managed Redis instance
// (Automatically instrumented for observability!)
const redis = syntropyLog.getRedis('cache');
```

### **3. Graceful Shutdown (Essential)**
```typescript
process.on('SIGTERM', async () => {
  await syntropyLog.shutdown();
  process.exit(0);
});
```

---

## ✨ Key Capabilities

| Feature | Description |
| :--- | :--- |
| **Instance Management** | Register shared resources once, use them everywhere with confidence. |
| **Correlation Tracking** | Trace requests across multiple services and DBs automatically. |
| **Silent Observer** | If logging fails, your application keeps running perfectly. |
| **Universal Persistence** | Map logs to ANY database (SQL/NoSQL) with pure JSON mapping. |

---

## 📚 Learn More

Don't let the length fool you—SyntropyLog is deep. Explore our specialized guides:

- [🏢 Enterprise Patterns](./docs/enterprise.md) - Scalable architectures.
- [🔧 Full Config Reference](./docs/configuration.md) - Every knob and switch.
- [🧪 Testing Strategy](./docs/testing.md) - Mocking with zero boilerplate.
- [📦 Real-world Examples](./examples) - Integration with Express, NestJS and more.

---

## 🔒 Security & Transparency

- **100% Open Source**: No hidden telemetry or tracking.
- **Socket.dev 100/100**: Guaranteed supply chain security.
- **Privacy Native**: Automatic masking of passwords, tokens, and PII.

---

## 🤝 Contributing & License

We love contributors! Check our [Contributing Guide](./CONTRIBUTING.md).
Project licensed under **Apache-2.0**.
