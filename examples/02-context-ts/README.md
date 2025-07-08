# ContextManager and Minimum Configuration Example

This example demonstrates the core usage of the asynchronous `ContextManager` to propagate information like correlation IDs through your application. It also showcases a minimal, valid configuration for the `syntropyLog` library.

The script initializes the logger, creates an isolated asynchronous context, and shows how log entries created within that context automatically inherit the stored values.

---
## Key Concepts Demonstrated

* **Initialization**: How to perform the initial setup of `syntropyLog` with a minimal configuration object.
* **Async Context**: Using `contextManager.run()` to create an isolated execution context.
* **Context Propagation**: Setting a value (a correlation ID) in the context at a high level and retrieving it in a deeply nested function without passing it as an argument.
* **Automatic Logging**: Observing how the logger automatically captures and includes any data from the current context in the final log entry.

---
## Running the Example

1.  **Install dependencies:**
    ```
    npm install
    ```

2.  **Run the example:**
    ```
    npm start
    ```

---
## Minimal Configuration

The `syntropyLog.init()` call in `index.ts` represents a minimal yet functional configuration required to run the library.

```
syntropyLog.init({
  context: {
    correlationIdHeader: 'x-trace-id', // Use a custom header name for the correlation ID
  },
  logger: {
    level: 'info',
    serviceName: 'example-2',
    serializerTimeoutMs: 100
  },
});
```

---
## Important: The `serializerTimeoutMs` Requirement

A critical part of this minimal configuration is the **`logger.serializerTimeoutMs`** property.

The library's configuration validation requires this field to be a positive, non-zero number. **If you set `serializerTimeoutMs` to `0` or use an invalid value, the `syntropyLog.init()` call will fail and throw a `ZodError`**, preventing the application from starting. This is a deliberate "fail-fast" design choice to ensure the logging pipeline remains performant and does not get blocked by a malfunctioning serializer.

---

---
## The First Tuning Knob: Understanding `serializerTimeoutMs`

It's easy to see `logger.serializerTimeoutMs` as just another required field. The challenge is to see it differently: **it's the primary tuning knob the framework gives you to balance application performance against the richness of your logs.**

A slow or malfunctioning serializer (whether it's custom-injected or a built-in one processing unexpected data) can block your application, impacting responsiveness. The timeout acts as a **circuit breaker** to prevent this.

This introduces a conscious trade-off that is fundamental to the framework's design:

* **A short timeout** (like the 50ms default) prioritizes **application stability**. It ensures the logger never hangs, but might result in complex objects being marked as `[SERIALIZER_ERROR]` in your logs if they take too long to process.

* **A longer timeout** (like the `100` in this example) prioritizes **log fidelity**. It gives you a better chance of successfully logging large, complex objects, but requires you, the developer, to accept the small risk of a longer potential delay in the logging pipeline.

This leads to a model of shared responsibility:
* **The Framework's Job**: To provide a safe, performant pipeline with a protective timeout mechanism.
* **The Developer's Job**: To understand their data and adjust this timeout to a value that fits their specific needs.

This balance is so critical that the framework enforces it: **setting `serializerTimeoutMs` to `0` or an invalid value will cause `syntropyLog.init()` to fail**, protecting your application from an unsafe configuration from the very start.

## Expected Output

When you run the script, you will see how the logger automatically includes the `context` object (containing the `x-trace-id`) for logs made inside the `contextManager.run()` block. Logs created outside this block will not have this context, demonstrating the isolation.

```console
npm run start

> 02-express@1.0.0 start
> tsx src/index.ts

--- OPERATION START ---
--------------------------------------------------------------------------------
>> [Main Operation] Context created. ID: 0aa90098-43c6-4645-86c8-a755d3c57315  (via console.log)
--------------------------------------------------------------------------------
--------------------------------------------------------------------------------
  -> Entering "doSomethingImportant" function...
     [doSomethingImportant] ID retrieved from context: 0aa90098-43c6-4645-86c8-a755d3c57315
     [doSomethingImportant] Performing asynchronous work...
{"context":{},"timestamp":"2025-07-08T19:18:34.695Z","level":"info","service":"syntropylog-main","msg":"SyntropyLog framework initialized successfully."}
{"context":{"x-trace-id":"0aa90098-43c6-4645-86c8-a755d3c57315"},"timestamp":"2025-07-08T19:18:34.697Z","level":"info","service":"main-executeOperation","msg":">> [Main Operation] Context created. ID: 0aa90098-43c6-4645-86c8-a755d3c57315 { note: 'via syntropyLog logger.info' }"}
  <- Exiting "doSomethingImportant".
--- CONTEXT END (Duration: 53.10ms) ---
{"context":{"x-trace-id":"0aa90098-43c6-4645-86c8-a755d3c57315"},"timestamp":"2025-07-08T19:18:34.747Z","level":"info","service":"main-executeOperation","msg":"Operation within context finished. { duration_ms: 53.10008300000004 }"}
--- OPERATION END ---
--------------------------------------------------------------------------------
--------------------------------------------------------------------------------
{"context":{},"timestamp":"2025-07-08T19:18:34.747Z","level":"info","service":"main-executeOperation","msg":"Outside the context, the ID is: undefined. { note: 'via syntropyLog logger.info' }"}
```