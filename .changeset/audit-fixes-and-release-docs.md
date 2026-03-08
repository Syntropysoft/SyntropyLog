---
"syntropylog": patch
---

- **MaskingEngine**: On masking failure (timeout/error), return a safe fallback payload with `_maskingFailed` and allowed keys only (`level`, `timestamp`, `message`, `service`) instead of raw metadata to avoid leaking sensitive data.
- **RedisConnectionManager**: Call `removeAllListeners()` when client was never open in `disconnect()` to avoid listener leaks.
- **RedisManager**: Clear `instances` and `defaultInstance` in `shutdown()` after closing connections.
- **Docs**: Add AUDITORIA_TECNICA.md (audit summary and production checklist), CONTRIBUTING section on releases and changesets.
