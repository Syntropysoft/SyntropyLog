# Master Configuration Guide

This guide provides a complete reference for every configuration option in SyntropyLog.

## 📋 Top-Level Configuration

The configuration object passed to `syntropyLog.init()` follows this structure:

```typescript
await syntropyLog.init({
  logger: { /* Logger specific settings */ },
  loggingMatrix: { /* Context visibility control */ },
  redis: { /* Managed Redis instances */ },
  masking: { /* Data privacy & security rules */ },
  context: { /* Correlation ID settings */ },
  shutdownTimeout: 5000 // ms
});
```

---

## 🌲 1. Logger Configuration (`logger`)

Controls the core logging engine behavior.

| Property | Type | Description |
| :--- | :--- | :--- |
| `serviceName` | `string` | The identifier for your application in traces and logs. |
| `level` | `LogLevel` | Minimum severity level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`). |
| `transports` | `Transport[]` or `Record` | Array of transport instances (e.g., `ConsoleTransport`) or a mapping of logger names to transport arrays. |
| `serializerTimeoutMs` | `number` | Max time (ms) allowed for the security pipeline to process metadata. Default: `50ms`. |
| `prettyPrint` | `object` | `{ enabled: boolean }`. Formats logs for readability in development. |

---

## 📊 2. Logging Matrix (`loggingMatrix`)

The **Logging Matrix** is a unique feature that controls which context properties (e.g., `userId`, `correlationId`) are included in the final log output based on the log level.

```typescript
loggingMatrix: {
  default: ['correlationId', 'serviceName'], // Included in all levels
  error: ['*'], // Include ALL context fields for errors
  trace: ['correlationId', 'serviceName', 'requestId'],
  audit: ['*'] // Audit logs typically include all available context
}
```

---

## 💾 3. Managed Resources (`redis`)

Centralize Redis connections with automatic observability.

### **Redis (`redis`)**
- `instances`: Array of Redis configurations.
- `default`: Name of the default instance.

**Per-instance Logging settings:**
- `onSuccess`: Level for successful commands (Default: `debug`).
- `onError`: Level for failed commands (Default: `error`).
- `logCommandValues`: Boolean. Log the command arguments (e.g., keys/values).
- `logReturnValue`: Boolean. Log what Redis returned.

---

## 🛡️ 4. Masking & Security (`masking`)

Define rules to automatically redact sensitive information.

```typescript
masking: {
  rules: [
    { pattern: 'password', strategy: MaskingStrategy.STAR },
    { pattern: /card_number/, strategy: MaskingStrategy.REDACT }
  ],
  maskChar: '*',
  preserveLength: true,
  enableDefaultRules: true // Pre-mask common fields like 'token', 'apiKey'
}
```

---

## 🔄 5. Context Propagation (`context`)

Defines how the library identifies and tracks requests through headers.

- `correlationIdHeader`: The header name used for tracing (e.g., `X-Correlation-ID`).
- `transactionIdHeader`: The header name for external trace IDs (e.g., `X-Trace-ID`).

---

## 📚 Related Guides
- [🏢 Enterprise Implementation](./enterprise.md)
- [📦 Persistence & Universal Adapters](./persistence.md)
- [🧬 Serialization & Custom Formatting](./serialization.md)
- [⚙️ Middleware & Framework Integration](./middleware.md)
- [🧪 Testing Strategy](./testing.md)
