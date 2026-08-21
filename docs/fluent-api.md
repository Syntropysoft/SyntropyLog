# Fluent API

Every logger returned by `getLogger()` exposes builders that produce **new logger instances** with extra metadata bound to them. The original logger is unchanged; the new one carries the metadata on every call from then on.

This is how you tag entire subsystems, attach compliance policies, or pin a transaction ID without threading it through your call graph.

---

## The builders

| Builder                       | What it binds                                    |
|-------------------------------|--------------------------------------------------|
| `withSource('X')`             | `source: 'X'` — typically a module or class name |
| `withTransactionId('id')`     | `transactionId: 'id'`                            |
| `withRetention('NAME')`        | `retention: 'NAME'` + `retentionUntil` (+ opt-in rules) |
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

**Name them like identifiers, not captions.** The name is emitted as `retention` and used as a
label value downstream, so keep it to `[A-Za-z0-9_.:-]` — no spaces, commas or slashes. A caption
(`'Usuarios, roles y permisos'`) works today and bites later: queries need quoting and Datadog
normalizes tags, so the value can arrive rewritten. Put the caption **inside** the policy
(`{ USUARIOS: { years: 6, label: 'Usuarios, roles y permisos' } }`) — an auditor still reads it, and
it is filed with the record when `emitRules` is on.

For full compile-time autocomplete on the policy name, derive a string union from the helper's return value:

```typescript
type PolicyName = keyof typeof retentionPolicies;

const log = syntropyLog.getLogger()
  .withRetention('SOX_AUDIT_TRAIL' satisfies PolicyName);
//                  ^^^ typo here = compile error
```

### What lands on the entry

```json
{
  "level": "audit", "message": "eCheq emitido", "service": "payments",
  "retention": "OPERACIONES",
  "retentionUntil": "2032-08-20T12:00:00.000Z",
  "retentionRules": { "years": 6, "standard": "BCRA A7724 9.1", "policyVersion": "E6-1" }
}
```

| Field | Always? | What it is for |
| --- | --- | --- |
| `retention` | yes | the class name — the low-cardinality string Loki label matchers, Datadog index filters and sink routing all match on. **Always a string**: a field that is sometimes an object is a mapping conflict at ingest. |
| `retentionUntil` | when the policy declares whole `years` | the end of the mandatory window, materialized so a sweep is a range scan. Not an expiry — reaching it ends the obligation, it does not authorize deletion. |
| `retentionRules` | opt-in | the rules as filed, stamped with `policyVersion`. For consumers **out of process** that cannot resolve a name. |

```typescript
await syntropyLog.init({
  retentionPolicies,
  retention: { version: 'E6-1', emitRules: true },  // both default to off / on respectively
});
```

An in-process sink does not need `emitRules`: it resolves the name at write time against the same
frozen registry, which *is* the rule in force at that instant. The mutable-catalog hazard is about
resolving **later**, at read time — not about expanding in the transport as the row is written.

### Resolving a policy without a logger

Sometimes the retention rule has to be stored as a **field of a record the framework never sees** —
an audit journal whose domain path writes straight to the database, with no logger in it. Resolving
the rule later from a mutable catalog table does not satisfy an auditor: a record written in 2026 and
read in 2030 would report the 2030 policy. It has to land in a column, at write time.

`getRetentionPolicy(name)` reads the **same frozen registry** `withRetention(name)` resolves against,
and fails the same way — one source, one answer, whichever way you ask:

```typescript
const policy = syntropyLog.getRetentionPolicy('SOX_AUDIT_TRAIL');
// -> { years: 5, region: 'us-east-1' }   (throws RetentionPolicyNotFoundError on a miss)

await auditRepo.insert({
  ...record,
  retention: policy,                                   // the rule, filed with the record
  retention_until: addYears(record.at, policy.years),  // the same rule, indexable
});

syntropyLog.getRetentionPolicies();  // the frozen registry — listing, diagnostics, catalog seeding
```

Do **not** read `getConfig().retentionPolicies?.[name]` for this: that is the caller's live config
object, not the factory's frozen copy, and a miss returns `undefined` — which reaches a compliance
column as `NULL` with nothing to detect it. Both accessors require `init()` to have completed.

Two properties matter once a policy is *persisted* rather than only tagged:

- **Keep it flat.** The accessor returns the object intact, but the same policy read off
  `entry.retentionRules` inside a transport is shallow on the native path — nested values arrive as JSON
  strings. A flat object reads identically on both paths.
- **Keep it JSON-serializable.** A `Date`, a `BigInt` or a class instance survives the tag path and
  then breaks a `jsonb` insert or an OTLP export.

Resolution is not enforcement: the framework tags and routes; archiving and deleting stay with the
storage tier. Runnable example: `examples/RetentionResolutionExample.ts` (`npm run example:retention`).

### Inline rules — when the policy is ad-hoc

```typescript
const oneOffLogger = baseLog.withRetention({
  policy: 'temporary-export',
  ttl: 86_400,
  archiveAfter: 3_600,
});
```

Inside your transport's `executor`, route by `entry.retention` — the class name:

```typescript
async executor(entry) {
  const table = entry.retention === 'SOX_AUDIT_TRAIL' ? 'audit_long_term' : 'logs_hot';
  await db.insert(table, { ...entry, keep_until: entry.retentionUntil });
}
```

Inline rules carry no name, so they land on `entry.retentionRules` and route on whatever field you
put in them (`entry.retentionRules?.policy`).

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
