---
'syntropylog': minor
---

Export the `SyntropyLogState` type.

`getState()` and `SyntropyLogStats.state` are both public and both return this lifecycle union
(`'NOT_INITIALIZED' | 'INITIALIZING' | 'READY' | 'ERROR' | 'SHUTTING_DOWN' | 'SHUTDOWN'`), but the
type itself was not exported: a consumer could read the value and never name it — no explicit
annotation, no exhaustive `switch` over the states, no way to type a helper that takes one.
Additive: one type export, no runtime change, no value export added.
