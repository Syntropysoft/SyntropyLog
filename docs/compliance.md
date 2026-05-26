# Compliance — HIPAA, SOX, GDPR, PCI-DSS

SyntropyLog is designed around the assumption that **compliance reviews configuration, not code**. This document maps the framework's primitives to the four regulatory regimes most teams ask about.

The five primitives that do the work:

- **[Logging Matrix](logging-matrix.md)** — declarative whitelist of which context fields appear at which log level.
- **[MaskingEngine](masking.md)** — redaction of sensitive fields before any transport.
- **`audit` level + `withRetention`** — see [fluent-api.md](fluent-api.md).
- **[Universal Adapter](transports.md)** — routes entries by metadata to the right backing store.
- **`DurableAdapterTransport`** — opt-in delivery guarantees for retention-tagged entries: in-memory buffer + exponential-backoff retry + DLQ. The compliance-grade alternative to fire-and-forget. See the section below.

---

## HIPAA — data minimization

The Logging Matrix is the framework's answer to data minimization (45 CFR §164.502(b)). Define which PHI-related fields are eligible at each level:

```typescript
loggingMatrix: {
  default: ['correlationId'],
  info:    ['correlationId', 'operation'],
  warn:    ['correlationId', 'operation', 'errorCode'],
  error:   ['correlationId', 'operation', 'errorCode', 'patientId'],
}
```

- Information that doesn't aid diagnosis at `info` level (e.g. `patientId`, `diagnosis`, `mrn`) is excluded from those entries by configuration, not by developer discipline.
- `error`-level entries can include the identifiers a clinician or engineer needs to investigate.
- Pair with masking rules for any free-text field that might contain PHI.

The matrix is a single JSON object — reviewable by a compliance officer without reading TypeScript.

---

## SOX — audit trails

The `audit` log level is **always written** regardless of the configured level. Combined with `withRetention`, you get a routed audit trail:

```typescript
const auditLog = syntropyLog
  .getLogger()
  .withSource('PaymentApproval')
  .withRetention({ policy: 'SOX_AUDIT_TRAIL', years: 7 });

auditLog.audit(
  { userId: managerId, action: 'manager.override', amount: 50_000 },
  'Manual override applied',
);
```

In your transport's `executor`, the `retention.policy` value routes the entry to the long-retention store:

```typescript
async executor(entry) {
  if (entry.retention?.policy === 'SOX_AUDIT_TRAIL') {
    await auditDb.insert(entry);  // append-only, immutable, 7-year retention
    return;
  }
  await hotDb.insert(entry);      // standard 30-day retention
}
```

The audit trail is tamper-evident at the storage layer (append-only, WORM bucket, etc.); SyntropyLog's job is to guarantee the entry **arrives** and carries the policy metadata.

---

## GDPR

### Right to erasure (Article 17)

`withRetention` lets you tag entries that are subject to erasure requests:

```typescript
const gdprLog = log.withRetention({
  policy: 'GDPR_ARTICLE_17',
  subjectId: userId,
  years: 7,
});
gdprLog.audit({ action: 'data-export' }, 'GDPR export performed');
```

When an erasure request arrives, your storage layer queries for entries where `retention.subjectId` matches and removes them — without touching unrelated logs.

### Data minimization (Article 5(1)(c))

Same answer as HIPAA: use the Logging Matrix to restrict which fields surface at which levels.

### Pseudonymization (Article 32)

Use the MaskingEngine to pseudonymize identifiers in logs that are not part of the audit trail. Custom strategies let you hash, tokenize, or partial-mask:

```typescript
masking: {
  rules: [
    {
      pattern: /^userId$/,
      strategy: MaskingStrategy.CUSTOM,
      customMask: (value) => hashWithPepper(String(value)),
    },
  ],
}
```

---

## PCI-DSS

### Cardholder data (Requirement 3.3)

Default masking rules cover the obvious cases. The `CREDIT_CARD` strategy preserves the last four digits, which PCI-DSS explicitly permits:

```typescript
masking: {
  enableDefaultRules: true,   // covers `card`, `cardNumber`, `pan`, etc.
}
```

Card number `4111-1111-1111-1234` becomes `****-****-****-1234`.

### Audit logs (Requirement 10)

Combine `audit` + `withRetention` to ship a PCI audit stream to a dedicated store with the required one-year online retention and three-month immediate availability:

```typescript
const pciLog = log.withRetention({ policy: 'PCI_DSS_REQ_10', years: 1 });
pciLog.audit({ userId, action: 'card.tokenize' }, 'PAN tokenized');
```

