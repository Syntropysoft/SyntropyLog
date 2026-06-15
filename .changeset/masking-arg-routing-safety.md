---
"syntropylog": minor
"syntropylog-native": minor
---

**Masking safety (behavior change → minor).** A trailing plain object on a message-first call — `log.info('message', { ...pii })`, the console.log style — is now routed to **metadata** so it goes through masking, instead of being inlined into the message string unmasked. This closes a footgun where PII could silently leak into the message text when the metadata object was passed after the message. Errors, class instances, arrays and printf args keep `util.format` behavior; both argument orders now mask (`info({obj},'msg')` and `info('msg',{obj})`).
