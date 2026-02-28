# SyntropyLog

<p align="center">
  <img src="./assets/beaconLog-2.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>From Chaos to Clarity</strong>
  <br />
  The Instance Manager with Observability for High-Performance Teams
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml"><img src="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/ci.yaml/badge.svg" alt="CI Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-85.67%25-brightgreen" alt="Test Coverage"></a>
  <a href="#"><img src="https://img.shields.io/badge/status-v0.8.6-brightgreen.svg" alt="Version 0.8.6"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/actions/workflows/codeql.yml"><img src="https://github.com/Syntropysoft/SyntropyLog/workflows/CodeQL/badge.svg" alt="CodeQL"></a>
  <a href="https://github.com/Syntropysoft/SyntropyLog/security/advisories"><img src="https://img.shields.io/badge/dependabot-enabled-brightgreen.svg" alt="Dependabot"></a>
</p>

---

## 🌟 What's New in v0.8.6

The **Universal Persistence Update** simplifies how developers connect SyntropyLog to any database without external adapters.

- **🚀 Universal Persistence**: Use `UniversalAdapter` + `UniversalLogFormatter` to map logs to any schema (SQL/NoSQL) using pure JSON mapping.
- **🛡️ First-Class Audit Level**: A new `audit()` method designed for compliance and long-term storage, bypassing standard severity filters.
- **🎨 Enhanced Console UI**: Beautifully colorized output for the `audit` level across all console transports.

---


## 📋 Table of Contents

