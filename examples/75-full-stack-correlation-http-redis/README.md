# Example 75: Broker-Based Correlation with Redis

This example demonstrates how to maintain logging context and correlation IDs within a single application that uses Redis Pub/Sub as a message broker.

A "producer" and a "consumer" are run in the same process to showcase how `syntropylog` can correlate events across asynchronous boundaries.

**Key Concepts:**

- **Context Propagation:** `syntropylog` automatically carries the context (including a `correlationId`) from the producer's scope to the message headers.
- **Broker Instrumentation:** The `RedisAdapter` is a custom adapter that integrates the `redis` library with `syntropylog`'s context management system.
- **Asynchronous Tracing:** By preserving the `correlationId`, you can trace a single logical operation from the moment it's published to the moment it's consumed, even within the same application.

## Architecture

The script performs the following steps:

1.  **Initialization:** It initializes `syntropylog` and connects to the Redis broker.
2.  **Subscription:** A "consumer" subscribes to the `syntropylog-test-channel`.
3.  **Context Creation:** The main flow creates a new logging context, which generates a unique `correlationId`.
4.  **Publication:** A "producer" within this context publishes a message to the channel. `syntropylog` automatically attaches the context headers to the message.
5.  **Consumption:** The consumer receives the message, extracts the headers, and continues the logging context.
6.  **Verification:** The console output shows logs from both the producer and consumer sharing the same `correlationId`.

## How to Run

### 1. Start Infrastructure

This example requires a running Redis instance. The main `docker-compose.yaml` in the `examples` directory includes a Redis service. Navigate to the `examples` folder and run:

```bash
# from the root of the project
cd examples
docker compose up -d redis
```

### 2. Install Dependencies

Navigate to this example's directory and install the required packages.

```bash
# from the root of the project
cd examples/75-full-stack-correlation-http-redis
npm install
```

### 3. Run the Example

Execute the main script. It will automatically run the producer/consumer flow and then exit.

```bash
npm start
```

## Expected Output

The output below shows logs from both the producer and the consumer. Note that they share the same `correlationId` ("1e576686-..."), demonstrating end-to-end context propagation.

```log
--- Running Redis Broker Instrumentation Example ---
2025-07-13 17:04:49 INFO  [syntropylog-main] :: SyntropyLog framework initialized successfully.
2025-07-13 17:04:49 INFO  [my-redis-bus] :: Successfully connected to broker.
2025-07-13 17:04:49 INFO  [my-redis-bus] [topic="syntropylog-test-channel"] :: Successfully subscribed to topic.
2025-07-13 17:04:49 INFO  [producer] [X-Correlation-ID="1e576686-26c6-4840-9211-5c9abb025841"] :: Producer context created. Publishing message...
2025-07-13 17:04:49 INFO  [my-redis-bus] [X-Correlation-ID="1e576686-26c6-4840-9211-5c9abb025841" topic="syntropylog-test-channel" messageId=undefined] :: Publishing message...
2025-07-13 17:04:49 INFO  [consumer] [X-Correlation-ID="1e576686-26c6-4840-9211-5c9abb025841" payload="Hello, distributed world!"] :: Message processed by consumer.
2025-07-13 17:04:49 INFO  [my-redis-bus] [X-Correlation-ID="1e576686-26c6-4840-9211-5c9abb025841" topic="syntropylog-test-channel" messageId=undefined] :: Message published successfully.
2025-07-13 17:04:51 INFO  [my-redis-bus] :: Successfully disconnected from broker.
2025-07-13 17:04:51 INFO  [syntropylog-main] :: SyntropyLog shut down successfully.

✅ Redis broker example finished.
```

### 4. Shut Down

Once you're finished, stop the Redis container.

```bash
# from the examples directory
docker compose down
``` 