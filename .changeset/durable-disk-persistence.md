---
"syntropylog": minor
---

**Durable transport survives a restart (opt-in disk persistence).** `DurableAdapterTransport` gains an opt-in `persistPath`: every accepted entry is write-ahead-logged to a JSONL spool (async, single write chain, never blocking the event loop), and the spool is replayed on startup so retention-tagged entries survive a process crash. The spool is a buffer, not an archive — it self-deletes when the queue fully drains. Delivery is at-least-once (crash mid-delivery re-delivers → the executor should be idempotent); a spool-write failure degrades to in-memory-only. Absent `persistPath`, behavior is 100% unchanged. `node:fs` only — zero new dependencies.