- [🎯 What is SyntropyLog?](#-what-is-syntropylog)
- [🚀 Quick Start (30 seconds)](#-quick-start-30-seconds)
- [🏢 Enterprise Implementation Guide](#-enterprise-implementation-guide)
- [📚 Manual & Tutorials](#-manual--tutorials)
- [✨ Key Features](#-key-features)
- [📊 Performance & Benchmarks](#-performance--benchmarks)
- [🎭 Core Philosophy: Silent Observer](#-core-philosophy-silent-observer)
- [🔧 Configuration Guide](#-configuration-guide)
- [🧪 Testing Guide](#-testing-guide)
- [📦 Examples & Ecosystem](#-examples--ecosystem)
- [🔒 Security & Transparency](#-security--transparency)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## 🎯 What is SyntropyLog?

**SyntropyLog is an instance manager with observability for Node.js applications.** It's not just a logger - it's a complete system that manages your application instances, their connections, and provides complete observability across your entire system with zero performance overhead.

### **🎯 Key Benefits:**
- **Zero Performance Impact** - Identical performance to Pino (industry standard)
- **Automatic Context Propagation** - Correlation IDs flow through all operations
- **Singleton Resource Management** - Prevents memory leaks and connection issues
- **Enterprise Security** - Built-in data masking and compliance features
- **Framework Agnostic** - Works with Express, Fastify, Koa, NestJS, and any Node.js app

### **🔗 Enterprise Integration & APM:**
- **Currently, SyntropyLog does not include native APM**, but the architecture allows adding custom transports to integrate with enterprise tools
- **Ideal for teams** already using Jaeger, Zipkin, Elastic, or Prometheus who want to enrich their observability without vendor lock-in
- **Custom transport support** enables seamless integration with your existing monitoring stack

---

## ⚙️ Requirements

- **Node.js**: >= 20.0.0 (Recommended: Latest LTS)

---

## 🚀 Quick Start (30 seconds)

### **Step 1: Install**
```bash
npm install syntropylog
```

### **Step 2: Basic Setup**
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

### **Step 3: Add Graceful Shutdown (REQUIRED)**
```typescript
// Add this to your main application file
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down gracefully...');
  await syntropyLog.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Shutting down gracefully...');
  await syntropyLog.shutdown();
  process.exit(0);
});
```

> ⚠️ **CRITICAL**: You **MUST** include graceful shutdown in ALL applications. This ensures logs are flushed and resources are cleaned up when your application stops.

---

## 🛠️ CLI Tools

**SyntropyLog CLI tools are now available as a separate package for better modularity and focused development.**

### **Install CLI Tools**
```bash
npm install -g @syntropysoft/praetorian
```

### **Available Commands**
- `praetorian doctor` - Diagnose your SyntropyLog configuration
- `praetorian init` - Initialize a new SyntropyLog project
- `praetorian audit` - Audit your logging configuration
- `praetorian validate` - Validate configuration files

### **Why Separate Package?**
- **Focused Development** - CLI tools evolve independently
- **Reduced Bundle Size** - Core library stays lightweight
- **Better Maintenance** - Dedicated team for CLI features
- **Faster Updates** - CLI updates don't require core library releases

> 📦 **Note**: The CLI was previously included in this package but has been moved to `@syntropysoft/praetorian` for better modularity.

---

## 🏢 Enterprise Implementation Guide

**SyntropyLog is designed for enterprise environments and can be easily integrated into your internal infrastructure.**

### **🎯 Why SyntropyLog for Enterprise?**

1. **🔒 Security by Default**
   - Built-in data masking for sensitive information
   - Compliance-ready logging with retention rules
   - No external telemetry or tracking
   - 100% open source and auditable

2. **🏗️ Scalable Architecture**
   - Singleton pattern prevents resource leaks
   - Automatic connection pooling
   - Kubernetes-ready with proper lifecycle management
   - Horizontal scaling support

3. **⚡ Performance Excellence**
   - Zero measurable performance overhead
   - Minimal bundle size impact (only +203 bytes vs Pino)
   - Optimized for high-throughput applications

### **🏢 Internal Implementation Strategy**

#### **Phase 1: Pilot Project (2-4 weeks)**
```typescript
// Start with a single microservice
await syntropyLog.init({
  logger: {
    serviceName: 'user-service',
    level: 'info',
  },
  context: {
    correlationIdHeader: 'X-Correlation-ID',
  },
  redis: {
    instances: [{
      instanceName: 'cache',
      url: process.env.REDIS_URL,
    }]
  }
});
```

#### **Phase 2: Service Mesh Integration (4-8 weeks)**
```typescript
// Standardize across multiple services
const standardConfig = {
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    serviceName: process.env.SERVICE_NAME,
  },
  context: {
    correlationIdHeader: 'X-Correlation-ID',
    traceIdHeader: 'X-Trace-ID',
  },
  masking: {
    fields: ['password', 'token', 'secret'],
    preserveLength: true,
  }
};
```

#### **Phase 3: Enterprise Features (8-12 weeks)**
```typescript
// Full enterprise configuration
await syntropyLog.init({
  ...standardConfig,
  redis: {
    instances: [
      { instanceName: 'cache', url: process.env.CACHE_REDIS_URL },
      { instanceName: 'session', url: process.env.SESSION_REDIS_URL },
    ]
  },
  brokers: {
    instances: [
      { instanceName: 'events', adapter: new KafkaAdapter(kafkaConfig) },
      { instanceName: 'notifications', adapter: new RabbitMQAdapter(rabbitConfig) },
    ]
  },
  http: {
    instances: [
      { instanceName: 'api', adapter: new AxiosAdapter(axiosConfig) },
    ]
  }
});
```

### **🔧 Enterprise Configuration Patterns**

#### **Environment-Based Configuration**
```typescript
// config/syntropylog.ts
export const getSyntropyConfig = (env: string) => {
  const baseConfig = {
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      serviceName: process.env.SERVICE_NAME,
    },
    context: {
      correlationIdHeader: 'X-Correlation-ID',
    }
  };

  switch (env) {
    case 'development':
      return {
        ...baseConfig,
        redis: { instances: [{ instanceName: 'cache', url: 'redis://localhost:6379' }] }
      };
    
    case 'staging':
      return {
        ...baseConfig,
        redis: { instances: [{ instanceName: 'cache', url: process.env.STAGING_REDIS_URL }] },
        masking: { fields: ['password', 'token'] }
      };
    
    case 'production':
      return {
        ...baseConfig,
        redis: { instances: [{ instanceName: 'cache', url: process.env.PROD_REDIS_URL }] },
        masking: { fields: ['password', 'token', 'secret', 'apiKey'] },
        loggingMatrix: {
          default: ['correlationId', 'serviceName'],
          error: ['*']
        }
      };
  }
};
```

#### **Centralized Logging Infrastructure**
```typescript
// shared/syntropylog-setup.ts
export class SyntropyLogManager {
  private static instance: SyntropyLogManager;
  
  static getInstance(): SyntropyLogManager {
    if (!SyntropyLogManager.instance) {
      SyntropyLogManager.instance = new SyntropyLogManager();
    }
    return SyntropyLogManager.instance;
  }

  async initialize(serviceName: string) {
    const config = getSyntropyConfig(process.env.NODE_ENV);
    await syntropyLog.init({
      ...config,
      logger: { ...config.logger, serviceName }
    });
  }

  getLogger(context?: string) {
    return syntropyLog.getLogger(context);
  }

  getRedis(instanceName: string) {
    return syntropyLog.getRedis(instanceName);
  }
}
```

### **📊 Enterprise Monitoring Integration**

#### **Prometheus Metrics**
```typescript
// Add custom metrics to your logs
const logger = syntropyLog.getLogger();
logger.info('API Request', {
  endpoint: '/users',
  method: 'GET',
  duration: 150,
  statusCode: 200,
  // These will be automatically picked up by your monitoring system
  metrics: {
    request_duration_ms: 150,
    requests_total: 1,
    status_code: 200
  }
});
```

#### **ELK Stack Integration**
```typescript
// Configure for ELK stack
await syntropyLog.init({
  logger: {
    serviceName: 'user-service',
    level: 'info',
    transports: [
      new JsonConsoleTransport(), // Structured JSON for Logstash
    ]
  },
  context: {
    correlationIdHeader: 'X-Correlation-ID',
  }
});
```

### **🔒 Enterprise Security Features**

#### **Data Masking**
```typescript
// Automatic sensitive data masking
await syntropyLog.init({
  masking: {
    fields: ['password', 'token', 'secret', 'apiKey', 'creditCard'],
    preserveLength: true, // Shows **** instead of completely hiding
    patterns: [
      { regex: /\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b/, replacement: '[CARD_NUMBER]' }
    ]
  }
});

// Usage - sensitive data is automatically masked
logger.info('User login attempt', {
  email: 'user@example.com',
  password: 'secret123', // Will be masked as '********'
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // Will be masked
});
```

#### **Compliance Logging**
```typescript
// GDPR/Compliance ready logging
await syntropyLog.init({
  loggingMatrix: {
    default: ['correlationId', 'serviceName', 'timestamp'],
    audit: ['*'], // Log everything for audit trails
    error: ['*', 'stackTrace', 'context'],
    security: ['*', 'ipAddress', 'userAgent', 'requestId']
  }
});
```

---

## 📚 Manual & Tutorials

### **🎯 Getting Started Tutorials**

#### **Tutorial 1: Basic Logging (5 minutes)**
```typescript
// 1. Install and initialize
import { syntropyLog } from 'syntropylog';

await syntropyLog.init({
  logger: { serviceName: 'tutorial-app', level: 'info' }
});

// 2. Use basic logging
const logger = syntropyLog.getLogger();
logger.info('Application started');
logger.warn('This is a warning');
logger.error('This is an error', { error: 'Something went wrong' });

// 3. Add context
logger.info('User action', { userId: '123', action: 'login' });
```

#### **Tutorial 2: Context and Correlation (10 minutes)**
```typescript
// 1. Set up context management
await syntropyLog.init({
  logger: { serviceName: 'context-demo', level: 'info' },
  context: { correlationIdHeader: 'X-Correlation-ID' }
});

// 2. Create context for a request
const contextManager = syntropyLog.getContextManager();
contextManager.run(async () => {
  // Set correlation ID
  contextManager.set('X-Correlation-ID', 'req-123');
  
  const logger = syntropyLog.getLogger();
  logger.info('Request started'); // Automatically includes correlation ID
  
  // All operations in this context will have the same correlation ID
  await someAsyncOperation();
  
  logger.info('Request completed');
});
```

#### **Tutorial 3: Redis Integration (15 minutes)**
```typescript
// 1. Configure Redis
await syntropyLog.init({
  logger: { serviceName: 'redis-demo', level: 'info' },
  context: { correlationIdHeader: 'X-Correlation-ID' },
  redis: {
    instances: [{
      instanceName: 'cache',
      url: 'redis://localhost:6379'
    }]
  }
});

// 2. Use Redis with automatic correlation
const redis = syntropyLog.getRedis('cache');
const logger = syntropyLog.getLogger();

// Set context
const contextManager = syntropyLog.getContextManager();
contextManager.run(async () => {
  contextManager.set('X-Correlation-ID', 'user-456');
  
  // All operations automatically include correlation ID
  await redis.set('user:456:profile', JSON.stringify({ name: 'John' }));
  const profile = await redis.get('user:456:profile');
  
  logger.info('User profile cached', { userId: '456' });
});
```

### **🔧 Advanced Configuration Tutorials**

#### **Tutorial 4: Custom Transports (20 minutes)**
```typescript
// 1. Create custom transport
import { Transport } from 'syntropylog';

class SlackTransport extends Transport {
  async log(level: string, message: string, meta: any) {
    if (level === 'error') {
      // Send errors to Slack
      await this.sendToSlack({
        text: `🚨 Error in ${meta.serviceName}: ${message}`,
        attachments: [{ text: JSON.stringify(meta, null, 2) }]
      });
    }
  }
}

// 2. Use custom transport
await syntropyLog.init({
  logger: {
    serviceName: 'slack-demo',
    level: 'info',
    transports: [
      new PrettyConsoleTransport(),
      new SlackTransport()
    ]
  }
});
```

#### **Tutorial 5: HTTP Client Integration (25 minutes)**
```typescript
// 1. Configure HTTP client
import { AxiosAdapter } from '@syntropylog/adapters';
import axios from 'axios';

await syntropyLog.init({
  logger: { serviceName: 'http-demo', level: 'info' },
  context: { correlationIdHeader: 'X-Correlation-ID' },
  http: {
    instances: [{
      instanceName: 'api',
      adapter: new AxiosAdapter(axios.create({
        baseURL: 'https://api.example.com'
      }))
    }]
  }
});

// 2. Use instrumented HTTP client
const apiClient = syntropyLog.getHttp('api');
const logger = syntropyLog.getLogger();

// All HTTP calls automatically include correlation ID and logging
const response = await apiClient.request({
  method: 'GET',
  url: '/users/123'
});

logger.info('API call completed', { 
  statusCode: response.status,
  duration: response.duration 
});
```

#### **Tutorial 6: Auditing & Custom Adapters (30 minutes)**
```typescript
// 1. Define a persistent adapter (e.g. for Postgres/Internal API)
import { ILogTransportAdapter, AdapterTransport, syntropyLog } from 'syntropylog';

class MyDatabaseAdapter implements ILogTransportAdapter {
  async log(entry: any) {
    // In a real app: await db.insert('audit_logs', entry);
    console.log('Auditing to DB:', entry.message);
  }
}

// 2. Configure with category routing and audit level
await syntropyLog.init({
  logger: {
    serviceName: 'secure-app',
    level: 'info',
    transports: {
      default: [new ConsoleTransport()],
      audit: [new AdapterTransport({ adapter: new MyDatabaseAdapter() })]
    }
  }
});

// 3. Usage: Audit logs bypass standard level filtering
const logger = syntropyLog.getLogger('audit');
await logger.audit('Sensitive User Action', { userId: '456' }); // Always persisted
```

### **🚀 Universal Persistence (Storage Agnostic)**
Starting from v0.8.x, SyntropyLog includes a powerful way to persist logs to any destination without external dependencies. By using `UniversalAdapter` and `UniversalLogFormatter`, you can map your logs to any schema using JSON and provide an execution function.

#### **The Quickest Example: In-memory/Console Capture**
```typescript
const adapter = new UniversalAdapter({
  executor: (data) => console.log('Captured by Adapter:', data)
});

const formatter = new UniversalLogFormatter({
  mapping: { msg: 'message', severity: 'level' }
});

// Result: { msg: "Hello", severity: "info" }
```

#### **Example: Persisting to MongoDB (Object-based)**
```typescript
import { UniversalAdapter, UniversalLogFormatter, syntropyLog } from 'syntropylog';

const mongoAdapter = new UniversalAdapter({
  executor: (doc) => db.collection('logs').insertOne(doc)
});

const mongoFormatter = new UniversalLogFormatter({
  mapping: {
    user: 'metadata.userId',
    event: 'message',
    level: 'level',
    payload: 'bindings' // Full object path
  }
});

await syntropyLog.init({
  logger: {
    transports: {
      audit: [new AdapterTransport({
        adapter: mongoAdapter,
        formatter: mongoFormatter
      })]
    }
  }
});
```

#### **Example: Generic SQL (Postgres/MySQL)**
```typescript
const sqlAdapter = new UniversalAdapter({
  executor: ({ sql, values }) => pool.query(sql, values)
});

const sqlFormatter = new UniversalLogFormatter({
  mapping: {
    column_user: 'bindings.userId',
    column_msg: 'message'
  }
});
```

---

## ✨ Key Features

### **🔄 Zero Boilerplate**
- Get started in 30 seconds with automatic context propagation
- No complex setup or configuration required
- Works out of the box with sensible defaults

### **🔗 Automatic Correlation**
- Distributed tracing across services, HTTP calls, and message brokers
- Correlation IDs automatically propagate through all operations
- Complete request flow visibility without manual effort

### **🎯 Framework Agnostic**
- Works with Express, Fastify, Koa, NestJS, and any Node.js app
- No framework-specific dependencies
- Easy integration with existing applications

### **🛡️ Security First**
- Built-in data masking for sensitive information
- Compliance-ready logging with retention rules
- No external telemetry or tracking

### **⚡ High Performance**
- 45,000+ ops/sec with less than 1ms latency
- Zero measurable performance overhead
- Minimal bundle size impact

### **🏗️ Singleton Pattern**
- Prevents pod crashes by managing resource instances efficiently
- Automatic connection pooling and resource management
- Kubernetes-ready with proper lifecycle management

---

## 📊 Performance & Benchmarks

**SyntropyLog achieves a remarkable technical milestone: offering advanced distributed tracing and instance management capabilities with zero performance impact.**

### **🏆 Benchmark Results**

| Logger | Bundle Size (JS) | Performance Time | vs No Logger | vs Pino |
|--------|------------------|------------------|--------------|---------|
| No Logger | 5 KB | 3 ms | - | - |
| Pino | 5 KB | 2 ms | -193 B | - |
| **SyntropyLog** | **5 KB** | **2 ms** | **+10 B** | **+203 B (1.03x) / +0 ms (1.00x)** |

### **🚀 Key Achievements**

1. **Zero Performance Overhead** - Identical performance to Pino
2. **Minimal Bundle Size** - Only 203 bytes larger than Pino
3. **Advanced Features** - Distributed tracing, resource management, data masking
4. **Enterprise Ready** - Security and compliance features included

---

## 🎭 Core Philosophy: Silent Observer

**SyntropyLog follows the "Silent Observer" principle - we report what happened and nothing more.**

### **🚫 Never Interrupts Your Application**

```typescript
// ✅ Your application continues running, even if logging fails
try {
  const result = await database.query('SELECT * FROM users');
  logger.info('Query successful', { count: result.length });
} catch (error) {
  // Your error handling continues normally
  logger.error('Database error', { error: error.message });
  // Application logic continues...
}
```

### **🔍 Error Handling Strategy**

1. **Configuration Errors** → Application fails to start (as expected)
2. **Pipeline Errors** → Error reported to transports, application continues
3. **Serializer Errors** → Error reported to transports, application continues  
4. **Transport Errors** → Error reported to console, application continues

**Think of SyntropyLog as a journalist - we observe, report, and never interfere with the main story.**

---

## 🔧 Configuration Guide

### **Basic Configuration**
```typescript
await syntropyLog.init({
  logger: {
    serviceName: 'my-app',
    level: 'info', // debug, info, warn, error, audit
  },
  context: {
    correlationIdHeader: 'X-Correlation-ID',
  }
});
```

### **Advanced Configuration**
```typescript
await syntropyLog.init({
  logger: {
    serviceName: 'my-app',
    level: 'info',
    transports: {
      default: [new PrettyConsoleTransport()],
      audit: [new MySecureTransport()]
    }
  },
  context: {
    correlationIdHeader: 'X-Correlation-ID',
    traceIdHeader: 'X-Trace-ID',
  },
  redis: {
    instances: [
      { instanceName: 'cache', url: 'redis://localhost:6379' },
      { instanceName: 'session', url: 'redis://localhost:6380' },
    ]
  },
  brokers: {
    instances: [
      { instanceName: 'events', adapter: new KafkaAdapter(kafkaConfig) },
    ]
  },
  http: {
    instances: [
      { instanceName: 'api', adapter: new AxiosAdapter(axiosConfig) },
    ]
  },
  masking: {
    fields: ['password', 'token', 'secret'],
    preserveLength: true,
  },
  loggingMatrix: {
    default: ['correlationId', 'serviceName'],
    error: ['*'],
    audit: ['*'],
  }
});
```

---

## 🧪 Testing Guide

### **Zero Boilerplate Testing**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from './UserService';
const { createTestHelper } = require('syntropylog/testing');

// No initialization, no shutdown, no external dependencies
const testHelper = createTestHelper();

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    testHelper.beforeEach(); // Reset mocks
    userService = new UserService(testHelper.mockSyntropyLog); // Inject mock
  });

  it('should create user successfully', async () => {
    const result = await userService.createUser({ 
      name: 'John', 
      email: 'john@example.com' 
    });
    expect(result).toHaveProperty('userId');
    expect(result.name).toBe('John');
  });
});
```

### **Benefits**
- **🚫 No Connection Boilerplate** - No init/shutdown in tests
- **⚡ Lightning Fast** - Everything runs in memory
- **🔒 Reliable** - No network issues or state conflicts
- **🎯 Focused** - Test business logic, not framework internals

---

## 📦 Examples & Ecosystem

### **🔥 Ejemplos que "Revientan por los Aires"**

Estos ejemplos demuestran el poder real de SyntropyLog en aplicaciones complejas del mundo real:

#### **🚀 [Microservicio Completo](./examples/01-microservice-complete/)**
**E-commerce API con observabilidad total**
- ✅ **Distributed tracing** automático entre servicios
- ✅ **Cache inteligente** con Redis y correlation IDs
- ✅ **HTTP clients instrumentados** para APIs externas
- ✅ **Data masking automático** para datos sensibles
- ✅ **Event streaming** con message brokers
- ✅ **Performance tracking** en todas las operaciones
- ✅ **Error handling robusto** con context preservation

#### **🔥 [Eventos en Tiempo Real](./examples/02-realtime-events/)**
**WebSocket server con analytics en tiempo real**
- ✅ **WebSocket management** con observabilidad automática
- ✅ **Real-time analytics** y métricas de performance
- ✅ **Connection pooling** y room management
- ✅ **Event processing pipeline** con Redis persistence
- ✅ **Load balancing** y automatic error recovery
- ✅ **Security** con rate limiting y data masking
- ✅ **Production-ready** con Kubernetes deployment

### **🎯 Ejemplos Básicos (00-09)**
- **00**: Basic Setup - Simple initialization and logging
- **01**: Configuration - Environment-based configuration
- **02**: Context Management - Correlation IDs and request tracking
- **03**: Log Levels - Debug, info, warn, error with filtering
- **04**: Custom Transports - Console, file, and custom outputs
- **05**: HTTP Integration - Framework agnostic HTTP client
- **06**: Redis Integration - Caching with automatic correlation
- **07**: Message Brokers - Kafka, RabbitMQ, NATS integration
- **08**: Serialization - Custom data formatting and masking
- **09**: Testing - Unit tests with SyntropyLogMock

#### **🌐 HTTP Framework Integration (10-15)**
- **10**: Express.js - Traditional Express server with context
- **11**: Custom HTTP Adapter - Creating custom adapters
- **12**: Express + Redis + Axios - Complete microservice with caching
- **13**: Fastify + Redis - High-performance Fastify with automatic context
- **14**: NestJS Integration - Enterprise-grade framework with decorators
- **15**: Koa + Redis - Modern Koa server with Redis caching

#### **📡 Message Brokers (20-24)**
- **20**: Kafka Integration - Event streaming with correlation
- **21**: RabbitMQ Integration - Message queuing with context
- **22**: NATS Integration - Lightweight messaging
- **23**: Multiple Brokers - Using different brokers in same app
- **24**: Producer/Consumer Patterns - Complete messaging workflows

#### **🧪 Testing Patterns (28-32)**
- **28**: Vitest Integration - Modern testing with SyntropyLogMock
- **29**: Jest Integration - Traditional testing framework
- **30**: Redis Context Testing - Testing with Redis mocks
- **31**: Serializer Testing - Custom serializer validation
- **32**: Transport Spies - Testing log outputs and formats

Estos ejemplos demuestran el poder real de SyntropyLog en aplicaciones complejas del mundo real:

#### **🚀 [Microservicio Completo](./examples/01-microservice-complete/)**
**E-commerce API con observabilidad total**
- ✅ **Distributed tracing** automático entre servicios
- ✅ **Cache inteligente** con Redis y correlation IDs
- ✅ **HTTP clients instrumentados** para APIs externas
- ✅ **Data masking automático** para datos sensibles
- ✅ **Event streaming** con message brokers
- ✅ **Performance tracking** en todas las operaciones
- ✅ **Error handling robusto** con context preservation

#### **🔥 [Eventos en Tiempo Real](./examples/02-realtime-events/)**
**WebSocket server con analytics en tiempo real**
- ✅ **WebSocket management** con observabilidad automática
- ✅ **Real-time analytics** y métricas de performance
- ✅ **Connection pooling** y room management
- ✅ **Event processing pipeline** con Redis persistence
- ✅ **Load balancing** y automatic error recovery
- ✅ **Security** con rate limiting y data masking
- ✅ **Production-ready** con Kubernetes deployment

### **📦 Ecosystem**

- **[syntropylog](https://www.npmjs.com/package/syntropylog)** - Core framework
- **[@syntropylog/adapters](https://www.npmjs.com/package/@syntropylog/adapters)** - HTTP and broker adapters
- **[@syntropylog/types](https://www.npmjs.com/package/@syntropylog/types)** - TypeScript types
- **[syntropylog-examples](https://github.com/Syntropysoft/syntropylog-examples)** - 32 complete examples

---

## 🔒 Security & Transparency

**We invite any member of the community to audit the code. If you find anything suspicious, please open an issue or a pull request.**

### **🔒 Security Features**
- 100% open source and public
- No hidden telemetry, tracking, or obfuscated code
- Automated dependency and vulnerability scans via GitHub Dependabot and CodeQL
- High code coverage and comprehensive testing
- External and community audits are welcome

### **🏢 Enterprise Security**
- Built-in data masking for sensitive information
- Compliance-ready logging with retention rules
- GDPR and SOC2 compliance features
- No external data transmission

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### **🎯 How to Contribute**
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### **🔧 Development Setup**
```bash
git clone https://github.com/Syntropysoft/SyntropyLog.git
cd SyntropyLog
npm install
npm run test
```

---

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

**From Chaos to Clarity** - Ship resilient, secure, and cost-effective Node.js applications with confidence.

---

## 👨‍💻 Author & Contact

<p align="center">
  <strong>Built with ❤️ by the SyntropySoft Team</strong>
</p>

### **🤝 Get in Touch**
- **👨‍💼 Gabriel Alejandro Gomez** - Lead Developer & Architect
- **💼 [LinkedIn](https://www.linkedin.com/in/gabriel-alejandro-gomez-652a5111/)** - Connect for enterprise partnerships
- **📧 [Email](mailto:gabriel70@gmail.com)** - Technical questions & support
- **🏢 [SyntropySoft](https://syntropysoft.com)** - Enterprise solutions & consulting

### **💼 Enterprise Partnerships**
We specialize in enterprise observability solutions and custom integrations. Whether you need:
- **Custom transport development** for your existing APM stack
- **Enterprise deployment** and configuration
- **Performance optimization** and scaling strategies
- **Compliance implementation** (GDPR, SOC2, HIPAA)

**Let's discuss how SyntropyLog can enhance your observability strategy.**

---

<p align="center">
  <em>Empowering high-performance teams with enterprise-grade observability</em>
</p>

---

<p align="center">
  <strong>Thank you for considering SyntropyLog for your mission-critical systems.</strong><br>
  <em>– Gabriel</em>
</p>
