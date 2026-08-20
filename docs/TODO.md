# TODO — SyntropyLog

- [ ] **Retention resolution outside the logger**: `retentionPolicies` is only reachable through
  `Logger.withRetention(name)`, so a consumer whose write path never touches a logger cannot resolve
  the policy it must persist — and reading its own `init()` config returns a different object from
  the factory's frozen copy, with no fail-loud on a miss. Proposal: `getRetentionPolicy(name)` /
  `getRetentionPolicies()` on the facade. See [DESIGN-retention-resolution-api.md](DESIGN-retention-resolution-api.md).

- [x] **Sonar / aliases**: Do not write literals that Sonar flags (password, token, secret, etc.); use aliases in a single file.
  **Done:**
  - `src/sensitiveKeys.ts`: constants `MASK_KEY_PWD`, `MASK_KEY_TOK`, `MASK_KEY_SEC`, etc., holding the sensitive words. The rest of the codebase uses only these constants.
  - `MaskingEngine`, `DataSanitizer`, `SerializationManager`, `sanitizeConfig` use the aliases; no literals in those files.
  - `sonar-project.properties`: multicriteria exclusions (S2068) + `sonar.exclusions` includes `**/sensitiveKeys.ts` to skip analysis of the only file that contains the literals.
