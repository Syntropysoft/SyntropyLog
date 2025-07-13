<p align="center">
  <img src="https://raw.githubusercontent.com/Syntropyc/syntropylog/main/assets/sintropic-soft-1.png" alt="SyntropyLog Logo" width="170"/>
</p>

<h1 align="center">SyntropyLog</h1>

<p align="center">
  <strong>An Observability Framework for Node.js: Resilient, Secure, and Extensible by Design.</strong>
</p>

<p align="center">
  <a href="https://github.com/Sintropyc/syntropylog/actions/workflows/ci.yml"><img src="https://github.com/Sintropyc/syntropylog/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  <a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
  <a href="https://github.com/Sintropyc/syntropylog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
</p>

**SyntropyLog** is a declarative and agnostic observability framework for Node.js, built for high-demand production systems. Its architecture focuses on three pillars: **developer freedom, security by default, and resilience against failure.**

**Requirements**: Node.js >= 18

---

## 🚀 Key Features

*   🔌 **Agnostic Instrumentation**: Unified interfaces for HTTP clients and Message Brokers. The framework adapts to your tools, not the other way around.
*   🔒 **Secure by Default**: A robust pipeline with **serialization, masking, and sanitization** to protect sensitive data and prevent log injection.
*   💪 **Resilient by Design**: If a client (e.g., HTTP) fails, the app doesn't crash. A placeholder is injected that fails gracefully only when used.
*   🕊️ **Zero Production Dependencies**: The core library has no production dependencies.
*   🔗 **Automatic Context Propagation**: Transparently propagate a `correlationId` across HTTP clients and message brokers for complete distributed tracing.
*   🛠️ **Intelligent CLI**: Validate your configurations with `syntropylog doctor` to prevent errors before deployment.
*   🧪 **Highly Testable**: Includes high-fidelity mocks (`BeaconRedisMock`) and spy transports (`SpyTransport`) to facilitate robust testing.
*   🎨 **Flexible Logging**: Multiple transports, from production-optimized JSON to colorful, human-readable formats for development.

---

## 📦 Installation

Install the main package using your preferred package manager:

```bash
# With npm
npm install syntropylog

# With yarn
yarn add syntropylog
```

To use a built-in adapter, like the one for `axios`, you only need to install the client library itself.

```bash
# With npm
npm install axios

# With yarn
yarn add axios
```

---

## ⚡ Quick Start

This example shows how to initialize the logger and make an instrumented HTTP request.

