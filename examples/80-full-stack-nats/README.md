# Example 80: Full-Stack Correlation with NATS

This example demonstrates how `syntropylog` can be used in a realistic, distributed, full-stack environment to achieve end-to-end correlation across multiple microservices and transport layers (HTTP and NATS).

## Architecture

The system consists of three microservices orchestrated with Docker Compose:

1.  **API Gateway**: A Node.js service using Express. It's the public entry point that receives an HTTP POST request to create an order. It uses an instrumented HTTP client to forward the request to the Sales Service.
2.  **Sales Service**: Another Node.js service using Express. It exposes an HTTP endpoint, processes the sale, and then publishes a `sales.processed` event to a NATS topic.
3.  **Dispatch Service**: A lightweight Node.js service that subscribes to the `sales.processed` topic. It listens for messages and logs them, simulating a final processing step like dispatching an order.

The key goal is to show how `syntropylog` automatically propagates a consistent `correlationId` from the initial HTTP request through the NATS message, allowing for a unified trace of the entire transaction.

## Prerequisites

Before running the example, please ensure you have the following installed:
-   Node.js (v18 or higher is recommended).
-   Docker and Docker Compose.

Additionally, since `syntropylog` is being developed locally and is not yet published to a public registry, you must build it from the source.

From the **root directory** of the project, run:
```bash
npm install
npm run build
```

## How to Run

All services for this example are defined in the `docker-compose.yaml` file within this directory.

1.  **Navigate to the example directory:**
    ```bash
    cd examples/80-full-stack-nats
    ```

2.  **Build and start the services:**
    ```bash
    npm insall
    
    docker compose up --build
    ```
    This command will build the Docker images for the three services and start them, along with a NATS message broker. You will see the logs from all containers in your terminal.

## Testing the Flow

Once all services are running, you can trigger the end-to-end flow by sending a POST request to the API Gateway.

1.  **Send the cURL request:**
    Open a new terminal and run the following command:
    ```bash
    curl -X POST http://localhost:3000/orders \
    -H "Content-Type: application/json" \
    -H "X-TRACE-ID: trace-abc-123" \
    -H "X-SESSION-ID: session-xyz-987" \
    -H "X-REQUEST-AGENT: curl-client/1.0" \
    -d '{
      "productId": "prod-123",
      "quantity": 2,
      "customer": {
        "id": "cust-abc",
        "name": "Gabriel Gomez"
      }
    }'
    ```

2.  **(Optional) Test the Sales Service Directly:**
    If you suspect issues with the communication between the gateway and the sales service, you can test the `sales-service` directly by exposing its port (as we've done in the `docker-compose.yaml`). This helps isolate networking problems.

    ```bash
    curl -X POST http://localhost:3001/process-sale \
    -H "Content-Type: application/json" \
    -H "X-TRACE-ID: direct-trace-456" \
    -d '{ "item": "direct-test" }'
    ```

3.  **Check the logs:**
    Observe the output in the terminal where `docker compose` is running. You will see a series of log entries from all three services.

## Evidence of Success

You'll know everything is working correctly when you see the same `correlationId` in the logs from `api-gateway`, `sales-service`, and `dispatch-service`. This demonstrates that the context was successfully propagated across HTTP and NATS.

**Example Log Flow:**

```log
# 1. API Gateway receives the request and creates a correlationId
api-gateway-1  | {"context":{"correlationId":"ad027e2b..."}, ...,"service":"api-gateway","msg":"Received request to create a new order."}

# 2. API Gateway calls the Sales Service, propagating the context
api-gateway-1  | {"method":"POST",...,"context":{"correlationId":"ad027e2b..."}, ...,"service":"axios-default","msg":"Starting HTTP request"}

# 3. Sales Service receives the request with the same correlationId
sales-service-1| {"context":{"correlationId":"ad027e2b..."}, ...,"service":"sales-service","msg":"Processing sale..."}

# 4. Sales Service publishes to NATS, and the context is automatically included
sales-service-1| {"topic":"sales.processed","context":{"correlationId":"ad027e2b..."}, ...,"service":"nats-default","msg":"Publishing message..."}

# 5. Dispatch Service receives the NATS message with the context intact
dispatch-service-1  | {"topic":"sales.processed","context":{"correlationId":"ad027e2b..."}, ...,"service":"nats-default","msg":"Received message."}
dispatch-service-1  | {"data":{...},"context":{"correlationId":"ad027e2b..."}, ...,"service":"dispatch-service","msg":"Received processed sale. Dispatching order..."}
``` 