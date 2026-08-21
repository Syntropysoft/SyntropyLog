---
"syntropylog": major
---

Retention travels as a class name, not as a rules object.

`withRetention('NAME')` now binds `retention` as the policy **name** (a low-cardinality string —
what Loki label matchers, Datadog index filters and sink routing actually match on) plus
`retentionUntil`, the end of the mandatory window materialized so a sweep is a range scan. The full
rules are opt-in via `init({ retention: { emitRules: true, version } })`, stamped with
`policyVersion`. Inline `withRetention({ … })` binds `retentionRules`, never `retention`.

**Breaking, and invisible to the compiler:** a transport that read fields off `entry.retention`
(e.g. `entry.retention?.years`) still type-checks and still runs — it just reads `undefined` and its
routing silently stops matching.

**Migration** — either:

- turn on `retention: { emitRules: true }` and read `entry.retentionRules`, or
- resolve in the sink with `syntropyLog.getRetentionPolicy(entry.retention)`.

`DurableAdapterTransport` routing is unaffected: it recognizes a policy under either field.

Also added (additive): `getRetentionPolicy(name)`, `getRetentionPolicies()`,
`getRetentionUntil(name, at)` on the facade, the pure `retentionUntil(at, years)` helper,
`withMeta(field, payload)` with an explicit field name (the one-argument form is deprecated), and
the `ReservedMetaFieldError` / `RetentionEmissionConfig` exports.
