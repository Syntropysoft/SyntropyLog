<p align="center">
  <img src="./assets/beaconLog-2.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>An Observability Framework for Node.js: Resilient, Secure, and Extensible by Design.</strong>
</p>

<p align="center">
  <a href="https://github.com/Sintropyc/syntropylog/actions"><img src="https://github.com/Sintropyc/syntropylog/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Sintropyc/syntropylog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
</p>

**SyntropyLog** is not just another logging library. It's a declarative and agnostic observability framework for Node.js, built for high-demand production systems. Its architecture focuses on three pillars: **developer freedom, security by default, and resilience against failure.**

**Requirements**: Node.js >= 18

---

## ✨ Core Philosophy: True Inversion of Control

The core of SyntropyLog is the **Adapter Pattern**. Instead of being tightly coupled to specific libraries like `axios` or `kafkajs`, the framework defines a universal "contract" (an interface). You simply provide an adapter to make any library speak the framework's language.

This gives you unprecedented freedom:
*   **Use Any Client**: Instrument `axios`, `got`, `fetch`, or even a deprecated client like `request` with the same unified API.
*   **Use Any Version**: Update your libraries without fear of breaking your instrumentation.
*   **Future-Proof**: When a new message broker is released tomorrow, you don't have to wait for an update. You write a simple adapter, and it just works.

## 🚀 Key Features

*   🔌 **Agnostic Instrumentation**: Unified interfaces for HTTP clients, Message Brokers (Kafka, RabbitMQ), and Caching clients (Redis). The framework adapts to your tools, not the other way around.

*   🔒 **Secure by Default**: A robust processing pipeline with **serialization, masking, and sanitization** engines to protect sensitive data and prevent log injection attacks.

*   💪 **Resilient by Design**: If a client (HTTP, Redis) fails to initialize, the application doesn't crash. Instead, a *placeholder* is injected that fails gracefully only when used, providing a clear error message and keeping your service online.

*   🕊️ **Zero Production Dependencies**: The core library (`@syntropylog/core`) has no production dependencies. Optional dependencies (like `axios` or `kafkajs`) are only installed if you choose to use the corresponding adapters.

*   CONTEXT **Automatic Context Management**: Transparent propagation of the `correlationId` across HTTP clients and message brokers, enabling complete distributed tracing without manual effort.

*   🛠️ **Intelligent CLI**: Validate your configurations with `syntropylog doctor` and `audit` to prevent errors before deployment. Ideal for CI/CD pipelines.

*   🧪 **Highly Testable**: Includes high-fidelity mocks (like `BeaconRedisMock`) and spy transports (`SpyTransport`) to facilitate robust unit and integration testing.

*   🎨 **Flexible Logging**: Multiple logging "transports," from production-optimized JSON to colorful, human-readable formats for development (`PrettyConsoleTransport`, `ClassicConsoleTransport`).

---

## 📦 Installation

Install the main package using your preferred package manager:

```bash
# With npm
npm install syntropylog

# With yarn
yarn add syntropylog
```

To use a pre-built adapter, like the one for `axios`, also install its package and the corresponding client:

```bash
# With npm
npm install @syntropylog/axios-adapter axios

# With yarn
yarn add @syntropylog/axios-adapter axios
```

## ⚡ Quick Start

Instrumenting an HTTP client is as simple as configuring, injecting an adapter, and using the unified API.

```typescript
import { syntropyLog } from 'syntropylog';
import { PrettyConsoleTransport } from 'syntropylog/transports';
import { AxiosAdapter } from '@syntropylog/axios-adapter';
import axios from 'axios';

// 1. Configure and initialize SyntropyLog once.
syntropyLog.init({
  logger: {
    level: 'info',
    serviceName: 'my-app',
    transports: [new PrettyConsoleTransport()], // Developer-friendly logging
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
async function main() {
    await apiClient.request({
      method: 'GET',
      url: '/users/1',
    });
}

main();
```

This will produce a clear, colored log in your console, with the `correlationId` and HTTP request details automatically added.

