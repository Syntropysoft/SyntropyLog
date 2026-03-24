# Integración con OpenTelemetry

## TL;DR

**No hay que modificar SyntropyLog.** La integración con OpenTelemetry es solo configuración: definís el formatter, escribís el executor (la función que llama a OTel), agregás el transport a `transportList`, y listo. Desde ahí podés usarlo, sacarlo o sobreescribirlo por llamada con la API de routing existente.

```typescript
// Agregar OTel al default
log.info('va a todos los transports incluyendo otel')

// Solo OTel
log.override('otel').audit('solo a otel')

// Sin OTel para este log
log.remove('otel').debug('debug local, no contamina otel')

// OTel + algo extra
log.add('audit-db').error('va a otel y además a audit-db')
```

---

## Cómo funciona

El `UniversalAdapter` ya es el punto de integración con cualquier backend externo. El `UniversalLogFormatter` ya transforma el `LogEntry` al shape que necesitás. Para OTel, el flujo es:

```
log.info({ traceId, spanId }, 'mensaje')
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
  executor(formatted)          ← acá vivé tu integración con OTel
  → otelLogger.emit(logRecord)
         │
         ▼
  BatchLogRecordProcessor → OTLPLogExporter → Collector
```

El executor es una función normal que vos escribís — convierte el objeto formateado al `LogRecord` de OTel y lo emite. Eso es todo.

---

## Configuración paso a paso

### 1. Formatter

Mapea los campos de SyntropyLog a los nombres que OTel espera. `includeAllIn: 'attributes'` agrupa toda la metadata automáticamente.

```typescript
import { UniversalLogFormatter } from 'syntropylog';

const otelFormatter = new UniversalLogFormatter({
  mapping: {
    body:         'message',
    severityText: 'level',
    timestamp:    'timestamp',
  },
  includeAllIn: 'attributes',  // bindings + metadata van todos en attributes
});
```

El executor va a recibir exactamente esto:

```typescript
{
  body: 'Procesando pago',
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

### 2. Executor

Convierte el objeto al `LogRecord` de OTel. Los únicos detalles de conversión son: timestamp de ISO string a `HrTime`, y nivel string a `severityNumber`.

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
```

### 3. Transport

```typescript
import { AdapterTransport, UniversalAdapter } from 'syntropylog';

const otelTransport = new AdapterTransport({
  name:     'otel',
  adapter:  new UniversalAdapter({
    executor: buildOtelExecutor('my-service'),
    onError:  (err) => console.error('[OtelAdapter]', err),
  }),
  formatter: otelFormatter,
});
```

### 4. Registrar en SyntropyLog

```typescript
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
```

Listo. Todos los logs van a OTel y a console por default.

---

## Routing por llamada

Una vez registrado el transport `'otel'`, podés controlarlo por log individual sin crear nuevos loggers ni cambiar configuración:

```typescript
// Default: va a todos los transports
log.info('request recibida')

// Solo OTel (para este log)
log.override('otel').audit('acción regulatoria')

// Sacar OTel para este log
log.remove('otel').debug('debug interno, no contamina OTel')

// Agregar un transport extra además del default
log.add('audit-db').error('va a otel, console Y audit-db')
```

---

## Inyectar traceId / spanId

SyntropyLog no lee el span activo de OTel automáticamente — eso es intencional para mantener zero-deps. Los inyectás vos donde corresponde.

**En middleware (contexto de request):**

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

**Por llamada:**

```typescript
const spanCtx = trace.getActiveSpan()?.spanContext();
log.info({ traceId: spanCtx?.traceId, spanId: spanCtx?.spanId }, 'Pago procesado');
```

---

## Tabla de mapeo de niveles

| SyntropyLog | OTel SeverityNumber | OTel SeverityText |
|---|---|---|
| `trace` | 1 | `TRACE` |
| `debug` | 5 | `DEBUG` |
| `info` | 9 | `INFO` |
| `audit` | 9 | `INFO` |
| `warn` | 13 | `WARN` |
| `error` | 17 | `ERROR` |
| `fatal` | 21 | `FATAL` |
| `silent` | 0 | `UNSPECIFIED` |

`audit` va como INFO en OTel para no contaminar alertas de error. Podés cambiarlo en `SEVERITY_NUMBER` según la política del equipo.

---

## Ejemplo completo

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

// ─── Uso ──────────────────────────────────────────────────────────────────────

const log = syntropyLog.getLogger('PaymentService');
const spanCtx = trace.getActiveSpan()?.spanContext();
const reqLog  = log.child({ traceId: spanCtx?.traceId, spanId: spanCtx?.spanId });

reqLog.info({ userId: 'usr_123', amount: 1500 }, 'Pago procesado');
reqLog.override('otel').audit({ orderId: 'ORD-999' }, 'Fondos debitados');
reqLog.remove('otel').debug('debug local');

// ─── Shutdown ─────────────────────────────────────────────────────────────────

await syntropyLog.shutdown();      // flush de SyntropyLog primero
await loggerProvider.shutdown();   // luego flush del exporter OTel
```

---

## Notas de producción

- **`BatchLogRecordProcessor`** en producción, `SimpleLogRecordProcessor` en dev/test.
- El `MaskingEngine` se aplica **antes** de llegar al executor — los datos sensibles ya vienen redactados cuando OTel los recibe.
- `audit` siempre se emite (bypasea el nivel mínimo). Llegará a OTel sin importar qué nivel esté configurado.
- Shutdown: primero `syntropyLog.shutdown()`, después `loggerProvider.shutdown()` — para no perder logs en vuelo.
