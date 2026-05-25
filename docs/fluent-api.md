# Fluent API

Every logger returned by `getLogger()` exposes builders that produce **new logger instances** with extra metadata bound to them. The original logger is unchanged; the new one carries the metadata on every call from then on.

This is how you tag entire subsystems, attach compliance policies, or pin a transaction ID without threading it through your call graph.

---

## The builders

| Builder                       | What it binds                                    |
|-------------------------------|--------------------------------------------------|
| `withSource('X')`             | `source: 'X'` — typically a module or class name |
| `withTransactionId('id')`     | `transactionId: 'id'`                            |
| `withRetention({ … })`        | `retention: { … }` — arbitrary JSON              |
| `child({ k: v })`             | Arbitrary key-value bindings                     |

---

## Tagging a subsystem

```typescript
const baseLog = syntropyLog.getLogger();
const paymentsLog = baseLog.withSource('PaymentService');

paymentsLog.info({ userId: 123, operation: 'charge' }, 'Payment processed');
// Entry includes source: 'PaymentService' automatically
```

---

## Compliance-aware loggers

```typescript
const auditLogger = baseLog
  .withSource('PaymentService')
  .withRetention({ policy: 'SOX_AUDIT_TRAIL', years: 5 });

auditLogger.audit({ userId: 123, action: 'manager.override' }, 'Approval');
```

Inside your transport's `executor`, route by `entry.retention?.policy`:

```typescript
async executor(entry) {
  const table = entry.retention?.policy === 'SOX_AUDIT_TRAIL'
    ? 'audit_long_term'
    : 'logs_hot';
  await db.insert(table, entry);
}
```

See [compliance.md](compliance.md) for HIPAA / SOX / GDPR / PCI-DSS patterns.

---

## Composability

Builders return new logger instances and can be chained freely. Each chain is independent — modifying one does not affect another.

```typescript
const txnLog = baseLog
  .withSource('OrdersService')
  .withTransactionId(req.id);

// Different subsystem, same transaction:
const inventoryLog = baseLog
  .withSource('Inventory')
  .withTransactionId(req.id);
```

Use `child({ … })` when the binding doesn't fit a built-in helper:

```typescript
const tenantLog = baseLog.child({ tenantId: 'acme', region: 'sa-east-1' });
```

These bindings live on the logger instance; they are independent of the request-scoped context (see [context.md](context.md)). Use bindings for **what the logger is**; use context for **what the request is**.