---

## 🏛️ Key Concepts

### 1. Logging: Flexible and Environment-Oriented

The logging system is designed to be powerful and adaptable. Its main component is **Transports**, which decide the format and destination of your logs.

#### Console Transports

You can choose a transport based on the environment:

*   **For Development: `PrettyConsoleTransport`**
    Multi-line, colored format optimized for human readability.

    *Example Output:*
    ```
    3:45:01 PM [INFO] (my-app): Request received.
    {
      "method": "GET",
      "url": "/users/1"
    }
    ```

*   **For Development: `ClassicConsoleTransport`**
    Single-line format, similar to log4j, with key-value metadata.

    *Example Output:*
    ```
    2023-10-27 15:45:01 INFO  [my-app] [method="GET" url="/users/1"] :: Request received.
    ```

*   **For Development: `CompactConsoleTransport`**
    An intermediate format that keeps the main message on one line and metadata on a second, indented line.

    *Example Output:*
    ```
    3:45:01 PM [INFO] (my-app): Request received.
      └─ method="GET" url="/users/1"
    ```

*   **For Production: `ConsoleTransport` (Default)**
    Single-line JSON format, colorless, with sanitization enabled by default. This is the ideal format for processing by log aggregation systems like Datadog, Splunk, or the ELK stack.

    *Example Output:*
    ```json
    {"level":"info","service":"my-app","msg":"Request received.","method":"GET","url":"/users/1","timestamp":"..."}
    ```

#### Transport Configuration

Simply instantiate the transport you need in the initial configuration:

```typescript
import { syntropyLog, PrettyConsoleTransport, ConsoleTransport } from 'syntropylog';

const isProduction = process.env.NODE_ENV === 'production';

syntropyLog.init({
  logger: {
    serviceName: 'my-service',
    level: isProduction ? 'info' : 'debug',
    // Choose the transport based on the environment
    transports: [
      isProduction ? new ConsoleTransport() : new PrettyConsoleTransport()
    ],
  },
  // ...
});
```

#### Custom Serializers

You can define functions to control how complex objects are represented in your logs, avoiding unnecessary or sensitive information.

```typescript
syntropyLog.init({
  logger: {
    // ...
    serializers: {
      // If a log has a 'user' property, this function will transform it
      user: (user) => `User(id=${user.id})`,
      req: (req) => `${req.method} ${req.url}`,
    },
    // A timeout is mandatory to prevent a faulty serializer
    // from degrading application performance.
    serializerTimeoutMs: 50,
  },
});

const logger = syntropyLog.getLogger('main');
logger.info({ user: { id: 123, name: 'John', password: '...' } }, 'Login attempt');
// Output: "... Login attempt" { "user": "User(id=123)" }
```
### 2. Context Management: Simplified Distributed Tracing

In distributed systems, tracing a request across multiple services is crucial. SyntropyLog automates this with a `ContextManager` that handles `correlationId` propagation.

#### How It Works

1.  **Context Creation**: At the start of an operation (e.g., an HTTP request), a new context is created using `contextManager.run()`.
2.  **ID Storage**: a unique `correlationId` is generated and stored in the context. The header name (`X-Correlation-ID` by default) is configured once.
3.  **Automatic Propagation**:
    *   **Logs**: Any log generated within the context will automatically include the `correlationId`.
    *   **HTTP Clients**: When making a request with an instrumented client, the `correlationId` is automatically added to the headers.
    *   **Message Brokers**: When publishing a message, the `correlationId` is injected into the message headers. The consumer, if also instrumented, will extract it and continue the context.

#### Usage Example

