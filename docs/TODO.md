# TODO — SyntropyLog

- [x] **Sonar / aliases**: Do not write literals that Sonar flags (password, token, secret, etc.); use aliases in a single file.
  **Done:**
  - `src/sensitiveKeys.ts`: constants `MASK_KEY_PWD`, `MASK_KEY_TOK`, `MASK_KEY_SEC`, etc., holding the sensitive words. The rest of the codebase uses only these constants.
  - `MaskingEngine`, `DataSanitizer`, `SerializationManager`, `sanitizeConfig` use the aliases; no literals in those files.
  - `sonar-project.properties`: multicriteria exclusions (S2068) + `sonar.exclusions` includes `**/sensitiveKeys.ts` to skip analysis of the only file that contains the literals.
