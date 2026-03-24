# OpenTelemetry Integration

## TL;DR

**No changes to SyntropyLog are needed.** The integration with OpenTelemetry is just configuration: define the formatter, write the executor (the function that calls OTel), add the transport to `transportList`, and you're done. From there you can use it, remove it, or override it per call using the existing routing API.

```typescript
// Default: goes to all transports including otel
log.info('goes to all configured transports')

// Only OTel
log.override('otel').audit('only to otel')

// Skip OTel for this log
log.remove('otel').debug('local debug, does not pollute otel')

// OTel + something extra
log.add('audit-db').error('goes to otel and also to audit-db')
```

---

## How It Works

`UniversalAdapter` is already the integration point for any external backend. `UniversalLogFormatter` already transforms the `LogEntry` to whatever shape you need. For OTel, the flow is:

```
log.info({ traceId, spanId }, 'message')
         │
         ▼
  SyntropyLog pipeline
  (loggingMatrix, masking, serialization)
         │
         ▼
  UniversalLogFormatter.format(entry)
  → { body, severityText, timestamp, attributes: { traceId, ... } }
         │
         ▼
  executor(formatted)          ← your OTel integration lives here
  → otelLogger.emit(logRecord)
         │
         ▼
  BatchLogRecordProcessor → OTLPLogExporter → Collector
```

The executor is a plain function you write — it converts the formatted object to an OTel `LogRecord` and emits it. That's all.

---

## Configuration Step by Step

### 1. Formatter

Maps SyntropyLog fields to the names OTel expects. `includeAllIn: 'attributes'` groups all metadata automatically.

```typescript
import { UniversalLogFormatter } from 'syntropylog';

const otelFormatter = new UniversalLogFormatter({
  mapping: {
    body:         'message',
    severityText: 'level',
    timestamp:    'timestamp',
  },
  includeAllIn: 'attributes',  // bindings + metadata all go into attributes
});
```

The executor will receive exactly this:

```typescript
{
  body: 'Processing payment',
  severityText: 'info',
  timestamp: '2024-03-24T18:30:45.123Z',
  attributes: {
    correlationId: '550e8400-...',
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    userId: 'usr_123',
    amount: 1500.50,
  }
}
```

### 2. Severity Mapping Table

OTel SeverityNumber uses numeric ranges defined in the specification:

| SyntropyLog | OTel SeverityNumber | OTel SeverityText |
|-------------|--------------------|--------------------|
| `trace` | 1 | `TRACE` |
| `debug` | 5 | `DEBUG` |
| `info` | 9 | `INFO` |
| `audit` | 9 | `INFO` |
| `warn` | 13 | `WARN` |
| `error` | 17 | `ERROR` |
| `fatal` | 21 | `FATAL` |
| `silent` | 0 | `UNSPECIFIED` |

```typescript
const SEVERITY_NUMBER: Record<string, number> = {
  trace:  1,
  debug:  5,
  info:   9,
  audit:  9,
  warn:   13,
  error:  17,
  fatal:  21,
  silent: 0,
};
```

### 3. Writing the Executor

The executor is the bridge between SyntropyLog and the OTel Logger. It receives the object already formatted by `UniversalLogFormatter` and emits the `LogRecord`.

