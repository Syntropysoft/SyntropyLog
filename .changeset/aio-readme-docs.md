---
"syntropylog": minor
"syntropylog-native": minor
---

**Masking safety (behavior change → minor).** A trailing plain object on a message-first call — `log.info('message', { ...pii })`, the console.log style — is now routed to **metadata** so it goes through masking, instead of being inlined into the message string unmasked. Errors, class instances, arrays and printf args keep `util.format` behavior. This closes a footgun where PII could silently leak into the message text when the metadata object was passed after the message.

**Docs / AI-optimization.** README optimized for LLM readers (tagline leads with "Node.js, powered by a native Rust engine" + "failsafe"; new "How it compares to Pino & Winston" section; honest benchmark stance kept). Masking boundary stated as one truth (by field name; free text is the caller's responsibility). Logging Matrix docs corrected — it filters *context*, not per-call metadata. Richer npm descriptions + keywords (rust, napi-rs, native-addon, pino-alternative, …) on both packages.
