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

### §164.312(b) — audit controls

The Security Rule requires "hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use electronic protected health information."

**What the framework gives you:**

- **Recording:** `log.audit(...)` always emits regardless of the configured level threshold. The `DurableAdapterTransport` (see below) guarantees delivery for retention-tagged entries — the §164.312(b) auditor's worst case ("the record should exist but it doesn't") is closed by buffer + retry + DLQ.
- **Minimum necessary (45 CFR §164.502(b)):** the Logging Matrix excludes PHI from `info`/`warn` while keeping it available on `error` for diagnosis. PHI does not leak into operational logs by accident.
- **Routing to an HIPAA-segregated store:** `withRetention({ policy: 'HIPAA_AUDIT', years: 6 })` carries the policy with the entry; your executor routes to the BAA-covered backend.
- **Pseudonymization for non-audit logs:** the MaskingEngine with a `CUSTOM` strategy can hash patient identifiers in operational logs, leaving raw IDs only in the audit stream.

**What you still need to do:**

- The "examine activity" half of §164.312(b) is an *operational process* — log review, anomaly detection, alerting. The framework feeds your SIEM; the SIEM does the examination.
- BAAs (Business Associate Agreements) with your storage and SIEM vendors are an organizational responsibility.
- Retention enforcement (typically 6 years under §164.530(j)) is enforced at the storage tier.

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

### Section 404 — internal controls over financial reporting

§404 requires controls that ensure the integrity of records financial reporting depends on. For a logging framework the relevant claim is: *"we can demonstrate the audit trail is complete, tamper-evident, and reviewable."*

**What the framework gives you:**

- **Always-on `audit` level** — audit calls emit regardless of the configured threshold. An `info`-level production deployment cannot accidentally silence audit events.
- **Delivery guarantees via `DurableAdapterTransport`** — retention-tagged entries survive transient backend outages via buffer + retry + DLQ. The headline §404 risk ("the auditor asks for the record and we have nothing") is closed by the durable transport.
- **Routing via `withRetention({ policy: 'SOX_AUDIT_TRAIL', years: 7 })`** — policy metadata travels with the entry; your executor routes to an immutable store. §802 retention windows live at the storage tier.
- **Reviewable surface** — the Logging Matrix + masking rules + retention registry fit in a single JSON object that an auditor can read end-to-end without touching application code.

**What you still need to do:**

- Tamper-evidence is a *storage* property — use WORM buckets, append-only DBs, or signed/chained checksums. SyntropyLog delivers the record; immutability is on the storage layer.
- Retention enforcement (typically 7 years under §802) is a storage policy.
- §404 also requires *periodic management certification* of controls — a process the org owns. The framework supplies evidence, not approval.

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

### Records of processing activities (Article 30)

Art. 30(1) requires controllers to maintain records of processing activities including the name and contact details, purposes of processing, categories of data subjects and personal data, categories of recipients, transfers to third countries, retention periods, and a general description of technical/organizational measures. Art. 30(4) accepts these records in electronic form.

`withRetention` is a natural carrier for the per-entry portion of this record:

```typescript
const processingLog = log.withRetention({
  policy:               'GDPR_ART_30',
  processingActivity:   'order-fulfillment',
  purpose:              'contract performance',
  lawfulBasis:          'GDPR_6_1_b',
  dataCategory:         'customer-contact',
  dataSubjectCategory:  'eu-resident',
  recipientCategory:    'logistics-partner',
  retentionMonths:      36,
});

processingLog.audit(
  { customerId, orderId, action: 'shipped-to-partner' },
  'Personal data transferred to logistics partner',
);
```

**What the framework gives you:**

- Every entry tagged with the `GDPR_ART_30` policy carries the Art. 30 metadata your supervisory authority will ask for.
- The Logging Matrix ensures `info`/`warn` logs minimize personal data (Art. 5(1)(c)) while keeping the audit trail complete.
- Your executor can produce the Art. 30 register on demand by aggregating entries by `retention.processingActivity`.