```typescript
import { syntropyLog, PrettyConsoleTransport, AxiosAdapter } from 'syntropylog';
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
        // Inject an adapter instance for your chosen HTTP client.
        adapter: new AxiosAdapter(axios.create({ baseURL: 'https://api.example.com' })),
      },
    ],
  },
});

// 2. Get the instrumented client wherever you need it.
const apiClient = syntropyLog.getHttp('myApi');

// 3. Use the unified API.
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

## 📂 Learn by Example

The best way to learn SyntropyLog is to see it in action. We have a comprehensive collection of examples in the `/examples` directory of this repository.

Each example is a self-contained project that demonstrates a specific feature, from basic context propagation to building custom adapters.

**[➡️ Explore the Examples](./examples/README.md)**

---

## 🏛️ Key Concepts

### 1. Logging: Flexible and Environment-Oriented

The logging system is designed to be powerful and adaptable. Its main component is **Transports**, which decide the format and destination of your logs.

#### Console Transports

You can choose a transport based on the environment:

*   **For Development**: `PrettyConsoleTransport`, `ClassicConsoleTransport`, or `CompactConsoleTransport` for human-readable, colored output.
*   **For Production**: `ConsoleTransport` (the default), which outputs single-line JSON, perfect for log aggregators like Datadog or Splunk.

#### Custom Serializers

Define functions to control how complex objects are logged, allowing you to redact sensitive data or simplify large objects.

```typescript
syntropyLog.init({
  logger: {
    // ...
    serializers: {
      // If a log has a 'user' property, this function transforms it.
      user: (user) => `User(id=${user.id})`,
    },
    // A timeout is mandatory to prevent a faulty serializer from
    // impacting application performance.
    serializerTimeoutMs: 50,
  },
});
```
For a detailed guide, see the **[Custom Serializers Example](./examples/100-custom-serializers/README.md)**.

### 3. Data Masking: Secure by Default

In regulated environments like finance or healthcare, preventing sensitive data from appearing in logs is not optional—it's a requirement. SyntropyLog includes a powerful, configurable **Masking Engine** that makes it easy to stay compliant.

Its philosophy is **secure by default**: all masking uses a fixed-length replacement to avoid leaking metadata like the length of a secret. This can be changed for environments where usability is preferred over maximum security.

#### How It Works
The engine recursively scans your log objects and automatically masks values based on several rules:

*   **Masking by Field Name**: You don't need to specify the full path to a field. Just provide the key name (e.g., `"password"`), and the engine will find and mask it at any nesting level.
*   **Path & URL Masking**: The engine also detects sensitive keywords in URL paths. If a path segment matches a sensitive field (e.g., `.../password/...`), the **following segment** is automatically masked. This prevents leaking secrets in URLs.
*   **Configurable Masking Style**: You can choose how the data is masked:
    *   `style: 'fixed'` (Default): Replaces data with a fixed-length string (e.g., `******`). This is the most secure option as it does not leak the length of the original data.
    *   `style: 'preserve-length'`: Replaces data with a mask of the same length as the original value (e.g., a 16-digit credit card becomes `****************`).

```typescript
// Example: Masking with length preservation
syntropyLog.init({
  logger: {
    // ...
  },
  masking: {
    fields: ['creditCardNumber', 'apiToken', 'ssn'],
    // New: choose the masking style
    style: 'preserve-length',
    // The character to use for masking
    maskChar: '*'
  }
});

const logger = syntropyLog.getLogger('default');

// This will be masked preserving its length
logger.info({
  transaction: {
    details: {
      creditCardNumber: '1234-5678-9012-3456' // 19 chars
    }
  }
});
// Output: "creditCardNumber": "*******************"

// Path masking also respects the style
logger.info({ 
  requestPath: '/api/v1/users/ssn/123-45-678/profile' 
});
// Output: "requestPath": "/api/v1/users/ssn/***********/profile"
```

For advanced use cases, the masking configuration can be **updated at runtime** to add new fields without restarting the application, ensuring that rules can only be strengthened, never weakened.

For more details, see the **[Data Masking Example](./examples/30-data-masking/README.md)**.

### 4. Context Management: Simplified Distributed Tracing

SyntropyLog automates distributed tracing by propagating a `correlationId` across asynchronous operations and network calls.

#### How It Works

1.  **Context Creation**: At the start of an operation (e.g., an incoming HTTP request), a new context is created.
2.  **ID Storage**: A unique `correlationId` is stored in the context.
3.  **Automatic Propagation**:
    *   **Logs**: Any log generated within the context automatically includes the `correlationId`.
    *   **HTTP Clients**: When using an instrumented client, the `correlationId` is automatically added to outgoing request headers.
    *   **Message Brokers**: The `correlationId` is injected into published messages and extracted by consumers.

For a practical demonstration, see the **[Basic HTTP Correlation Example](./examples/40-basic-http-correlation/README.md)**.

### 3. Instrumentation: The Adapter Pattern

Instead of being tied to specific libraries, SyntropyLog uses **Adapters**. You provide a simple adapter to make any library speak the framework's language. This gives you the freedom to use any client version or even switch clients without rewriting your instrumentation logic.

To learn how to build your own, check out the **[Custom HTTP Adapter Example](./examples/45-custom-http-adapter/README.md)**.
