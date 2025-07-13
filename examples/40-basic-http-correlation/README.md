# Example 30: Basic HTTP Correlation

This example showcases a critical feature for microservices and distributed systems: **automatic context propagation over HTTP**.

## The "Why"

When `Service-A` calls `Service-B`, how do you link the logs from both services to the same original request? You need to propagate a `correlation-id`. SyntropyLog automates this entirely.

When you use an instrumented HTTP client, SyntropyLog automatically:
1.  Grabs the current `correlationId` from the active context.
2.  Injects it into the HTTP headers of the outgoing request (e.g., `X-Correlation-ID: <value>`).
3.  Logs both the request and the response, enriching the logs with HTTP metadata (`method`, `url`, `status_code`, etc.).

This means you get fully correlated, detailed logs across service boundaries with zero manual effort.

## Purpose

The goal of this example is to demonstrate:
1.  How to configure an instrumented HTTP client using the built-in `axios` adapter.
2.  How to make an HTTP call using the instrumented client.
3.  How to observe in the logs that the `correlationId` is automatically added to the request.

## How to Run

1.  **Install Dependencies**:
    From the `examples/30-basic-http-correlation` directory, run:
    ```bash
    npm install
    ```

2.  **Run the Script**:
    ```bash
    npm start
    ```

## Expected Output

The log output will show the lifecycle of the HTTP request. Most importantly, you can see the `correlationId` present in the log metadata, confirming it was correctly propagated.

```
INFO (http-example): Initializing...
INFO (http-example): Context created. Making HTTP call... {"correlationId":"..."}
INFO (my-axios-client): Starting HTTP request... {"correlationId":"...","http":{"method":"GET","url":"/users/1"}}
INFO (my-axios-client): HTTP response received. {"correlationId":"...","http":{"method":"GET","url":"/users/1","statusCode":200,"durationMs":...}}
INFO (http-example): Request finished.
```
