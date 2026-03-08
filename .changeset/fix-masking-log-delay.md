---
"syntropylog": patch
---

**Fix: ~3–6s delay per log call (logger.info/warn/error)**

- **Cause**: `MaskingEngine` used the `regex-test` package for every key×rule check. That package runs each test in a child-process worker with a single queue, so many sequential IPC round-trips added up to several seconds per log.
- **Change**: Built-in default rules (password, email, token, credit_card, SSN, phone) now use synchronous `RegExp.test()` in-process; they use safe, known patterns with no ReDoS risk. Custom rules added via `masking.rules` still use `regex-test` with timeout for safety.
- **Result**: Log calls complete in milliseconds again. README documents the behavior under "Data Masking → Performance".
