# TODO — SyntropyLog

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
