# Example 7: Full-Stack Microservices with NATS

This example demonstrates the full power of `SyntropyLog` in a realistic, distributed, full-stack environment.

## Architecture

We will build a system composed of three microservices that communicate via an API Gateway and a NATS message broker to process a "sale" operation.

1.  **API Gateway**: The single entry point for external requests. It receives the initial HTTP call to create a sale.
2.  **Sales Service**: Processes the sale logic and publishes a `sale.created` event to a NATS stream.
3.  **Dispatch Service**: Subscribes to the `sale.created` event and simulates the product dispatch process.

## Key Objectives

*   **End-to-End Tracing**: Demonstrate how the `correlationId` (or `transactionId` if configured) is automatically propagated from the initial HTTP request through the NATS broker to the final consumer service.
*   **Agnostic Instrumentation**: Show `SyntropyLog` instrumenting both `axios` (for HTTP communication) and `nats.js` (for messaging) within the same ecosystem.
*   **Centralized & Readable Logs**: All services will log to the console, showing a unified, colored, and easy-to-read stream of events that can be visually traced using the shared ID.
*   **Containerization**: The entire stack (all three services + NATS broker) will be orchestrated using Docker Compose for easy setup and execution. 