```typescript
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

const SEVERITY_NUMBER: Record<string, number> = {
  trace: 1, debug: 5, info: 9, audit: 9,
  warn: 13, error: 17, fatal: 21, silent: 0,
};

function buildOtelExecutor(scopeName: string) {
  return function executor(data: unknown): void {
    const entry = data as {
      body: string;
      severityText: string;
      timestamp: string;
      attributes?: Record<string, unknown>;
    };

    // Get the OTel logger from the global LoggerProvider
    const otelLogger = logs.getLogger(scopeName);

    // Convert ISO string → HrTime (seconds + nanoseconds)
    const timestampMs = new Date(entry.timestamp).getTime();
    const hrTime: [number, number] = [
      Math.floor(timestampMs / 1000),
      (timestampMs % 1000) * 1_000_000,
    ];

    const attrs = entry.attributes ?? {};

    // Emit the LogRecord
    otelLogger.emit({
      timestamp:      hrTime,
      severityNumber: SEVERITY_NUMBER[entry.severityText] ?? SeverityNumber.UNSPECIFIED,
      severityText:   entry.severityText.toUpperCase(),
      body:           entry.body,
      attributes:     attrs,
      traceId:        typeof attrs.traceId    === 'string' ? attrs.traceId    : undefined,
      spanId:         typeof attrs.spanId     === 'string' ? attrs.spanId     : undefined,
      traceFlags:     typeof attrs.traceFlags === 'number' ? attrs.traceFlags : 1,
    });
  };
}
```

### 4. Creating the Transport

```typescript
import { AdapterTransport, UniversalAdapter } from 'syntropylog';

const otelTransport = new AdapterTransport({
  name:     'otel',
  adapter:  new UniversalAdapter({
    executor: buildOtelExecutor('my-service'),
    onError:  (err) => console.error('[OtelAdapter]', err),
  }),
  formatter: otelFormatter,   // created in Step 1
});
```

### 5. Register in SyntropyLog

**`init()` is a Promise.** Until the `ready` event fires, `getLogger()` returns a no-op. Always listen for `ready` and `error` before calling `init()`, and wait for it to resolve before logging.

```typescript
async function initializeSyntropyLog() {
  return new Promise<void>((resolve, reject) => {
    syntropyLog.on('ready', () => resolve());
    syntropyLog.on('error', (err) => reject(err));
    syntropyLog.init({
      logger: {
        serviceName: 'my-service',
        level: 'info',
        transportList: {
          otel:    otelTransport,
          console: consoleTransport,
        },
      },
      loggingMatrix: {
        info:  ['correlationId', 'traceId', 'spanId', 'userId'],
        error: ['*'],
        audit: ['*'],
      },
    });
  });
}

process.on('SIGTERM', async () => { await syntropyLog.shutdown(); process.exit(0); });
process.on('SIGINT',  async () => { await syntropyLog.shutdown(); process.exit(0); });

async function main() {
  await initializeSyntropyLog();
  // safe to call getLogger() from here
}
main();
```

Done. All logs go to OTel and console by default.

---

## Per-Call Routing

Once the `'otel'` transport is registered, you can control it per individual log without creating new loggers or changing configuration:

```typescript
// Default: goes to all transports
log.info('request received')

// Only OTel (for this log)
log.override('otel').audit('regulatory action')

// Skip OTel for this log
log.remove('otel').debug('internal debug, does not pollute OTel')

// Add an extra transport on top of default
log.add('audit-db').error('goes to otel, console AND audit-db')
```

---

## Injecting traceId / spanId

SyntropyLog does not automatically read the active OTel span — this is intentional to maintain zero dependencies. You inject them where appropriate.

**In middleware (request context):**

```typescript
app.use((req, res, next) => {
  const spanCtx = trace.getActiveSpan()?.spanContext();
  req.log = syntropyLog.getLogger('http').child({
    traceId:    spanCtx?.traceId,
    spanId:     spanCtx?.spanId,
    traceFlags: spanCtx?.traceFlags,
  });
  next();
});
```

**Per call:**

```typescript
const spanCtx = trace.getActiveSpan()?.spanContext();
log.info({ traceId: spanCtx?.traceId, spanId: spanCtx?.spanId }, 'Payment processed');
```

---

## Complete Example

```bash
npm install @opentelemetry/api-logs @opentelemetry/sdk-logs @opentelemetry/exporter-logs-otlp-http
```

