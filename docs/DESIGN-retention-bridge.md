# Retention as a declarative bridge

**Status:** implemented (2.0.0) · **Type:** behavioural change (major) · **Affects:**
`Logger.withRetention`, `init()` config, facade accessors, docs

Retention is **enforced per container** — an Elasticsearch index, a Splunk index, a Loki stream, a
Cloud Logging bucket, an S3 prefix under Object Lock. It is **decided per record**: this transfer is
a six-year regulatory event, that health check is noise for thirty days. Nothing downstream can
infer which is which, and the application, at the moment of writing, is the only place where the
answer exists.

That gap is what this framework can close: carry the retention class from where it is known to where
it is applied. Everything else in this document follows from that one sentence.

---

## 1. The gap is structural, not a tooling accident

| System | Granularity of enforcement | What drives it |
| --- | --- | --- |
| Elasticsearch ILM | index | index name / rollover alias |
| Splunk | index | index routing at ingest |
| Grafana Loki | stream | **label matchers** |
| Datadog | index (3–15 days) + archives | **query over attributes** |
| Cloud Logging | bucket | **sink filter over the entry** |

Two things follow from that column on the right:

1. **The mechanism downstream consumes a low-cardinality string.** A label, a facet, a filter term.
   Not a rules object — no ingestion tier anywhere reads `{ years: 6, standard: '…' }` and acts on it.
2. **The record must carry the class at write time.** After ingestion the class is unrecoverable
   without re-deriving it from the payload, which is exactly the derivation the storage tier cannot do.

Practitioners hit this per application and solve it by hand: privacyIDEA has a standing request for
*different retention times for different audit entries*; Metabase's answer to unbounded audit tables
is a single global "max retention days" that deletes rows uniformly. The need is real, it is asked
for by name, and it is being solved one application at a time inside application code.

## 2. The class is also what makes deletion possible

Retention is only half the job. GDPR erasure against an audit-trail mandate is not resolved by date —
it is resolved **by class**: which records are held under a legal obligation (preserve, flag for
review) and which are not (erase). Over-retention is its own compliance failure. Whoever runs that
query in four years will run it against **the class name**, so:

- The name must be findable — low cardinality, stable, facetable.
- **The name is a contract.** Renaming a class orphans every record already written under it. Names
  are never recycled; when the *rules* behind a name change, the change is recorded by stamping the
  policy set with a version (§4) rather than by minting a new name.

## 3. What SyntropyLog did before 2.0

`withRetention(name)` resolved the name against the registry and bound the **rules object**. The
name — the only artifact the downstream mechanisms can consume — was discarded at the first hop, and
every transport received the same nested object, which is:

- the documented anti-pattern for the APM ingest tiers (nested attributes inflate cardinality; the
  guidance is to flatten essentials to top level),
- useless to an index/stream/bucket router, which needs a term to match,
- and already flattened to JSON strings by our own native path.

So the old default served exactly one consumer — the transport that persists the rules — and
mis-served every other one.

## 4. The model as shipped

**The class name always travels. The window is materialized. The rules are opt-in.**

```ts
await syntropyLog.init({
  retentionPolicies,                                // the app's own catalog, one source
  retention: { version: 'E6-1', emitRules: false }, // emitUntil defaults to true
});
```

| Field | Always? | Why |
| --- | --- | --- |
| `retention` | yes | the class name — what label matchers, index filters and sink routing match on. **Always a string**: a field that is a string on some entries and an object on others is a mapping conflict at ingest, and the record is rejected. |
| `retentionUntil` | when the policy declares whole `years` | a scalar anything can range-scan — an ILM policy, a lifecycle rule, a cron, a legal-hold query — without understanding policies at all. Not an expiry. |
| `retentionRules` | opt-in | the rules as filed, stamped `policyVersion`. For consumers **out of process** that have no registry to resolve against. |

**What the earlier draft got wrong, and why the per-transport split was dropped.** The draft proposed
`retention.expandTransports`, rendering the rules only for named sinks. It is unnecessary: an
in-process sink resolves the name with `getRetentionPolicy(name)` **at write time**, against the
frozen registry of the running process — which *is* the rule in force at that instant. The
mutable-catalog hazard is about resolving **later**, at read time; expanding inside the transport as
the row is written has none of it. Dropping the split also drops the expensive part: on the native
path the entry is already a serialized string, so stripping a field for one transport means
serializing twice.

