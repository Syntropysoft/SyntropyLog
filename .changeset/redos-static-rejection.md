---
"syntropylog": minor
---

**ReDoS: explosive custom key patterns are now rejected at init (the JS path had no real defense).** Measured on V8: `(a+)+$` hangs the event loop forever at 40 chars — far below the 256-char key cap that was the only guard, and no timeout is possible because V8 regex execution is uninterruptible (the old `testRegexWithTimeout` never had one). Three changes, all init-time or fail-closed:

- `addRule()` now runs a **static ReDoS check** (zero-dependency star-height analysis) on every custom key pattern and **throws a clear `TypeError`** on nested unbounded quantifiers (`(a+)+`, `([a-z]+)*`) and counted repetition of unbounded bodies (`(.*a){25}`). Default rules are unaffected; safe custom patterns are unaffected. If you had such a pattern configured, init now fails fast instead of your process being one crafted log key away from a permanent hang.
- Over-long keys (>256 chars) are **truncated instead of skipped** when matching custom rules — skipping was fail-open (a long key named `…password…` went unmasked).
- `regexTimeoutMs` is deprecated and documented as never-enforced (kept for config compatibility).

Known residual (documented, pinned by a test): overlapping alternation like `(a|a)*` is not statically detectable without NFA analysis. The full elimination remains the declarative path — spec-based rules cross to the native Rust engine, whose `regex` crate is linear-time and cannot ReDoS.