```typescript
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { syntropyLog, AdapterTransport, UniversalAdapter, UniversalLogFormatter } from 'syntropylog';

// ─── OTel setup ───────────────────────────────────────────────────────────────

const loggerProvider = new LoggerProvider();
loggerProvider.addLogRecordProcessor(
  new BatchLogRecordProcessor(new OTLPLogExporter({ url: 'http://localhost:4318/v1/logs' }))
);
logs.setGlobalLoggerProvider(loggerProvider);

// ─── Severity map ─────────────────────────────────────────────────────────────

const SEVERITY_NUMBER: Record<string, number> = {
  trace: 1, debug: 5, info: 9, audit: 9, warn: 13, error: 17, fatal: 21, silent: 0,
};

// ─── Formatter ────────────────────────────────────────────────────────────────

const otelFormatter = new UniversalLogFormatter({
  mapping: { body: 'message', severityText: 'level', timestamp: 'timestamp' },
  includeAllIn: 'attributes',
});

// ─── Executor ─────────────────────────────────────────────────────────────────

function buildOtelExecutor(scopeName: string) {
  return (data: unknown): void => {
    const entry = data as { body: string; severityText: string; timestamp: string; attributes?: Record<string, unknown> };
    const otelLogger  = logs.getLogger(scopeName);
    const timestampMs = new Date(entry.timestamp).getTime();
    const attrs       = entry.attributes ?? {};

    otelLogger.emit({
      timestamp:      [Math.floor(timestampMs / 1000), (timestampMs % 1000) * 1_000_000],
      severityNumber: SEVERITY_NUMBER[entry.severityText] ?? SeverityNumber.UNSPECIFIED,
      severityText:   entry.severityText.toUpperCase(),
      body:           entry.body,
      attributes:     attrs,
      traceId:        typeof attrs.traceId    === 'string' ? attrs.traceId    : undefined,
      spanId:         typeof attrs.spanId     === 'string' ? attrs.spanId     : undefined,
      traceFlags:     typeof attrs.traceFlags === 'number' ? attrs.traceFlags : 1,
    });
  };
}

// ─── Transport ────────────────────────────────────────────────────────────────

const otelTransport = new AdapterTransport({
  name:      'otel',
  adapter:   new UniversalAdapter({ executor: buildOtelExecutor('my-service'), onError: console.error }),
  formatter: otelFormatter,
});

// ─── Init ─────────────────────────────────────────────────────────────────────

await new Promise<void>((resolve, reject) => {
  syntropyLog.on('ready', resolve);
  syntropyLog.on('error', reject);
  syntropyLog.init({
    logger: {
      serviceName: 'my-service',
      level: 'info',
      transportList: { otel: otelTransport },
    },
    loggingMatrix: {
      info:  ['correlationId', 'traceId', 'spanId', 'userId'],
      error: ['*'],
      audit: ['*'],
    },
  });
});

// ─── Usage ────────────────────────────────────────────────────────────────────

const log = syntropyLog.getLogger('PaymentService');
const spanCtx = trace.getActiveSpan()?.spanContext();
const reqLog  = log.child({ traceId: spanCtx?.traceId, spanId: spanCtx?.spanId });

reqLog.info({ userId: 'usr_123', amount: 1500 }, 'Payment processed');
reqLog.override('otel').audit({ orderId: 'ORD-999' }, 'Funds debited');
reqLog.remove('otel').debug('local debug');

// ─── Shutdown ─────────────────────────────────────────────────────────────────

await syntropyLog.shutdown();      // flush SyntropyLog first
await loggerProvider.shutdown();   // then flush the OTel exporter

```

---

## Production Notes

- **`BatchLogRecordProcessor`** in production, `SimpleLogRecordProcessor` in dev/test.
- The `MaskingEngine` runs **before** reaching the executor — sensitive data is already redacted when OTel receives it.
- `audit` is always emitted (bypasses the minimum level). It will reach OTel regardless of what level is configured.
- Shutdown: `syntropyLog.shutdown()` first, then `loggerProvider.shutdown()` — to avoid losing in-flight logs.
