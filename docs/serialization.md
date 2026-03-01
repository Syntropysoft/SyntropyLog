# Serialization & Resiliency

SyntropyLog 0.9.0 introduces an **Intelligent Serialization Pipeline**. This system ensures that your application remains stable even when logging complex, circular, or deeply nested data structures.

## 🛡️ The Security Pipeline

Every piece of metadata passed to a log call flows through a multi-step pipeline before reaching any transport. This process is automatic and requires zero configuration.

### 1. **Hygiene Step** (Circular References & Depth)
Uses `flatted` to detect and neutralize circular references. It also enforces a maximum object depth to prevent stack overflow or excessive memory consumption.
- **Goal**: Prevent recursion-based crashes.
- **Output**: A "clean" object safe for standard JSON operations.

### 2. **Serialization Step** (Internal Resiliency)
Translates complex objects (Errors, BigInts, etc.) into structured JSON values using internal, optimized serializers.

### 3. **Sanitization Step** (PII & Injection)
Integrates with the **MaskingEngine** to redact sensitive fields and strips control characters to prevent log injection attacks.

### 4. **Timeout Step** (Event Loop Protection)
Every step in the pipeline is wrapped in a mandatory execution timeout (default: **50ms**). If serialization takes too long, it is aborted via `Promise.race`, and a safe subset of the data is logged instead.
- **Goal**: Prevent "Death by Log" or Event Loop starvation in high-load scenarios.
- **Configurable**: Adjust this value using the `logger.serializerTimeoutMs` property in your configuration (min: 1ms, recommended: 20ms - 200ms).

---

## ⚖️ Comparison with Traditional Loggers

In most logging implementations, serialization is a synchronous, blocking task. SyntropyLog differentiates itself by treating serialization as a **resilient asynchronous pipeline**:

| Feature | Traditional Loggers | SyntropyLog v0.9.0 |
| :--- | :--- | :--- |
| **Circular Objects** | Often crash or throw `TypeError` | Auto-detected and neutralized via `HygieneStep` |
| **Massive Objects** | Block the Event Loop until finished | Aborted after timeout (50ms) to protect latency |
| **Safety** | May throw exceptions on bad data | Guaranteed never to throw ("Silent Observer") |
| **Auditability** | Dropped logs leave no trace | Failure metadata is included in the log output |

## 🧩 Extensibility (Universal Contracts)

While SyntropyLog no longer allows "loose" serializer functions in the global config (for security reasons), advanced users can still extend the system by implementing the `ISerializer` contract and registering it with the `SerializationManager`.

```typescript
import { ISerializer, SerializationComplexity } from 'syntropylog';

const MyCustomSerializer: ISerializer = {
  name: 'my-serializer',
  priority: 10,
  canSerialize: (data) => data instanceof MyCustomClass,
  serialize: async (data) => ({
    success: true,
    data: data.toCustomString(),
  }),
  getComplexity: () => SerializationComplexity.SIMPLE
};

// Register via the facade
syntropyLog.getSerializer().register(MyCustomSerializer);
```

---

## 🏛️ The Silent Observer Principle

The entire pipeline follows the **Silent Observer** philosophy:
- **No Exceptions**: Logging should never throw. If a step fails, the pipeline recovers gracefully.
- **Non-Blocking**: Timeouts ensure that serialization never starves the event loop.
- **Information over Perfection**: If data is too complex to serialize safely, SyntropyLog will log as much as possible rather than dropping the message entirely.
