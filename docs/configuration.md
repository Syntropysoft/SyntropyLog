# Configuration Guide

SyntropyLog offers a flexible configuration system to manage your application's resources and observability.

## Basic Configuration

```typescript
await syntropyLog.init({
  logger: {
    serviceName: 'my-app',
    level: 'info', // debug, info, warn, error, audit
  },
  context: {
    correlationIdHeader: 'X-Correlation-ID',
  }
});
```

## Advanced Configuration Reference

### Logger Options
- `serviceName`: The identifier for your application in traces.
- `level`: Minimum severity level to log.
- `transports`: Array of transport instances (e.g., `ConsoleTransport`, `JsonTransport`).

### Context Management
- `correlationIdHeader`: The HTTP header name (or key) used to track requests across services.
- `traceIdHeader`: (Optional) Standard trace header for OpenTelemetry interoperability.

### Managed Instances
Register your connections here to get automatic observability:
- `redis`: Configuration for Redis instances.
- `brokers`: Adapters for message brokers (Kafka, RabbitMQ, etc.).
- `http`: Adapters for instrumented HTTP clients.

### Masking & Privacy
Enable automatic data masking to prevent leaking PII or secrets:
```typescript
masking: {
  fields: ['password', 'token', 'secret', 'creditCard'],
  preserveLength: true,
  patterns: [
    { regex: /pattern/, replacement: '[MASKED]' }
  ]
}
```

### Logging Matrix
Define which fields are included for each log level to optimize storage and clarity.
