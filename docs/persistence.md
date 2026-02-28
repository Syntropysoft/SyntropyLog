# Universal Persistence (Storage Agnostic)

Starting from v0.8.x, SyntropyLog includes a powerful way to persist logs to any destination without external dependencies. By using `UniversalAdapter` and `UniversalLogFormatter`, you can map your logs to any schema using JSON and provide an execution function.

## 🎯 The Concept

Instead of writing a complex class for every database, you provide:
1.  **A Formatter**: Maps the log object to your desired schema.
2.  **An Executor**: A simple function that takes the formatted data and saves it.

---

## 🚀 Examples

### **1. Capture Logs in Memory (for Debugging)**
```typescript
import { UniversalAdapter, syntropyLog } from 'syntropylog';

const adapter = new UniversalAdapter({
  executor: (data) => console.log('Captured by Adapter:', data)
});

// Use it in your configuration
await syntropyLog.init({
  logger: {
    transports: [ new AdapterTransport({ adapter }) ]
  }
});
```

### **2. Persisting to MongoDB (Object-based)**
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

### **3. Generic SQL (Postgres/MySQL)**
```typescript
const sqlAdapter = new UniversalAdapter({
  // The executor receives the result of the formatter
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

## 🛡️ Why use Universal Adapters?

- **Storage Agnostic**: Move from SQL to NoSQL without changing your application code.
- **Zero Dependencies**: You don't need `syntropylog-mongodb-adapter`—just use your existing database client.
- **Pure JSON Mapping**: Define your schema in configuration, not in code.