```typescript
import { syntropyLog } from 'syntropylog';
import { randomUUID } from 'node:crypto';

// The initial configuration defines the header name
syntropyLog.init({
  context: {
    correlationIdHeader: 'X-My-Trace-ID',
    // You can also customize the key used for the transaction ID
    transactionIdKey: 'my-custom-txn-id',
  },
  // ...
});

const contextManager = syntropyLog.getContextManager();
const logger = syntropyLog.getLogger('api-server');

async function handleRequest() {
  // Start a new context for this request
  await contextManager.run(async () => {
    const traceId = randomUUID();
    contextManager.set(contextManager.getCorrelationIdHeaderName(), traceId);

    logger.info('Processing request.');
    // Output: ... "X-My-Trace-ID": "..."

    // const apiClient = syntropyLog.getHttp('downstream-service');
    // await apiClient.request({ url: '/data' });
    // The request to 'downstream-service' will include the 'X-My-Trace-ID' header.

    // const broker = syntropyLog.getBroker('my-kafka-bus');
    // await broker.publish('user-events', { payload: ... });
    // The message in Kafka will include 'X-My-Trace-ID' in its headers.
  });
}

handleRequest();
```

### 3. Instrumentation: "Bring Your Own Client"

This is where SyntropyLog shines. Thanks to the adapter pattern, you can instrument any client library (HTTP, brokers, etc.) by implementing a simple interface. This gives you the freedom to use your favorite tools without waiting for official support.

#### HTTP Client Instrumentation

The following example demonstrates how to instrument four different HTTP clients—modern, native, and deprecated—with the same core logic, validating the power of the adapter pattern.

First, we define adapters for clients that don't have a pre-built one (`fetch` and `request`).

```typescript
// Adapters.ts
import type { IHttpClientAdapter, AdapterHttpRequest, AdapterHttpResponse } from 'syntropylog/http';
import fetch from 'node-fetch';
const requestLib = require('request');

// Adapter for node-fetch
class FetchAdapter implements IHttpClientAdapter {
  async request<T>(req: AdapterHttpRequest): Promise<AdapterHttpResponse<T>> {
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(req.body),
    });
    const data = (await response.json()) as T;
    return { statusCode: response.status, data, headers: response.headers.raw() };
  }
}

// Adapter for the legacy 'request' client
class RequestAdapter implements IHttpClientAdapter {
  request<T>(req: AdapterHttpRequest): Promise<AdapterHttpResponse<T>> {
    return new Promise((resolve, reject) => {
      requestLib({ uri: req.url, method: req.method, headers: req.headers, json: true, body: req.body }, 
        (error, response, body) => {
          if (error) return reject(error);
          if (response.statusCode >= 400) return reject(body);
          resolve({ statusCode: response.statusCode, data: body, headers: response.headers });
        }
      );
    });
  }
}

// Export our implementations
export { FetchAdapter, RequestAdapter };
```

Now, in our application logic, we configure and use them in a unified way.

```typescript
// main.ts
import { syntropyLog } from 'syntropylog';
import { AxiosAdapter } from '@syntropylog/axios-adapter';
import { FetchAdapter, RequestAdapter } from './Adapters'; // Our custom adapters
import { GotAdapter } from '@syntropylog/got-adapter'; // Another pre-built adapter

import axios from 'axios';
import got from 'got';

syntropyLog.init({
  // ...
  http: {
    instances: [
      {
        instanceName: 'axiosApi',
        adapter: new AxiosAdapter(axios.create({ baseURL: 'https://api.example.com' })),
      },
      {
        instanceName: 'gotApi',
        adapter: new GotAdapter(got.extend({ prefixUrl: 'https://api.example.com' })),
      },
      {
        instanceName: 'fetchApi',
        adapter: new FetchAdapter(), // Our fetch adapter
      },
      {
        instanceName: 'legacyApi',
        adapter: new RequestAdapter(), // Our 'request' adapter
      },
    ],
  },
});

const axiosClient = syntropyLog.getHttp('axiosApi');
const gotClient = syntropyLog.getHttp('gotApi');
const fetchClient = syntropyLog.getHttp('fetchApi');
const legacyClient = syntropyLog.getHttp('legacyApi');

// All clients use the same .request() API!
await axiosClient.request({ method: 'GET', url: '/users/1' });
await gotClient.request({ method: 'GET', url: '/products/123' });
await fetchClient.request({ method: 'GET', url: 'https://api.example.com/inventory/1' });
await legacyClient.request({ method: 'GET', url: 'https://api.example.com/legacy/data' });
```

