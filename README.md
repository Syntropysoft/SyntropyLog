<p align="center">
  <img src="https://raw.githubusercontent.com/Syntropysoft/syntropylog-examples-/main/assets/syntropyLog-logo.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>From Chaos to Clarity</strong>
  <br />
  The Observability Framework for High-Performance Teams
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-94.1%25-brightgreen" alt="Test Coverage"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-beta-blue.svg" alt="Beta"></a>
</p>

---

## 🚀 Quick Start

Get started with SyntropyLog in **30 seconds**:

```bash
npm install syntropylog@0.6.13
```

```typescript
import { syntropyLog } from 'syntropylog';

// Initialize with minimal configuration
await syntropyLog.init({
  logger: {
    serviceName: 'my-app',
    level: 'info',
  },
});

// Use it immediately
const logger = syntropyLog.getLogger();
logger.info('Hello, SyntropyLog!');
```

## ✨ Key Features

- **🔄 Zero Boilerplate** - Get started in 30 seconds with automatic context propagation
- **🔗 Automatic Correlation** - Distributed tracing across services, HTTP calls, and message brokers
- **🎯 Framework Agnostic** - Works with Express, Fastify, Koa, NestJS, and any Node.js app
- **🛡️ Security First** - Built-in data masking and compliance-ready logging
- **⚡ High Performance** - 45,000+ ops/sec with less than 1ms latency
- **🏗️ Singleton Pattern** - Prevents pod crashes by managing resource instances efficiently

## 📚 Documentation

