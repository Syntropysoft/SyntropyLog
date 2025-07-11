<p align="center">
<img src="./assets/beaconLog-2.png" alt="SyntropyLog Logo" width="150"/>
</p>
<h1 align="center">SyntropyLog</h1>
<p align="center">
<strong>Observability, Compliance, and Resilience—By Design.</strong>
</p>

<p align="center">
<!-- Badges will be active once CI is set up -->
<a href="https://github.com/Syntropysoft/syntropylog/actions"><img src="https://github.com/Syntropysoft/syntropylog/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
<a href="https://www.npmjs.com/package/syntropylog"><img src="https://img.shields.io/npm/v/syntropylog.svg" alt="NPM Version"></a>
<a href="https://github.com/Syntropysoft/syntropylog/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/syntropylog.svg" alt="License"></a>
</p>

SyntropyLog is a unified and declarative observability framework for Node.js, designed to maximize developer productivity, ensure data security, and provide production-grade resilience out of the box. It empowers you to instrument HTTP clients and Message Brokers in a completely agnostic way, freeing you from dependency lock-in.

Requirements: Node.js >= 18
✨ Core Philosophy: The Adapter Pattern
SyntropyLog is built on a simple but powerful idea: dependency inversion. Instead of being tightly coupled to specific libraries like axios or kafkajs, the framework defines a universal "contract" (an interface). You can then use or create a simple Adapter to make any library speak the framework's language.

This gives you unprecedented freedom:

Use Any Version: Instrument axios@0.9 or axios@2.0 with the same code.

Use Any Client: Instrument axios, got, fetch, or even a deprecated client like request using the same unified API.

Future-Proof: When a new HTTP client or message broker is released, you don't have to wait for us. Just write a simple adapter, and it works.

```typescript
import { syntropyLog, ClassicConsoleTransport } from 'syntropylog';
import { AxiosAdapter } from 'syntropylog/http'; // Import our official adapter
import axios from 'axios';

// 1. Configure and initialize SyntropyLog once.
//    Instead of a 'type', you inject an 'adapter' instance.
syntropyLog.init({
logger: {
level: 'info',
serviceName: 'my-app',
transports: [new ClassicConsoleTransport()],
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

// 2. Get the instrumented client.
const apiClient = syntropyLog.getHttp('myApi');

// 3. Use the unified API. It's always .request().
await apiClient.request({
method: 'GET',
url: '/users/1',
});
```

🚀 Quick Start: The "Bring Your Own Client" Example
This example demonstrates how to instrument four different HTTP clients—modern, native, and even deprecated—with the same core logic.

1. Installation
```bash

Install the core framework
npm install syntropylog

Install the HTTP clients you want to use
npm install axios got node-fetch request
```

2. The Code (index.ts)
```typescript
import { syntropyLog, ClassicConsoleTransport } from 'syntropylog';
import {
IHttpClientAdapter,
AdapterHttpRequest,
AdapterHttpResponse,
AxiosAdapter, // Our official adapter for Axios
} from 'syntropylog/http';

// Import the clients you want to adapt
import axios from 'axios';
import got, { Got } from 'got';
import fetch from 'node-fetch';
import requestLib = require('request');

// --- Create Your Adapters ---

// An adapter for the native Fetch API (using node-fetch)
class FetchAdapter implements IHttpClientAdapter {
async request(req: AdapterHttpRequest) {
const res = await fetch(req.url, { /* ... / });
// ...translation logic...
return { / ... */ };
}
}

// An adapter for the 'got' library
class GotAdapter implements IHttpClientAdapter {
// ...implementation...
}

// An adapter for the deprecated, callback-based 'request' library
class RequestAdapter implements IHttpClientAdapter {
// ...implementation...
}

// --- Initialize SyntropyLog ---

syntropyLog.init({
logger: { /* ... */ },
context: { correlationIdHeader: 'X-Correlation-ID' },
http: {
instances: [
{ instanceName: 'axiosApi', adapter: new AxiosAdapter(axios.create()) },
{ instanceName: 'gotApi', adapter: new GotAdapter(got) },
{ instanceName: 'fetchApi', adapter: new FetchAdapter() },
{ instanceName: 'legacyApi', adapter: new RequestAdapter() },
],
},
});

// --- Use the Clients ---

const axiosClient = syntropyLog.getHttp('axiosApi');
const gotClient = syntropyLog.getHttp('gotApi');
const fetchClient = syntropyLog.getHttp('fetchApi');
const legacyClient = syntropyLog.getHttp('legacyApi');

// All clients are used with the same, unified API!
await axiosClient.request({ method: 'GET', url: '...' });
await gotClient.request({ method: 'GET', url: '...' });
await fetchClient.request({ method: 'GET', url: '...' });
await legacyClient.request({ method: 'GET', url: '...' });
```

🏛️ Architecture and Data Flow
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
├─► 1. Serialization (Transforms complex objects, with timeouts)
│
├─► 2. Masking (Masks sensitive data from global config)
│
├─► 3. Final LogEntry Assembly (Adds timestamp, level, etc.)
│
▼
┌───────────────────────┐
│      Dispatcher       │
└───────────────────────┘
│
├──────────────────► Transport A (e.g., Console)
│
└──────────────────► Transport B (e.g., File)
```

🩺 The Doctor & Auditor CLI
SyntropyLog includes a powerful command-line tool, syntropylog, to validate your configuration files, enforce best practices, and prevent deployment errors.

syntropylog doctor <file>: Analyzes a single config file for quick feedback.

syntropylog audit: Runs a full audit plan against multiple environment configs, perfect for CI/CD pipelines. If any rule fails, it exits with a non-zero code, failing the build.

Use npx syntropylog init --rules --audit to generate starter manifests.

🗺️ Instrumentation Roadmap
The adapter-based architecture is being extended to support asynchronous communication.

Phase 1: The Pillars of Messaging
[x] Kafka (kafkajs)

[ ] RabbitMQ (amqplib)

[ ] NATS (nats.js)

Phase 2: The Cloud Giants
[ ] Google Cloud Pub/Sub

[ ] Amazon SQS / Kinesis

[ ] Azure Service Bus & Event Hubs

For more details on the API, advanced configuration, and creating your own adapters, please refer to the full documentation (coming soon).