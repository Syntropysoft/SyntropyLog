---
"syntropylog": minor
"syntropylog-native": minor
---

Masking is now data-driven and consistent across both engines. Fixes a security gap where the native (default) path masked only secret-type keys and let `email`/`phone`/`ssn`/`credit-card` through in cleartext. Masking strategies are now declarative `MaskSpec` objects interpreted by one primitive per engine (JS + Rust), kept in lockstep by a shared parity fixture; the rule set has a single source (the MaskingEngine). Identifiers keep a format-preserving partial mask (last 4), credentials are fully `[REDACTED]`. Declarative custom masks (a rule's `spec`) now run in the native engine too. New public API: `applyMask`, `strategyToSpec`, type `MaskSpec`. A rule the native engine cannot honor (incompatible regex, or a custom JS function) transparently falls back to the JS engine — never silently skipped.