**What you still need to do:**

- Art. 30 also requires the **organizational** parts of the record (DPO contact, transfer mechanisms description, security measures summary). Those live in your privacy notice and DPIA documentation, not in logs.
- Erasure (Art. 17) is a separate flow — see the Art. 17 subsection above.
- Lawful basis (Art. 6) is a per-processing decision your privacy team makes; the framework just carries the answer.

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

### Requirement 10 — track and monitor all access to cardholder data

PCI-DSS Req 10 is the most prescriptive of the four regulations covered here. It enumerates which events to log, which fields per event, and how the trail must be protected. The framework supplies primitives for each sub-control:

| Sub-req | What it asks | What the framework gives you |
|---|---|---|
| **10.1** Link all access to system components to each individual user | Logs must identify the human actor | Declare `userId` in the matrix for `audit`; combine with `withSource('OrdersService')`. Never log on a shared service identity for cardholder-data-adjacent actions |
| **10.2** Implement automated audit trails for specific events: user access to CHD, root/admin actions, audit-log access, invalid logical access attempts, identification/authentication mechanism use, initialization of audit logs, creation/deletion of system-level objects | The right events must reach the audit store | Call `log.audit(...)` at each of these points. `DurableAdapterTransport` guarantees delivery; the matrix declares which fields surface |
| **10.3** Record at minimum: user identification, type of event, date/time, success/failure indication, origination of event, identity/name of affected data | Per-event fields are non-negotiable | Declare them in the Logging Matrix for `audit` — `userId`, `eventType`, `timestamp` (framework-managed), `success`, `sourceIp`, `affectedResource`. Anything not in the matrix doesn't appear |
| **10.5** Secure audit trails so they cannot be altered (limit viewing, protect from modification, promptly back up to a centralized log server) | Storage-side controls | Out-of-scope for the logger. Your executor + storage backend (WORM bucket, signed log shipper, restricted IAM) implements this. `withRetention({ policy: 'PCI_DSS_REQ_10' })` routes to that backend |
| **10.6** Review logs and security events at least daily | Operational process | Out-of-scope for the logger. Your SIEM does the review; the framework guarantees the events arrived |
| **10.7** Retain audit trail history for at least one year, with three months immediately available | Tiered retention | `withRetention({ policy: 'PCI_DSS_REQ_10', years: 1, hotMonths: 3 })` carries the metadata; your storage tier (hot DB → cold archive) enforces the windows |

```typescript
const pciLog = log
  .withSource('PaymentTokenizer')
  .withRetention({ policy: 'PCI_DSS_REQ_10', years: 1, hotMonths: 3 });

pciLog.audit(
  { userId, eventType: 'card.tokenize', success: true, sourceIp: req.ip, affectedResource: `pan:****-${last4}` },
  'PAN tokenized',
);
```

**What you still need to do:**

- 10.5 (secure storage) and 10.6 (daily review) are operational and storage-side controls — the framework cannot satisfy them by itself.
- Time synchronization (Req 10.4) is a host-level concern (NTP); the framework reads `Date.now()` like everything else.
- The PCI audit must include physical/network access events that originate outside your Node process — those reach the audit store via other shippers, not via SyntropyLog.

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

**Out of scope:** disk and Redis spillover, persistent recovery on restart. The `onDrop` hook + a local file (as above) is the recommended durable boundary.

**Backend adapters:** SyntropyLog deliberately does not ship concrete backend adapters (`pg`, `@aws-sdk/*`, `mongodb`, `@elastic/elasticsearch`, etc.). The `executor` function — typically 10–20 lines — is the integration point. This keeps the framework independent of client-library versions and storage flux. Recipe snippets for common backends may land as docs in the future, but as docs, not as packages. See [transports.md](transports.md) for the executor contract.

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
