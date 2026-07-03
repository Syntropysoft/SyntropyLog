# Plan — disk persistence for `DurableAdapterTransport` (survives restart)

Working branch: **`develop`**.

## Goal

Close the gap the transport header itself calls out: *"Out of scope for v1: disk and Redis spillover,
persistent recovery on restart."* Today `DurableAdapterTransport` is durable **only in memory** — a
process crash loses the buffered audit backlog. This adds **opt-in disk persistence** so retention-
tagged entries survive a restart, porting the self-emptying-spool philosophy proven in **sl4n**
(`DurableFileTransport`): the disk holds only the undelivered backlog and deletes itself when drained
— a buffer, not an archive. No rotation, no cleanup to maintain.

## Design (Option A — extend the existing transport)

New option **`persistPath?: string`**. Absent ⇒ behavior is **100% unchanged** (backward compatible).
When set:

- **Write-ahead.** Every entry taken onto the durable path is appended to the spool (JSONL) —
  **async** (`fs.promises`), serialized through a single write chain so appends never interleave and
  never block the event loop.
- **Recovery on startup.** The constructor reads the spool **once, synchronously** (startup cost, not
  the hot path — mirrors sl4n), re-enqueues its entries, and kicks the drain.
- **Self-emptying.** When the in-memory queue fully drains (every entry delivered or DLQ'd), the spool
  file is **deleted**. During an outage entries accumulate on disk (persisted); on recovery they drain
  and the file disappears. Never grows unbounded beyond the live backlog; no rotation.
- **DLQ preserved.** `onDrop` still fires (buffer-full / retries-exhausted). A DLQ'd entry is off our
  hands (operator's responsibility) → removed from the spool by the drain's clear-on-empty.

**Invariant:** the spool at rest ⊇ the undelivered in-memory queue → **no loss** (at-least-once). A
crash mid-delivery re-delivers the current spool on restart, so audit executors should be idempotent.

## .js salvedades (intentional)

- **Async disk I/O** (`fs.promises`, serialized) — the sync `log()` never blocks the event loop.
  There is a tiny window (entry in memory, append not yet flushed) where a crash loses that one entry;
  documented. A future `syncWrites: true` could close it for the paranoid.
- **Sync recovery** at construction — one-time startup cost, acceptable.
- **`node:fs` only** — no new dependency (respects "zero runtime deps"). **Disk ≠ network** — respects
  "no network I/O at runtime". Fully **opt-in**.
- On a spool write failure, degrade gracefully to in-memory-only (silent observer) — the entry is
  still queued and will be delivered/retried.

## Steps

- [ ] 1. Options + fields: `persistPath`, a `diskChain: Promise<void>`, `node:fs` import.
- [ ] 2. `appendSpool(entry)` — chained async append; call it from `enqueue()` (durable path only).
- [ ] 3. `clearSpool()` / `rewriteSpool(remaining)` — chained; call `clearSpool()` when the drain
      empties the queue, and after `flush()` settles.
- [ ] 4. `recover()` — sync read in the constructor: parse JSONL → enqueue → `void this.drain()`.
- [ ] 5. Tests (vitest, temp dir): survives "restart" (2nd instance recovers the spool), self-empties
      on drain, no `persistPath` ⇒ zero disk behavior (existing tests still green), spool-write failure
      degrades gracefully.
- [ ] 6. Docs: README durable section + `docs/transports.md` note (opt-in, at-least-once, idempotency).

## Files

- `src/logger/transports/DurableAdapterTransport.ts` — the enhancement.
- `tests/logger/transports/DurableAdapterTransport.persistence.test.ts` — new tests (keep the existing
  test file untouched).
- README + `docs/transports.md` — the opt-in note.