#### Message Broker Instrumentation (Kafka)

Context propagation is even more critical in asynchronous systems. SyntropyLog maintains the `correlationId` across messaging systems like Kafka, enabling seamless end-to-end tracing.

The adapter architecture applies here as well. The best practice is to define and create your adapter in a separate file to keep your code clean.

```typescript
// kafka-client.ts
import { Kafka } from 'kafkajs';
import { KafkaJsAdapter } from '@syntropylog/kafka-adapter';

// 1. Create your Kafka client as you normally would.
const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:9092'],
});

// 2. Create a single instance of the adapter.
const myKafkaBusAdapter = new KafkaJsAdapter(kafka);

// 3. Export the instance to be used in your application.
export { myKafkaBusAdapter };
```

Then, in your main application, simply import and configure the adapter.

```typescript
// main.ts
import { syntropyLog } from 'syntropylog';
import { myKafkaBusAdapter } from './kafka-client'; // Import the ready-to-use instance
import { randomUUID } from 'node:crypto';

syntropyLog.init({
  // ...
  brokers: {
    instances: [
      {
        instanceName: 'my-kafka-bus',
        adapter: myKafkaBusAdapter, // Inject the adapter
      },
    ],
  },
});

const broker = syntropyLog.getBroker('my-kafka-bus');
const contextManager = syntropyLog.getContextManager();

await broker.connect();

// The consumer will automatically extract the correlationId from the message.
await broker.subscribe('user-events', async (message, controls) => {
  const logger = syntropyLog.getLogger('consumer');
  logger.info({ payload: message.payload.toString() }, 'Message processed.');
  await controls.ack();
});

// The producer will automatically inject the correlationId into the message.
await contextManager.run(async () => {
  contextManager.set('X-Correlation-ID', randomUUID());
  const logger = syntropyLog.getLogger('producer');
  logger.info('Publishing message...');
  await broker.publish('user-events', { payload: Buffer.from('Hello World') });
});
```

#### Message Broker Instrumentation (RabbitMQ)

The same principle applies to RabbitMQ. The following is a more advanced example demonstrating a "fanout" pattern, where a single message is consumed by multiple services (in this case, an audit service and a notification service).

First, we create our adapter for `amqplib`.

```typescript
// rabbitmq-adapter.ts
import amqp from 'amqplib';
import { AmqpLibAdapter } from '@syntropylog/amqplib-adapter';

// A factory function is an excellent way to encapsulate creation.
export async function createRabbitMQAdapter() {
  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();
  return new AmqpLibAdapter(connection, channel);
}
```

Then, we orchestrate it in the main logic.

```typescript
// main.ts
import { syntropyLog, MessageHandler } from 'syntropylog';
import { createRabbitMQAdapter } from './rabbitmq-adapter';

// --- Handlers for each consumer ---
const auditServiceHandler: MessageHandler = async (msg, controls) => {
  syntropyLog.getLogger('audit-service').info({ data: msg.payload.toString() }, 'Event audited.');
  await controls.ack();
};

const notificationServiceHandler: MessageHandler = async (msg, controls) => {
  syntropyLog.getLogger('notification-service').info({ data: msg.payload.toString() }, 'Notification sent.');
  await controls.ack();
};

// --- Orchestration ---
async function main() {
  syntropyLog.init({
    // ...
    brokers: {
      instances: [{
        instanceName: 'rabbit-main',
        adapter: await createRabbitMQAdapter(),
      }],
    },
  });

  const rabbitBroker = syntropyLog.getBroker('rabbit-main');
  
  // In a real app, configuring exchanges and queues
  // might be in an initialization script.
  const exchangeName = 'user-events-exchange';
  await rabbitBroker.assertExchange(exchangeName, 'fanout');
  await rabbitBroker.assertQueue('audit-queue');
  await rabbitBroker.assertQueue('notification-queue');
  await rabbitBroker.bindQueue('audit-queue', exchangeName, '');
  await rabbitBroker.bindQueue('notification-queue', exchangeName, '');

  // Subscribe each worker to its queue
  await rabbitBroker.subscribe('audit-queue', auditServiceHandler);
  await rabbitBroker.subscribe('notification-queue', notificationServiceHandler);

  // Publish a single event to the exchange
  const eventPayload = { userId: 'user-123', action: 'login' };
  await rabbitBroker.publish(exchangeName, '', { // The routing key is ignored in fanout
    payload: Buffer.from(JSON.stringify(eventPayload)),
  });
}

main();
```

