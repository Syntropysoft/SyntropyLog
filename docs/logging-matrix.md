# Logging Matrix

The Logging Matrix is a declarative whitelist that defines **which context fields appear at each log level**. If a field is not in the matrix for a given level, it never reaches a transport.

This is the feature that lets you ship compliance reviews against the *configuration*, not against every `logger.info(...)` call in the codebase.

---

## Configure at init

```typescript
await syntropyLog.init({
  logger: { level: 'info', serviceName: 'payments-api' },
  loggingMatrix: {
    default: ['correlationId'],
    info:    ['correlationId', 'userId', 'operation'],
    warn:    ['correlationId', 'userId', 'operation', 'errorCode'],
    error:   ['correlationId', 'userId', 'operation', 'errorCode', 'tenantId', 'orderId'],
    fatal:   ['*'],
  },
});
```

| Key       | Meaning                                                  |
|-----------|----------------------------------------------------------|
| `default` | Applied to any level not listed explicitly               |
| `info`, `warn`, `error`, `fatal`, `debug`, `trace`, `audit` | Per-level whitelist |
| `'*'`     | Allow every field currently present in the context       |

---

## Field name resolution

The matrix keys are resolved against the context using these aliases:

| Matrix key       | Resolves to context field             |
|------------------|----------------------------------------|
| `correlationId`  | `x-correlation-id`, `correlationId`    |
| `transactionId`  | `x-trace-id`, `transactionId`          |
| `userId`         | `userId`                               |
| `tenantId`       | `tenantId`                             |
| `operation`      | `operation`                            |
| `errorCode`      | `errorCode`                            |
| `orderId`, `paymentId`, `eventType` | same key            |
| `'*'`            | All current context fields             |

Field names not in this list pass through verbatim — you can whitelist any custom context key by its exact name.

---

## What it looks like in practice

Same context, different levels:

```typescript
// Matrix: info → [correlationId, userId, operation]
//         error → [correlationId, userId, operation, errorCode, tenantId, orderId]

log.info({ userId: 123, tenantId: 'acme', orderId: 'ord_42', operation: 'charge' },
         'Payment captured');
// → { correlationId, userId, operation, msg: 'Payment captured' }
//   tenantId and orderId dropped — not in info whitelist

log.error({ userId: 123, tenantId: 'acme', orderId: 'ord_42',
            operation: 'charge', errorCode: 'CARD_DECLINED' },
          'Payment failed');
// → { correlationId, userId, operation, errorCode, tenantId, orderId, ... }
//   full context surfaces only on error
```

---

## Reconfiguring at runtime

The matrix can be replaced without restart — useful for raising visibility on a single POD while troubleshooting:

```typescript
syntropyLog.reconfigureLoggingMatrix({
  default: ['correlationId'],
  info:    ['correlationId', 'userId', 'operation'],
  error:   ['*'],
});
```

See [runtime-reconfiguration.md](runtime-reconfiguration.md) for the full hot-reconfiguration surface.

> **Security boundary:** runtime reconfiguration changes *field visibility only*. Masking rules and transports are fixed at `init()` and cannot be widened at runtime.

---

## Why this matters for compliance

- **HIPAA / data minimization** — fields containing PHI can be present in `error` context for diagnostics but excluded from `info` and below.
- **Auditability** — the matrix is a single JSON object reviewable by compliance officers; no need to grep the codebase.
- **Change control** — modifying the matrix is a config change, not a code change, and can be reviewed independently from feature work.

See [compliance.md](compliance.md) for SOX / GDPR / PCI-DSS positioning.
