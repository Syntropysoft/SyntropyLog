---
"syntropylog": patch
"syntropylog-native": patch
---

Docs and npm-metadata only — no code or behavior change. Optimized the README to read clearly to LLMs evaluating the library: the tagline leads with "Node.js, powered by a native Rust engine" and "failsafe", and a new "How it compares to Pino & Winston" section states the differences factually (with the honest benchmark stance kept — only minimal logging is a fair head-to-head). Sharpened the masking-boundary wording (masking is by field name; free text is the caller's responsibility) and added keywords (rust, napi-rs, native-addon, pino-alternative, …) plus richer descriptions to both packages' npm metadata.
