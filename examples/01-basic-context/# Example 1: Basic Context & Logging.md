# Example 1: Basic Context & Logging

This example demonstrates the core concept of `beaconlog`: **automatic context propagation** using `AsyncLocalStorage`.

## What it does

The script simulates an operation (like an incoming API request) by creating a context with a `correlationId` and a `userId`. It then calls a series of nested `async` functions.

Notice how the deepest function, `checkInventory()`, can produce a log that includes the `correlationId` and `userId` **without them being passed down as parameters**. This is the "magic" of the `ContextManager` working seamlessly with the `Logger`.

## How to Run

1.  Navigate to this directory:
    ```bash
    cd examples/01-basic-context
    ```

2.  Install the dependency (which links to the local `beaconlog-v2` library):
    ```bash
    npm install
    ```

3.  Run the script:
    ```bash
    npm start
    ```

You will see how the logs generated inside the `run` block are automatically enriched with the context data, while the log outside of it is not.