#### Caching Instrumentation (Redis)

The same philosophy applies to caching clients like Redis. The `BeaconRedis` is a facade over `node-redis` that automatically integrates with the logging and context system.

A common use case is the "Cache-Aside" pattern. The following example shows an API service that uses Redis to cache `GET` request results and invalidate the cache on `POST`, `PUT`, or `DELETE`.

First, we configure the Redis instance in `syntropyLog`.

```typescript
// main.ts
syntropyLog.init({
  // ...
  redis: {
    instances: [
      {
        instanceName: 'my-cache',
        mode: 'single',
        url: 'redis://localhost:6379',
        logging: {
          // Log commands and their results for debugging
          logCommandValues: true,
          logReturnValue: true,
        },
      },
    ],
  },
});
```

Then, we create a service class that uses the instrumented Redis client.

```typescript
// CachedApiService.ts
import { syntropyLog, IBeaconRedis, InstrumentedHttpClient } from 'syntropylog';

class CachedApiService {
  private httpClient: InstrumentedHttpClient;
  private redisClient: IBeaconRedis;

  constructor(httpInstanceName: string, redisInstanceName: string) {
    this.httpClient = syntropyLog.getHttp(httpInstanceName);
    this.redisClient = syntropyLog.getRedis(redisInstanceName);
  }

  private generateCacheKey(url: string): string {
    return `api-cache:${url}`;
  }

  public async get<T>(url: string): Promise<T> {
    const cacheKey = this.generateCacheKey(url);

    // 1. Try to get the data from the cache
    const cachedData = await this.redisClient.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData) as T;
    }

    // 2. If not in cache, call the API
    const response = await this.httpClient.request<T>({ method: 'GET', url });
    const apiData = response.data;

    // 3. Store the result in cache for future requests
    await this.redisClient.set(cacheKey, JSON.stringify(apiData), 3600); // Expires in 1 hour

    return apiData;
  }

  public async post<T>(url: string, body: any): Promise<T> {
    const response = await this.httpClient.request<T>({ method: 'POST', url, body });
    // Invalidate the cache associated with this URL
    await this.redisClient.del(this.generateCacheKey(url));
    return response.data;
  }
}
```

---

## 🚀 Advanced Topics

### 1. Testing: Robust Unit and Integration Tests

SyntropyLog is designed to be testable. It provides tools to isolate your business logic and verify interactions with the framework.

#### Testing Logs with `SpyTransport`

The `SpyTransport` is a special transport that captures logs in memory instead of printing them. This allows you to make assertions about the logs your application generates.

```typescript
import { syntropyLog, SpyTransport } from 'syntropylog';
import { describe, it, expect, beforeEach } from 'vitest';

describe('MyService', () => {
  let spyTransport: SpyTransport;

  beforeEach(() => {
    spyTransport = new SpyTransport();
    syntropyLog.init({
      logger: {
        serviceName: 'test-service',
        transports: [spyTransport], // Use the spy instead of a console transport
      },
    });
  });

  it('should log a warning message if the user is inactive', () => {
    const myService = new MyService();
    myService.performAction({ user: { active: false } });

    // Search through the captured logs
    const warnLog = spyTransport.findLog((log) => log.level === 'warn');

    expect(warnLog).toBeDefined();
    expect(warnLog?.msg).toContain('Action attempt by inactive user');
  });
});
```

#### Mocking Redis with `BeaconRedisMock`

