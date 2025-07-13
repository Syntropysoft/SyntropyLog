# Example 40: Basic HTTP Correlation

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
3.  How `nock` can be used to simulate a server that asserts the `correlationId` was received.

## How to Run

1.  **Install Dependencies**:
    From the `examples/40-basic-http-correlation` directory, run:
    ```bash
    npm install
    ```

2.  **Build the Example**:
    This example must be compiled from TypeScript to JavaScript first.
    ```bash
    npm run build
    ```

3.  **Run the Script**:
    ```bash
    npm start
    ```

## Expected Output

The log output shows the full lifecycle of the HTTP request. The most important line is from our `nock` server, confirming it received the header. You can also see the `correlationId` automatically included in the context of every log.

```
11:19:37 [INFO] (main): Context created. Making HTTP call...
  └─ context={"X-Correlation-ID":"f0115224-0892-4d83-ba46-92416e12f6c5"}
11:19:37 [INFO] (my-axios-client): Starting HTTP request
  └─ method=GET url=/users/1 context={"X-Correlation-ID":"f0115224-0892-4d83-ba46-92416e12f6c5"}
11:19:37 [INFO] (main): Nock mock confirmed: Correlation ID received! { correlationId: 'f011...' }
  └─ context={"X-Correlation-ID":"f0115224-0892-4d83-ba46-92416e12f6c5"}
11:19:37 [INFO] (my-axios-client): HTTP response received
  └─ statusCode=200 url=/users/1 method=GET durationMs=39 context={"X-Correlation-ID":"f011..."}
11:19:37 [INFO] (main): Request finished.
  └─ context={"X-Correlation-ID":"f0115224-0892-4d83-ba46-92416e12f6c5"}
```
