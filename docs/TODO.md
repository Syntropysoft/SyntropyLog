# TODO — SyntropyLog

- [ ] **Reject a retention policy that cannot materialize a window — deferred, it is breaking.**
  A registered policy with no usable unit (`{ standard: 'SOX 802' }`), with both units
  (`{ years: 3, months: 6 }`), or with a non-integer count, registers today without complaint and
  then emits no `retentionUntil`. Those records are written, kept, and **invisible to every
  range-scan sweep** — the failure is silent, which is the expensive kind.

  The fix is to validate the registry in `init()` and refuse to start, the same way
  `masking.exemptTransports` refuses an unknown name. It is **not shippable as a minor**:
  `retentionPolicies` is typed `Record<string, Record<string, unknown>>`, the rules are explicitly
  freeform, and apps legitimately keep arbitrary metadata there. An app that boots today would
  stop booting — that is a major (2026-08-22, deferred out of 2.1.0).

  Three ways out, in order of preference:
  1. **Ship it in the next major.** Arguably a fix wearing a major's clothes: those apps are
     already broken, they just have not been told.
  2. **Opt-in first** — `retention: { strictPolicies: true }`, additive and therefore minor, made
     the default in the major. Downside: the people who most need it are the ones who do not know
     they have the problem, and they will not turn it on.
  3. **Warn without throwing.** Cheapest, and contradicts the reason the check exists.

- [ ] **`resolveUntil` callback for windows the library cannot express** — fiscal calendars,
  quarter-end alignment, jurisdiction rules, "until the dispute closes". Additive (minor), lives in
  `retention: {}` and not inside the policy rules, so `getRetentionPolicies()` keeps returning data
  and never functions. Mirrors the `spec` / `customMask` pair in masking: declarative first, escape
  hatch second, with its cost stated — it runs per retention-tagged entry, on the hot path. Must
  never throw to the caller: route failures through `onStepError` and emit no date, which keeps the
  record rather than sweeping it early.

- [x] **Retention as a declarative bridge** (major) — **hecho**: the class is decided per record and enforced per
  container (index / stream / bucket), and the mechanisms downstream consume a low-cardinality
  **string** — but `withRetention(name)` discards the name and binds the rules object, so every sink
  gets the one shape only the audit journal can use. Proposal: the name travels by default, the rules
  travel to the sinks named in `retention.expandTransports` (same mechanism and fail-loud as
  `masking.exemptTransports`). **Shipped instead:** the name always travels, `retentionUntil` is
  materialized by the framework, and the rules are a global opt-in (`retention.emitRules`) — the
  per-transport split was dropped because an in-process sink resolves the name at write time with
  `getRetentionPolicy()`. See [DESIGN-retention-bridge.md](DESIGN-retention-bridge.md).

- [x] **Retention resolution outside the logger**: `retentionPolicies` was only reachable through
  `Logger.withRetention(name)`, so a consumer whose write path never touches a logger could not resolve
  the policy it must persist. **Done:** `getRetentionPolicy(name)` (throws `RetentionPolicyNotFoundError`
  on a miss, like the fluent path) and `getRetentionPolicies()` (frozen registry) on the facade, both
  reading the factory's frozen copy. Design: [DESIGN-retention-resolution-api.md](DESIGN-retention-resolution-api.md).
  Example: `examples/RetentionResolutionExample.ts`.

- [x] **Sonar / aliases**: Do not write literals that Sonar flags (password, token, secret, etc.); use aliases in a single file.
  **Done:**
  - `src/sensitiveKeys.ts`: constants `MASK_KEY_PWD`, `MASK_KEY_TOK`, `MASK_KEY_SEC`, etc., holding the sensitive words. The rest of the codebase uses only these constants.
  - `MaskingEngine`, `DataSanitizer`, `SerializationManager`, `sanitizeConfig` use the aliases; no literals in those files.
  - `sonar-project.properties`: multicriteria exclusions (S2068) + `sonar.exclusions` includes `**/sensitiveKeys.ts` to skip analysis of the only file that contains the literals.