To test logic that interacts with Redis, you can use `BeaconRedisMock`. It's a high-fidelity in-memory mock that implements the `IBeaconRedis` interface, allowing you to simulate any Redis behavior without a real connection.

The following example tests a `UserService` that uses the "Cache-Aside" pattern.

```typescript
// UserService.ts
import { IBeaconRedis } from 'syntropylog';
class UserService {
  constructor(private redis: IBeaconRedis) {}
  async getUserById(id: string) {
    const cacheKey = `user:${id}`;
    const cachedUser = await this.redis.get(cacheKey);
    if (cachedUser) return JSON.parse(cachedUser);

    const dbUser = { id, name: 'John Doe' }; // Simulate DB call
    await this.redis.set(cacheKey, JSON.stringify(dbUser), 3600);
    return dbUser;
  }
}

// UserService.test.ts
import { BeaconRedisMock } from 'syntropylog/testing';
import { describe, it, expect, beforeEach } from 'vitest';

describe('UserService', () => {
  let mockRedis: BeaconRedisMock;
  let userService: UserService;

  beforeEach(() => {
    mockRedis = new BeaconRedisMock();
    userService = new UserService(mockRedis);
  });

  it('should return a user from cache if it exists (cache hit)', async () => {
    const user = { id: '123', name: 'Cached Jane' };
    mockRedis.get.mockResolvedValue(JSON.stringify(user)); // Configure the mock

    const result = await userService.getUserById('123');

    expect(result).toEqual(user);
    expect(mockRedis.get).toHaveBeenCalledWith('user:123');
    expect(mockRedis.set).not.toHaveBeenCalled(); // set should not be called on a hit
  });

  it('should fetch the user from "DB" and cache it if it does not exist (cache miss)', async () => {
    mockRedis.get.mockResolvedValue(null); // Simulate a cache miss

    const result = await userService.getUserById('456');

    expect(result.name).toBe('John Doe');
    expect(mockRedis.get).toHaveBeenCalledWith('user:456');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'user:456',
      expect.any(String),
      3600
    );
  });
});
```

### 2. The CLI: Your Configuration Guardian

SyntropyLog includes a command-line tool, `syntropylog`, to validate your configurations and ensure the quality of your observability.

*   **`syntropylog doctor <file>`**: Analyzes a single configuration file for quick feedback during development.
*   **`syntropylog audit`**: Runs a full audit plan against multiple configurations (staging, production), perfect for CI/CD pipelines. If any rule fails, the process exits with an error code, stopping a faulty deployment.

You can use `npx syntropylog init --rules --audit` to generate the initial configuration manifests in your project.

### 3. Secure Processing Pipeline

Every log you generate passes through a robust and secure pipeline before reaching its final destination.

*   **1. Intelligent Serialization**: Transforms complex objects (like `Error`) into safe JSON representations. You can **inject your own serializers** for custom data types. To prevent a faulty serializer from impacting performance, the `serializerTimeoutMs` setting is **mandatory by design**.

*   **2. Advanced Masking**: The `MaskingEngine` obfuscates sensitive data based on rules that support both strings and `RegExp`. It can even **sanitize sensitive parameters within URLs** in your logs.

*   **3. Final Sanitization**: As a final layer of defense, production-oriented transports (like the default `ConsoleTransport`) use a `SanitizationEngine` to strip malicious characters (e.g., ANSI escape codes) and prevent log injection attacks.

---

## 🗺️ Instrumentation Roadmap

The framework is designed to grow. The adapter architecture will be extended to support more messaging and cloud services.

*   **[x] Kafka** (`kafkajs`)
*   **[x] RabbitMQ** (`amqplib`)
*   **[ ] NATS** (`nats.js`)
*   **[ ] Google Cloud Pub/Sub**
*   **[ ] Amazon SQS / Kinesis**
*   **[ ] Azure Service Bus & Event Hubs**

---

## 🙌 Contributing

Contributions are welcome! Please feel free to submit a pull request or open an issue.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
