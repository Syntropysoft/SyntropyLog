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

`withRetention` accepts either a **registered policy name** (recommended) or an **inline rules object** (escape hatch).

### Registered policy — typo-safe, audit-reviewable

Declare your retention policies once at `init()`, then refer to them by name. Misses throw `RetentionPolicyNotFoundError` with a listing of what *is* registered, so a typo fails loudly the first time you run it — not silently in production.

```typescript
import {
  syntropyLog,
  defineRetentionPolicies,
  RetentionPolicyNotFoundError,
} from 'syntropylog';

const retentionPolicies = defineRetentionPolicies({
  SOX_AUDIT_TRAIL: { years: 5, region: 'us-east-1' },
  GDPR_ARTICLE_17: { years: 7, subjectIdField: 'userId' },
  PCI_DSS_REQ_10:  { years: 1, immediate: true },
});

await syntropyLog.init({
  logger: { level: 'info', serviceName: 'payments-api' },
  retentionPolicies,
});

const auditLogger = syntropyLog.getLogger()
  .withSource('PaymentService')
  .withRetention('SOX_AUDIT_TRAIL');

auditLogger.audit({ userId: 123, action: 'manager.override' }, 'Approval');
```

For full compile-time autocomplete on the policy name, derive a string union from the helper's return value:

```typescript
type PolicyName = keyof typeof retentionPolicies;

const log = syntropyLog.getLogger()
  .withRetention('SOX_AUDIT_TRAIL' satisfies PolicyName);
//                  ^^^ typo here = compile error
```

### Inline rules — when the policy is ad-hoc

```typescript
const oneOffLogger = baseLog.withRetention({
  policy: 'temporary-export',
  ttl: 86_400,
  archiveAfter: 3_600,
});
```

Inside your transport's `executor`, route by `entry.retention?.policy` (or any other field you put in the rules):

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
