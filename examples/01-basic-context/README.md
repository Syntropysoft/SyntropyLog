# SyntropyLog Example: Context & Custom Transports

This example demonstrates the core features of `syntropyLog`, including automatic context propagation and the flexibility of its transport system.

It includes five different entry points, each showcasing a different way to format and output logs.

## Prerequisites

Before running this example, you must first build the main `syntropylog` library from the project's root directory:

```bash
# From the project root
npm run build
```

This step ensures that the local `syntropylog` dependency used by this example is up-to-date. After building, you can proceed with installing the example's dependencies.

## How to Run

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Run the different examples:**

    Each file uses a different console transport, demonstrating the variety of built-in formatters.

    * **For a rich, detailed, multi-line output (great for deep inspection):**
        ```bash
        npm start
        # or
        node index.js
        ```

    * **For a classic, single-line, text-based format (Log4j style):**
        ```bash
        node index2.js
        ```

    * **For a compact, developer-friendly, single-line metadata format:**
        ```bash
        node index3.js
        ```
    
    * **To see a custom file transport in action:**
        ```bash
        node index4.js
        ```

    * **For production-ready, raw JSON output:**
        ```bash
        node index5.js
        ```

## Understanding the Examples

### `index.js`: The `PrettyConsoleTransport`

This is the most verbose, human-readable transport. It's designed for development when you need to see the full structure of your log objects clearly.

**Expected Output:**
```
17:30:00 [DEBUG] (redis-manager): No Redis configuration was provided...
{
  "context": {}
}
17:30:00 [INFO] (syntropylog-main): SyntropyLog framework initialized successfully.
{
  "context": {}
}
--- Starting operation with Correlation ID: ... ---
17:30:00 [INFO] (order-service): Processing order...
{
  "context": {
    "x-correlation-id": "..."
  }
}
```

### `index2.js`: The `ClassicConsoleTransport`

This transport mimics traditional logging frameworks like Log4j or Serilog. It's dense, text-based, and puts all information on a single line, which is excellent for quick scanning and text-based searching.

**Expected Output:**
```
2025-07-07 17:31:00 INFO  [syntropylog-main] [context={}] :: SyntropyLog framework initialized successfully.
--- Starting operation with Correlation ID: ... ---
2025-07-07 17:31:00 INFO  [order-service] [context={"x-correlation-id":"..."}] :: Processing order...
2025-07-07 17:31:00 INFO  [inventory-service] [context={"x-correlation-id":"..."}] :: Checking inventory for the order.
```

### `index3.js`: The `CompactConsoleTransport`

This is a balanced transport, providing colored, readable output for the main message, but condensing all metadata into a single, subtle line. It's a great default for daily development.

**Expected Output:**
```
17:32:00 [INFO] (syntropylog-main): SyntropyLog framework initialized successfully.
  └─ context={}
--- Starting operation with Correlation ID: ... ---
17:32:00 [INFO] (order-service): Processing order...
  └─ context={"x-correlation-id":"..."}
```

### `index5.js`: The `ConsoleTransport` (Production Output)

This is the most fundamental transport. It outputs **raw, uncolored JSON strings**. This format is not designed for human eyes but for machines. It's the ideal choice for production environments where logs are collected by agents (like Fluentd, Vector, or Datadog Agent) that expect structured, parsable JSON.

**Expected Output:**
```json
{"level":"info","msg":"SyntropyLog framework initialized successfully.","context":{},"timestamp":"...","service":"my-awesome-app"}
--- Starting operation with Correlation ID: ... ---
{"level":"info","msg":"Processing order...","context":{"X-Correlation-ID":"..."},"timestamp":"...","service":"my-awesome-app"}
{"level":"info","msg":"Checking inventory for the order.","context":{"X-Correlation-ID":"..."},"timestamp":"...","service":"my-awesome-app"}
--- Operation finished. Context is now empty. ---
{"level":"info","msg":"This log is outside the context and will not have a correlationId.","context":{},"timestamp":"...","service":"my-awesome-app"}
```

---

## Creating Your Own Transport (`index4.js`)

SyntropyLog is designed to be extensible. Creating a custom transport is incredibly simple. All you need to do is extend the base `Transport` class and implement the `async log(entry)` method.

This example demonstrates a `CustomFileTransport` that writes every log as a JSON line to an `app.log` file.

#### 1. The Custom Transport Code

```javascript
import { Transport } from 'syntropylog';
import fs from 'fs';

class CustomFileTransport extends Transport {
  async log(entry) {
    const logString = JSON.stringify(entry) + '\\n';
    fs.appendFile('app.log', logString, (err) => {
      if (err) console.error('Failed to write to log file', err);
    });
  }
}
```

#### 2. Using the Custom Transport

You simply instantiate your new class and pass it to the `transports` array in the `init` configuration.

```javascript
// In index4.js
await syntropyLog.init({
  logger: {
    // ...
    transports: [new CustomFileTransport()],
  },
  // ...
});
```

After running `node index4.js`, you can inspect the `app.log` file to see the raw JSON output, proving that your custom transport is working perfectly.