- **[Getting Started](https://syntropysoft.github.io/syntropylog-doc/docs/getting-started)** - Complete setup guide *(in progress)*
- **[API Reference](https://syntropysoft.github.io/syntropylog-doc/docs/api-reference)** - Full API documentation *(in progress)*
- **[Examples](https://syntropysoft.github.io/syntropylog-doc/examples)** - 29 production-ready examples *(in progress)*
- **[Configuration Guide](https://syntropysoft.github.io/syntropylog-doc/docs/configuration)** - Advanced configuration *(in progress)*

## 🎯 Production Ready

SyntropyLog is **BETA (0.6.13)** and ready for production use:

- ✅ **94.1% test coverage** across 616+ tests
- ✅ **Core features stable** - Logger, context, HTTP, Redis, brokers
- ✅ **API stable** - Backward compatible
- ✅ **17 examples complete** - Core features and message brokers tested
- ✅ **Real integration** - Examples work with actual services (Redis, Kafka, etc.)

## 🔧 Standard Configuration

For most applications, you'll want HTTP instrumentation and context management:

```typescript
import { syntropyLog, PrettyConsoleTransport } from 'syntropylog';
import { AxiosAdapter } from '@syntropylog/adapters';
import axios from 'axios';

await syntropyLog.init({
  logger: {
    level: 'info',
    serviceName: 'my-app',
    transports: [new PrettyConsoleTransport()],
  },
  loggingMatrix: {
    default: ['correlationId'],
    error: ['*'], // Log everything on errors
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

// Use the instrumented client (singleton instances)
const apiClient = syntropyLog.getHttp('myApi');
const logger = syntropyLog.getLogger();

// Automatic correlation and logging
await apiClient.request({ method: 'GET', url: '/users' });

// Multiple instances with different configurations
const userLogger = syntropyLog.getLogger('user-service');
const paymentLogger = syntropyLog.getLogger('payment-service');
const cacheRedis = syntropyLog.getRedis('cache');
const sessionRedis = syntropyLog.getRedis('session');
const eventsBroker = syntropyLog.getBroker('events');
const notificationsBroker = syntropyLog.getBroker('notifications');

// All instances are singletons - efficient resource usage
```

## 🏗️ Singleton Pattern - Intelligent Resource Management

SyntropyLog implements a **Singleton pattern** across all resource types, providing automatic instance management and preventing common production issues:

### **🎯 Named Instance Management**
Every resource in SyntropyLog is created with a **unique name** and managed as a singleton:

```typescript
// Loggers - Named instances with automatic singleton management
const userLogger = syntropyLog.getLogger('user-service');     // Creates new instance
const paymentLogger = syntropyLog.getLogger('payment-service'); // Creates new instance
const userLogger2 = syntropyLog.getLogger('user-service');    // Returns existing instance

// Redis instances - Same pattern for database connections
const cacheRedis = syntropyLog.getRedis('cache');             // Creates new connection
const sessionRedis = syntropyLog.getRedis('session');         // Creates new connection
const cacheRedis2 = syntropyLog.getRedis('cache');            // Returns existing connection

// Message brokers - Consistent pattern across all broker types
const eventsBroker = syntropyLog.getBroker('events');         // Creates new broker instance
const notificationsBroker = syntropyLog.getBroker('notifications'); // Creates new instance
const eventsBroker2 = syntropyLog.getBroker('events');        // Returns existing instance

// HTTP clients - Instrumented clients follow the same pattern
const apiClient = syntropyLog.getHttp('myApi');               // Creates new client
const apiClient2 = syntropyLog.getHttp('myApi');              // Returns existing client

// All subsequent calls return the SAME instance
console.log(userLogger === userLogger2);      // true ✅
console.log(cacheRedis === cacheRedis2);      // true ✅
console.log(eventsBroker === eventsBroker2);  // true ✅
console.log(apiClient === apiClient2);        // true ✅
```

### **🔄 Automatic Resource Lifecycle**
The framework automatically manages the lifecycle of all instances:

- **First call**: Creates new instance and stores it internally
- **Subsequent calls**: Returns the existing instance (singleton)
- **Memory efficient**: No duplicate connections or instances
- **Connection reuse**: Redis and broker connections are pooled
- **Consistent state**: Same instance across your entire application

### **⚡ Production Benefits**
This pattern provides critical advantages in production environments:

- **🛡️ Pod Stability**: Prevents OOM (Out of Memory) crashes from multiple instances
- **🔗 Connection Efficiency**: Reuses existing connections instead of creating new ones
- **📊 Consistent Observability**: Same logger instance ensures consistent correlation IDs
- **⚡ Performance**: Eliminates overhead of creating duplicate resources
- **🏗️ Resource Management**: Automatic cleanup and connection pooling
- **🚀 Kubernetes Ready**: Essential for containerized environments where memory is limited

## 📦 Ecosystem

- **[syntropylog](https://www.npmjs.com/package/syntropylog)** - Core framework
- **[@syntropylog/adapters](https://www.npmjs.com/package/@syntropylog/adapters)** - HTTP and broker adapters
- **[@syntropylog/types](https://www.npmjs.com/package/@syntropylog/types)** - TypeScript types
- **[syntropylog-examples](https://github.com/Syntropysoft/syntropylog-examples-)** - 29 complete examples

## 🚀 Examples

Complete examples demonstrating SyntropyLog features:

### ✅ **Complete & Tested (00-13, 20-24)**
- **00-09**: Core Framework Features - Basic setup, context, configuration
- **10-13**: HTTP & Redis Integration - Framework agnosticism (Express, Fastify)
- **20-24**: Message Brokers - Kafka, RabbitMQ, NATS with correlation

### 🚧 **In Development (14-19, 25-27)**
- **14-19**: Advanced Framework Features - NestJS, Koa, Hapi, custom serializers
- **25-27**: Enterprise Patterns - Production configuration, advanced context

[View all examples →](https://github.com/Syntropysoft/syntropylog-examples-)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- 📖 [Documentation](https://syntropysoft.github.io/syntropylog-doc/) *(in progress)*
- 🐛 [Issues](https://github.com/Syntropysoft/SyntropyLog/issues)
- 💬 [Discussions](https://github.com/Syntropysoft/SyntropyLog/discussions)

---

**From Chaos to Clarity** - Ship resilient, secure, and cost-effective Node.js applications with confidence.
