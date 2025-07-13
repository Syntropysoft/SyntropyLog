# Example 01: Basic Context and Correlation

Welcome to the next step in your SyntropyLog journey! This example demonstrates one of the most powerful features of the framework: **automatic context propagation**.

## The "Why"

In a modern application, a single request can trigger a chain of function calls. To debug effectively, you need to be able to trace that entire chain. The old way was to manually pass a request ID or `correlationId` through every function. This is tedious, error-prone, and clutters your code.

SyntropyLog solves this by using Node.js's `AsyncLocalStorage`. You create a "context" for a specific operation (like an incoming HTTP request), and any logs made within that operation's lifecycle will automatically be tagged with the context's data, no matter how deep the function calls go.

It’s like putting a magical, invisible backpack on a request, and every function it visits can drop a note inside without having to explicitly pass the backpack around.

## Purpose

The goal of this example is to show how to:

1.  Initialize `syntropyLog`.
2.  Use `logger.runWith` to create a new asynchronous context.
3.  Observe how logs from different, nested "services" all share the same `correlationId` automatically.

## How to Run

1.  **Install Dependencies**:
    First, ensure the main library is built (run `npm run build` from the project root if you haven't). Then, from the `examples/01-basic-context` directory, run:
    ```bash
    npm install
    ```

2.  **Run the Script**:
    ```bash
    node index.js
    ```

## Expected Output

Notice in the output below how the `correlationId` is the same for both the "order-service" and the "inventory-service" logs, even though they are called from different parts of the code. This is the magic of automatic context propagation!

```
INFO (main): Starting application...
INFO (order-service): Processing order... {"correlationId":"...","payload":{"productId":"B-001","quantity":2}}
INFO (inventory-service): Checking inventory... {"correlationId":"...","item":"B-001"}
INFO (main): Application finished.
```
