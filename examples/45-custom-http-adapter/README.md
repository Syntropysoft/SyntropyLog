# Example 45: Custom HTTP Adapter

This example demonstrates one of the most powerful features of SyntropyLog: **agnostic instrumentation**. You are not locked into a specific HTTP client. By implementing a simple adapter, you can make **any** HTTP client library work with the framework.

## The "Why"

What if you want to use a client library that isn't supported out-of-the-box, like `got`, `node-fetch`, or a proprietary internal client? Instead of waiting for official support, you can build your own adapter in just a few minutes.

An adapter is a simple class that acts as a "translator" between SyntropyLog's generic request/response format and the specific format of your chosen library.

## Purpose

The goal of this example is to show:
1.  How to implement the `IHttpClientAdapter` interface for the `got` library.
2.  How to translate requests, responses, and errors between the generic format and `got`'s format.
3.  How to inject this custom adapter into the `http` configuration.
4.  That once configured, context propagation works automatically, just like with a built-in adapter.

## How to Run

1.  **Install Dependencies**:
    From the `examples/45-custom-http-adapter` directory, run:
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

The log output shows the full lifecycle of the request made with the custom `GotAdapter`. Notice that the `correlationId` is correctly propagated and confirmed by the `nock` server, proving that our custom adapter is working perfectly within the framework.

```
11:23:11 [INFO] (main): Context created. Making HTTP call...
  └─ context={"X-Correlation-ID":"d2cfa391-c06c-4c5b-8c6d-0c0b105d35ed"}
11:23:11 [INFO] (my-got-client): Starting HTTP request
  └─ method=GET url=products/456 context={"X-Correlation-ID":"d2cfa391-c06c-4c5b-8c6d-0c0b105d35ed"}
11:23:11 [INFO] (main): Nock mock confirmed: Correlation ID received! { correlationId: 'd2cfa391...' }
  └─ context={"X-Correlation-ID":"d2cfa391-c06c-4c5b-8c6d-0c0b105d35ed"}
11:23:11 [INFO] (my-got-client): HTTP response received
  └─ statusCode=200 url=products/456 method=GET durationMs=35 context={"X-Correlation-ID":"d2cfa391..."}
11:23:11 [INFO] (main): Request finished.
  └─ context={"X-Correlation-ID":"d2cfa391-c06c-4c5b-8c6d-0c0b105d35ed"}
``` 