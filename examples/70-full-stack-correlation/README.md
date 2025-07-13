# 70 - Full-Stack Correlation with a Broker

This example demonstrates one of the most powerful features of `syntropylog`: **end-to-end context correlation** across different services communicating via a message broker (in this case, Kafka).

## Architecture

This example simulates a producer and a consumer running in the same process but architected as if they were separate microservices. The key is how `syntropylog` seamlessly propagates the `X-Correlation-ID` from the producer's context to the consumer's context through the message headers.

The project follows a clean, decoupled structure:

1.  **`src/adapters/KafkaAdapter.ts`**: Defines a reusable `KafkaAdapter` class that implements the `IBrokerAdapter` interface. It's responsible for the low-level logic of interacting with Kafka but knows nothing about how it's configured or instantiated.

2.  **`src/adapters/kafka-client.ts`**: Acts as a dependency injection container. It creates a single, shared instance (singleton) of the `kafkajs` client and uses it to instantiate and export a singleton of our `KafkaAdapter`. This ensures the entire application uses the same connection pool and broker client.

3.  **`src/index.ts`**: The main application entry point. It orchestrates the example:
    *   It imports the pre-configured `myKafkaBusAdapter` singleton.
    *   It initializes `syntropylog` with this adapter.
    *   It creates a producer context, sets a correlation ID, and publishes a message.
    *   It runs a consumer that subscribes to the topic and processes the message, demonstrating that the correlation ID is preserved.

## Prerequisites

Before running this example, ensure the Docker services (including Kafka) are running. From the project's root directory, run:

```bash
# From the project root
docker compose up -d
```

## Running the Example

This example can be easily verified using the master script `run-example.sh` from the project's root directory.

```bash
# From the project root
sh ./run-example.sh examples/70-full-stack-correlation
```

## Expected Output

When you run the script, you will see a series of logs. The most important thing to observe is that the `X-Correlation-ID` generated in the "producer" context is the same one that appears in the "consumer" logs, proving that the context was successfully propagated through Kafka.

```log
--- Running Broker Instrumentation Example ---
...
2025-07-13 12:31:47 INFO  [producer] [X-Correlation-ID="4899b756-8a59-4abb-8260-0db8ca548c8a"] :: Producer context created. Publishing message...
...
2025-07-13 12:31:47 INFO  [consumer] [X-Correlation-ID="4899b756-8a59-4abb-8260-0db8ca548c8a" payload="Hello, distributed world!"] :: Message processed by consumer.
...
✅ Broker example finished.
--- Verificación completada exitosamente para: examples/70-full-stack-correlation ---
```