**Where `retentionUntil` came from.** A production audit journal (BCRA A7724 §9.1) materializes
`retention_until` as its own column so the sweep is a range scan and not a jsonb parse, and pins the
leap-day rule to keep a record one day longer rather than one day short. That is not application
trivia — it is the half of the bridge that makes the label actionable, and every audit-writing app
reimplements it. The framework computes it once, correctly: `retentionUntil(at, years)` (pure) and
`getRetentionUntil(name, at)` (resolves, then computes).

**Why `policyVersion`.** Registries are re-seeded — in that same production system, with
`ON CONFLICT DO UPDATE` on every deploy. A persisted rule without a revision stamp cannot say which
version it was filed under, which is the question an auditor asks in 2032. Stamping the *policy set*
with one version beats versioning every policy name.

## 5. Non-goals

- **No enforcement.** Locking lives in the store (S3 Object Lock, Azure immutable containers), where
  a *mutable* policy mode is explicitly unfit for compliance-grade audit data. The framework labels
  and routes; the store enforces — and the store does not remember which rule was in force, which is
  why the journal gets the object.
- **No inference.** The framework never guesses a class from the payload.

## 6. Decisions taken

1. **Default = the name string.** Confirmed as a major. Migration for a transport that read
   `entry.retention` as an object: turn on `emitRules` and read `entry.retentionRules`, or resolve
   in the sink with `getRetentionPolicy(entry.retention)`.
2. **Inline rules bind `retentionRules` only** — no name to route on, and `retention` stays a string
   for every entry. They still get a window when they declare whole `years`.
3. **No date is ever guessed.** A policy with no whole `years` (a `ttl`, a unit the framework does
   not own) gets no `retentionUntil`. A wrong date in a compliance column is worse than no date.

## 7. Test coverage (`tests/logger/retentionBridge.test.ts`)

- registered name → `retention` is the string, `retentionRules` absent by default.
- `retentionUntil` materialized from whole `years`; absent for a policy that declares none.
- `emitRules: true` → the rules object, stamped with `policyVersion`.
- inline rules → `retentionRules` only, `retention` never an object; window still computed.
- untagged entries untouched.
- `getRetentionUntil`: resolves, computes, `null` without usable years, throws on an unknown name.
- the pure helper: leap day keeps the record one day longer; 0 / negative / fractional / invalid
  date all return `null`.
- `DurableAdapterTransport` recognizes a policy under either field.

## 8. Versioning

Major, for the default rendering only. The registry, `withRetention`, `getRetentionPolicy` and the
transport contract are unchanged.

---

## Appendix — evidence

- ILM manages *indices, not documents* — https://medium.com/kocsistem/ilm-is-not-your-retention-policy-why-logs-dont-age-gracefully-5955dee01ce8
- Loki per-stream retention via label matchers — https://grafana.com/docs/loki/latest/operations/storage/retention/
- Datadog indexes: query-driven retention, 3–15 days, archives beyond — https://docs.datadoghq.com/logs/log_configuration/indexes/
- Datadog log management best practices (flatten, watch cardinality) — https://docs.datadoghq.com/logs/guide/best-practices-for-log-management/
- OpenTelemetry general log attributes — no retention/compliance convention exists to reuse — https://opentelemetry.io/docs/specs/semconv/general/logs/
- privacyIDEA #780 — different retention times for different audit entries — https://github.com/privacyidea/privacyidea/issues/780
- Metabase #72985 — global max-retention-days as the only lever — https://github.com/metabase/metabase/issues/72985
- Right to be forgotten vs audit-trail mandates — https://axiom.co/blog/the-right-to-be-forgotten-vs-audit-trail-mandates
- Azure immutable (WORM) containers: mutable policy mode unfit for compliance — https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-container-level-worm-policies
- Related, already shipped: [DESIGN-retention-resolution-api.md](DESIGN-retention-resolution-api.md), [compliance.md](compliance.md), [fluent-api.md](fluent-api.md)
