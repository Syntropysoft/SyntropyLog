# The history of SyntropyLog

This repository's git tree tells a messy story on purpose. SyntropyLog was not designed as a
framework — it **became** one, and the tree is the evidence: a frantic first month, five months of
silence, a rebirth where most of the original ideas died, and a maturity where what survived was
hardened. We keep the whole history intact (npm provenance points at these commits, and honest
evolution is better marketing than a repo that pretends it was born perfect). This file is the map.

---

## Epoch 1 — Genesis (July–August 2025)

> It started as *answering a log*. Then things kept getting added, and it turned into a
> traceability framework: carry the logs, generate a `correlationId`.

- `b4545e8` (2025-07-07) — first commit. **149 commits followed in that first month.**
- The early framework was *heavy by ambition*: a managed **Redis** client lived inside
  (`BeaconRedis`), adapters multiplied per backend, and versions flew — v0.5.9 ("robust
  serialization pipeline", `3cfe356`), v0.6.14 "Testing Revolution", v0.6.16 "Silent Observer"
  (`ad56b26`), v0.7.0 "enterprise security" (`68aff34`) — four minor lines in three weeks.
- Two ideas from this epoch survived everything that came later: **the correlationId as the
  heart of the system**, and the **Silent Observer** principle (logging must never crash the app).

## The silence (September 2025 – January 2026)

Zero commits for five months. The library was working in production, but the weight problem was
already clear: too many dependencies, managed backends that didn't belong in a logging pipeline,
and a package that took megabytes to install.

## Epoch 2 — The rebirth (February–March 2026)

**What SyntropyLog is today gestated here.** The rebirth was subtractive: almost everything the
genesis built was removed, and what remained got a spine.

- `2bd1241` (2026-02-27) — **v0.8.0: the UniversalAdapter is born** (plus the always-on audit
  level). Every per-backend adapter dies into one executor pattern: the framework routes entries,
  **you** own the I/O. This is the moment "no managed backends" became doctrine.
- Late February — modernization sweep: Node 20 baseline, pnpm, flat ESLint config.
- `9316606`/`cc2099b` (2026-03-07) — v0.9.11: memory leak fixed, ReDoS patched, and the
  **Redis remnants swept out**. The managed Redis was already conceptually dead; here it left
  the building.
- `57c0c73` (2026-03-08) — v0.9.17: **package size 6.7 MB → 1.4 MB.** The "le fui sacando
  librerías" release. The core has been dependency-free since.
- `6012ba5`→`a38c86c` (2026-03-13/14) — the **Rust addon** (`syntropylog-native`) lands:
  single-pass serialize+mask+sanitize with circular-ref detection. Its reason to exist is
  Node-specific: the pipeline runs synchronously, and the addon keeps that work **off the event
  loop's back**. It is an accelerator, never a requirement — the JS fallback stays at parity.
- `1a08202` (2026-03-17) — v0.12.2 documents the Universal Adapter as the extension surface.

## Maturity (May–July 2026)

- `b1b2c77` (2026-05-26) — `DurableAdapterTransport`: buffer + backoff + DLQ, delivery
  guarantees for audit entries.
- `ab158da` (2026-05-31) — the **honest benchmark** discipline is written down: Pino/Winston are
  a no-masking *reference* for the full pipeline, not a head-to-head; head-to-head is legit only
  for minimal logging.
- **2026-06-13 — `syntropylog@1.0.0` + `syntropylog-native@1.0.0` published to npm** with
  provenance, after ~a year of work. 1.1.0 (PII fix), 1.2.0, 1.3.0 followed within a month.
- The **family** grew from the canon: **sl4n** (.NET, rides on MEL), **slpy** (Python),
  **syntropylog-java** (rides on SLF4J/Logback) — each mounting on its platform's standard, each
  asserting the shared masking parity fixture. Example 22 closed the circle: one correlationId
  traveling across JS + Python + .NET services.

---

## What the evolution distilled (the principles, and where they came from)

| Principle | Born from |
|---|---|
| **Not a logger — a traceability pipeline** | the original job: carry logs, generate a correlationId |
| **Dependency-free core** | the weight crisis; the 6.7→1.4 MB release made it doctrine |
| **No managed backends — adapters are yours** | the death of BeaconRedis and the per-backend adapters into the UniversalAdapter |
| **Silent Observer — logging never throws** | epoch 1, one of the two ideas that survived it |
| **Native addon optional, never required** | Rust exists for Node's event loop, not for correctness — so ports ship without it |
| **Masking is the source's job, not the collector's** | the polyglot work (example 22): mask before the log leaves the process |
| **Mount on the platform's standard** | the family ports: JS had nothing to mount on and paid the price of building everything — nobody else should |

The old code is gone; the lessons are load-bearing. That is why the tree stays.