---

## `DurableAdapterTransport` — delivery guarantees for audit-tagged logs

Compliance-grade frameworks have a problem the headline pitch tends to hide: **fire-and-forget audit logs**. A SOX or HIPAA auditor doesn't accept "the log probably arrived". `AdapterTransport`'s Silent-Observer semantics (drop the entry, fire `onError`) is the correct default for `info`/`warn` traffic — and exactly wrong for entries marked with `withRetention(...)`.

`DurableAdapterTransport` is the opt-in transport for retention-tagged entries. Same `executor` signature as `UniversalAdapter`, plus:

- **In-memory buffer** with a configurable cap (`bufferSize`, default 1000).
- **Exponential backoff retry** with configurable budget (`maxRetries` default 5, `initialBackoffMs` default 100, `maxBackoffMs` default 30s).
- **Dead-letter hook** (`onDrop(entry, reason, cause?)`) that fires when the buffer overflows or an entry exhausts its retry budget. **Operators must handle this hook** — a no-op `onDrop` defeats the compliance purpose of the transport.
- **Drop strategy** (`'oldest'` default, `'newest'`, `'reject'`) chooses which entry leaves the queue when the buffer is full.
- **Selective by default** — only entries with `retention` metadata go through the durable path. Plain `info`/`warn` logs stay fire-and-forget, matching `AdapterTransport`. Set `durableOnlyForRetention: false` to make every entry durable (pay attention to memory).
- **Shutdown drain** — `flush()` and `shutdown()` wait up to `flushTimeoutMs` (default 5s) for the buffer to empty, then DLQ the rest.

```typescript
import {
  AdapterTransport,
  DurableAdapterTransport,
  syntropyLog,
} from 'syntropylog';
import fs from 'node:fs';

const auditDlq = fs.createWriteStream('/var/log/audit-dlq.ndjson', { flags: 'a' });

const auditTransport = new DurableAdapterTransport({
  name: 'audit',
  executor: async (entry) => {
    await auditDb.insert(entry);   // your real audit store
  },
  bufferSize: 5000,
  maxRetries: 10,
  initialBackoffMs: 200,
  maxBackoffMs: 60_000,
  dropStrategy: 'oldest',
  onDrop: (entry, reason, cause) => {
    // Last-resort persistence. The auditor sees this file, not lost data.
    auditDlq.write(JSON.stringify({ entry, reason, cause: String(cause) }) + '\n');
  },
});

await syntropyLog.init({
  logger: {
    serviceName: 'payments-api',
    transports: [
      new AdapterTransport({ name: 'app', adapter: appAdapter }),  // fire-and-forget for info/warn/error
      auditTransport,                                                // durable for audit
    ],
  },
});

// Now audit calls get durability:
const audit = syntropyLog.getLogger().withRetention({ policy: 'SOX_AUDIT_TRAIL', years: 7 });
audit.audit({ userId, action: 'manager.override' }, 'Approval');
```

**Out of scope for v1:** disk and Redis spillover, persistent recovery on restart. Phase 3B will add `@syntropylog/adapter-postgres` (UPSERT-on-conflict with durable integration) and `@syntropylog/adapter-s3` (NDJSON batch, hourly rotation). For now, the `onDrop` hook + a local file is the durable boundary.

---

## Prototype pollution defense

`__proto__`, `constructor`, and `prototype` own-keys are stripped from log metadata at the entry to the serialization pipeline — defense-in-depth against payloads like `{ user: { __proto__: { isAdmin: true } } }` that downstream consumers might pass to `Object.assign` or similar.

This runs in the JS pipeline's `HygieneStep` with zero allocation on the safe path (no polluter keys present). The native (Rust) pipeline performs its own bounded property walk and is not vulnerable to the same vector.

If you have a *legitimate* use for a `constructor` field in your logs (rare), the framework can't tell the difference — the key gets stripped. Rename it (`ctor`, `className`) to keep it.

---

## A note on what SyntropyLog does *not* do

- It does not **encrypt** logs in transit or at rest — that's your transport's responsibility (TLS to your aggregator, server-side encryption on the store).
- It does not **store** logs — the Universal Adapter just hands you the entry; durability and immutability are storage-layer concerns.
- It does not **certify** anything — no logger can. SyntropyLog gives you reviewable, declarative controls that make a certification audit *much* shorter.

The framework's job is to make sure the right data, with the right policy metadata, arrives at the right backend. The auditable surface — Logging Matrix, masking rules, retention policies — is a small, declarative JSON object that fits on a screen.
