# Example 00: Hello World

This is the most basic example to get started with SyntropyLog.

## Purpose

The purpose of this example is to demonstrate how to:

1.  Instantiate the `SyntropyLog` logger.
2.  Log messages at different levels (`info`, `warn`, `error`).
3.  Add structured data (metadata) to a log.

## How to Run

1.  **Install Dependencies**:
    From the `examples/00-hello-world` directory, run:
    ```bash
    npm install
    ```
    This command will install `typescript`, `ts-node`, and create a symbolic link to the local `syntropylog` library.

2.  **Run the Script**:
    ```bash
    npm start
    ```

## Expected Output

You should see an output in your console similar to this, with colors and formatting:

```
INFO (my-app): Hello World from SyntropyLog!
WARN (my-app): This is a warning message.
ERROR (my-app): This is an error message.
INFO (my-app): User logged in successfully {"userId":"user-123","tenantId":"tenant-abc"}
``` 