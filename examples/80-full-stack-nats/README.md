# Example 80: Full-Stack Microservices with NATS

This example demonstrates the full power of `SyntropyLog` in a realistic, distributed, full-stack environment using Docker Compose profiles for service orchestration.

## Architecture

We have a system composed of three microservices that communicate via an API Gateway and a NATS message broker to process a "sale" operation.

1.  **API Gateway**: The single entry point for external requests. It receives an HTTP call, creates a new correlation context, and calls the Sales Service.
2.  **Sales Service**: Receives the HTTP call from the gateway, processes the sale logic, and publishes a `sales.processed` event to a NATS topic.
3.  **Dispatch Service**: Subscribes to the `sales.processed` topic and logs the reception of the event, simulating the final step in the chain.

The key goal is to show how `SyntropyLog` can maintain a consistent `correlationId` across different transport layers (HTTP and Messaging).

## How to Run

This example uses a shared Docker Compose file located in the root `examples` directory.

### 1. Start the Infrastructure

First, from the `examples` directory, start the shared infrastructure services (NATS, Kafka, RabbitMQ, etc.).

```bash
cd examples
docker compose up -d
```

### 2. Start the Application Services

Once the infrastructure is running, use the `nats-app` profile to build and start only the services related to this example.

```bash
# Still inside the examples directory
docker compose --profile nats-app up --build -d
```

### 3. Trigger the Flow

Send a request to the API Gateway to initiate the process:

```bash
curl -X GET http://localhost:3000/create-sale
```

You should receive a response like this:
```json
{"message":"Sale creation initiated and forwarded to sales-service.","correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"}
```

### 4. Check the Logs

To see the end-to-end trace, view the logs for all three services:

```bash
docker compose logs api-gateway sales-service dispatch-service
```

### Evidence of Success

Below is the log output demonstrating the partial success of the correlation flow.

**Key Observations:**
- **HTTP Correlation Works**: The `api-gateway` generates a `correlationId` (`a0873db3...`) which is successfully propagated to the `sales-service` via the HTTP call. This is thanks to the `contextMiddleware` and the instrumented `Axios` client.
- **Broker Correlation To Be Fixed**: The trace breaks when publishing to NATS. The `sales-service` context is not automatically propagated to the NATS message headers. The `dispatch-service` receives the message but with an empty context. This is the next point to fix in the library itself.

```log
❯ curl -X GET http://localhost:3000/create-sale
{"message":"Sale creation initiated and forwarded to sales-service.","correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"}%                                                                            

❯ docker compose logs api-gateway sales-service dispatch-service
api-gateway-example  | {"context":{"correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"timestamp":"2025-07-13T22:59:57.237Z","level":"info","service":"api-gateway","msg":"Received request to create a new sale."}
api-gateway-example  | {"context":{"correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"timestamp":"2025-07-13T22:59:57.237Z","level":"info","service":"api-gateway","msg":"Calling sales-service..."}
api-gateway-example  | {"method":"POST","url":"http://sales-service:3001/process-sale","context":{"correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"timestamp":"2025-07-13T22:59:57.238Z","level":"info","service":"axios-default","msg":"Starting HTTP request"}
api-gateway-example  | {"statusCode":200,"url":"http://sales-service:3001/process-sale","method":"POST","durationMs":44,"context":{"correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"timestamp":"2025-07-13T22:59:57.259Z","level":"info","service":"axios-default","msg":"HTTP response received"}
api-gateway-example  | {"response":{"message":"Sale processed and event published.","correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"context":{"correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"timestamp":"2025-07-13T22:59:57.260Z","level":"info","service":"api-gateway","msg":"Response from sales-service"}
sales-service-example     | {"saleData":{"item":"example-item","quantity":1},"context":{"correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"timestamp":"2025-07-13T22:59:57.253Z","level":"info","service":"sales-service","msg":"Processing sale..."}
sales-service-example     | {"context":{"correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"timestamp":"2025-07-13T22:59:57.253Z","level":"info","service":"sales-service","msg":"Publishing event to NATS..."}
sales-service-example     | {"topic":"sales.processed","context":{"correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"timestamp":"2025-07-13T22:59:57.253Z","level":"info","service":"nats-default","msg":"Publishing message..."}
sales-service-example     | {"topic":"sales.processed","context":{"correlationId":"a0873db3-b999-4f74-865f-594dc275ee7b"},"timestamp":"2025-07-13T22:59:57.254Z","level":"info","service":"nats-default","msg":"Message published successfully."}
dispatch-service-example  | {"topic":"sales.processed","context":{},"timestamp":"2025-07-13T22:59:57.256Z","level":"info","service":"nats-default","msg":"Received message."}
dispatch-service-example  | {"data":{"item":"example-item","quantity":1,"processedAt":"2025-07-13T22:59:57.252Z"},"context":{},"timestamp":"2025-07-13T22:59:57.256Z","level":"info","service":"dispatch-service","msg":"Received processed sale. Dispatching order..."}
``` 