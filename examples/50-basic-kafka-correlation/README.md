# Example 50: Basic Kafka Correlation

This example demonstrates how to implement a custom **Broker Adapter** for Kafka. It showcases one of the core strengths of SyntropyLog: its decoupled, adapter-based architecture for message brokers.

By creating a simple `KafkaAdapter`, we can instrument any `kafkajs`-based communication, enabling automatic context propagation and centralized logging for distributed systems.

## Key Concepts

- **Broker Adapter Pattern**: Instead of being tied to a specific broker library, you provide an adapter that conforms to the `IBrokerAdapter` interface.
- **Context Propagation**: The `correlationId` is automatically added to message headers by the producer and extracted by the consumer, linking distributed operations.
- **Singleton Client**: The Kafka client and adapter are instantiated once and shared across the application, which is a common best practice.

## Prerequisites

Before running this example, you must first build the main `syntropylog` library from the project's root directory:

```bash
# From the project root
npm run build
```

## Running the Example

1.  **Start Services with Docker Compose:**
    From the **root of the project**, start all the necessary services (including Kafka) using the main `docker-compose.yaml` file.

    ```bash
    # From the project root
    docker-compose up -d
    ```

2.  **Install dependencies:**

   ```bash
   npm install
   ```

3.  **Run the example:**
    First, compile the TypeScript code. Then, run the start script.

   ```bash
   npm run build
   npm start
   ```

4.  **Stop Services:**
    When you're finished, you can stop all services from the **root of the project**.

    ```bash
    # From the project root
    docker-compose down
    ```

## Expected Output

You should see logs from both the producer and the consumer. You might see some initial connection errors from `kafkajs` while the Kafka cluster starts up, which is normal. The important part is that the `correlationId` is the same for both the producer and consumer logs.

```log
--- Running Broker Instrumentation Example ---
2025-07-13 INFO  [broker-manager] :: Broker client instance "my-kafka-bus" created successfully via adapter.
2025-07-13 INFO  [syntropylog-main] :: SyntropyLog framework initialized successfully.
2025-07-13 INFO  [my-kafka-bus] :: Connecting to broker...
2025-07-13 INFO  [my-kafka-bus] :: Successfully connected to broker.
2025-07-13 INFO  [my-kafka-bus] [topic="syntropylog-test-topic"] :: Subscribing to topic...
2025-07-13 INFO  [my-kafka-bus] [topic="syntropylog-test-topic"] :: Successfully subscribed to topic.
2025-07-13 INFO  [producer] [X-Correlation-ID="..."] :: Producer context created. Publishing message...
2025-07-13 INFO  [my-kafka-bus] [X-Correlation-ID="..." topic="syntropylog-test-topic"] :: Publishing message...
2025-07-13 INFO  [my-kafka-bus] [X-Correlation-ID="..." topic="syntropylog-test-topic"] :: Message published successfully.
2025-07-13 INFO  [my-kafka-bus] [X-Correlation-ID="..." topic="syntropylog-test-topic"] :: Received message.
2025-07-13 INFO  [consumer] [X-Correlation-ID="..." payload="Hello, distributed world!"] :: Message processed by consumer.

✅ Broker example finished.
```
