# Compliance — HIPAA, SOX, GDPR, PCI-DSS

SyntropyLog is designed around the assumption that **compliance reviews configuration, not code**. This document maps the framework's primitives to the four regulatory regimes most teams ask about.

The four primitives that do the work:

- **[Logging Matrix](logging-matrix.md)** — declarative whitelist of which context fields appear at which log level.
- **[MaskingEngine](masking.md)** — redaction of sensitive fields before any transport.
- **`audit` level + `withRetention`** — see [fluent-api.md](fluent-api.md).
- **[Universal Adapter](transports.md)** — routes entries by metadata to the right backing store.

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

## A note on what SyntropyLog does *not* do

- It does not **encrypt** logs in transit or at rest — that's your transport's responsibility (TLS to your aggregator, server-side encryption on the store).
- It does not **store** logs — the Universal Adapter just hands you the entry; durability and immutability are storage-layer concerns.
- It does not **certify** anything — no logger can. SyntropyLog gives you reviewable, declarative controls that make a certification audit *much* shorter.

The framework's job is to make sure the right data, with the right policy metadata, arrives at the right backend. The auditable surface — Logging Matrix, masking rules, retention policies — is a small, declarative JSON object that fits on a screen.
