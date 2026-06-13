/**
 * @file src/logger/transports/DurableAdapterTransport.ts
 * @description A transport that gives compliance-grade delivery guarantees
 * for entries tagged with retention metadata.
 *
 * The framework's default Silent-Observer semantics — drop the entry, fire
 * the `onError` hook, keep the app alive — are correct for `info`/`warn`
 * traffic. They're catastrophic for `audit` logs that SOX, HIPAA, PCI-DSS,
 * or GDPR require to arrive. `DurableAdapterTransport` is the opt-in path
 * for those entries:
 *
 *   - **Buffered.** Entries land in an in-memory queue, not in the executor
 *     directly. A failing backend creates backpressure, not data loss.
 *   - **Retried.** Each entry is retried with exponential backoff up to
 *     `maxRetries`. Default budget is 5 attempts spaced 100ms → 1.6s.
 *   - **DLQ via `onDrop`.** When the buffer hits its cap or an entry
 *     exhausts its retries, `onDrop(entry, reason, cause?)` fires so the
 *     operator can persist the entry somewhere else (file, sidecar, audit
 *     bus). Not firing this hook is operator negligence; not silencing the
 *     event is the framework's job.
 *   - **Selective.** By default the durable path only activates for entries
 *     marked with `retention` (via `logger.withRetention(...)`). Plain
 *     `info`/`warn`/`error` logs go through the same fire-and-forget path
 *     as `AdapterTransport`. Set `durableOnlyForRetention: false` to make
 *     every entry durable — pay attention to memory if you do.
 *
 * Out of scope for v1: disk and Redis spillover, persistent recovery on
 * restart. Both will come as opt-in plugins in later phases — see the
 * Phase 3 plan.
 */

import { Transport, type TransportOptions } from './Transport';
import type { LogEntry } from '../../types';

/**
 * The executor signature mirrors `UniversalAdapter`'s but **must return a
 * Promise that rejects on failure** so the transport can retry. A `void`
 * synchronous executor is also accepted — it counts as immediate success.
 */
export type DurableExecutor = (entry: unknown) => Promise<void> | void;

/** Reason an entry was handed off to the DLQ via `onDrop`. */
export type DurableDropReason = 'buffer-full' | 'retries-exhausted';

/** Strategy used when the buffer is full and a new entry arrives. */
export type DurableDropStrategy = 'oldest' | 'newest' | 'reject';

export interface DurableAdapterTransportOptions extends TransportOptions {
  /**
   * The function that actually persists each entry. Must return a Promise
   * that rejects on failure for the transport to know it should retry. A
   * sync void executor is treated as immediate success.
   */
  executor: DurableExecutor;

  /**
   * Maximum entries the in-memory buffer holds before {@link dropStrategy}
   * kicks in. Defaults to `1000`.
   */
  bufferSize?: number;

  /**
   * Maximum retry attempts before sending the entry to the DLQ via
   * {@link onDrop}. The first delivery attempt is not counted as a retry —
   * `maxRetries: 3` means up to 4 total attempts (1 + 3). Defaults to `5`.
   */
  maxRetries?: number;

  /**
   * Initial backoff in milliseconds between retry attempts. Doubles on each
   * retry, capped at {@link maxBackoffMs}. Defaults to `100`.
   */
  initialBackoffMs?: number;

  /**
   * Cap on the exponential backoff. Defaults to `30000` (30 seconds).
   */
  maxBackoffMs?: number;

  /**
   * What to do when the buffer is full and a new entry arrives.
   *   - `'oldest'` (default): drop the entry at the front of the queue and
   *     accept the new one. Best for "newest data matters most" workloads.
   *   - `'newest'`: accept the new entry by dropping the most recently
   *     queued entry. Rare — useful if old entries are about to be retried.
   *   - `'reject'`: drop the incoming entry; keep the queue untouched.
   *     Best when an in-flight retry is more valuable than a fresh log.
   *
   * Whichever entry is dropped is reported via {@link onDrop} with
   * reason `'buffer-full'`.
   */
  dropStrategy?: DurableDropStrategy;

  /**
   * Dead-letter hook. Called whenever an entry leaves the queue without
   * being successfully delivered — either because the buffer was full
   * (`reason === 'buffer-full'`) or because the entry exhausted its retries
   * (`reason === 'retries-exhausted'`). The `cause` argument carries the
   * last error in the retries-exhausted case.
   *
   * **Operators MUST handle this.** A no-op `onDrop` defeats the
   * compliance purpose of the transport. If you don't have somewhere to
   * persist dropped entries, this transport is the wrong choice.
   */
  onDrop?: (entry: unknown, reason: DurableDropReason, cause?: unknown) => void;

  /**
   * If `true` (the default), the durable path only activates for entries
   * marked with `retention` metadata. Other entries go through a fire-and-
   * forget path identical to `AdapterTransport`. Set `false` to make every
   * entry durable.
   */
  durableOnlyForRetention?: boolean;

  /**
   * Maximum time `flush()` and `shutdown()` will wait for the queue to
   * drain before resolving. Defaults to `5000` (5s). After the timeout the
   * remaining entries are sent to {@link onDrop} with reason
   * `'retries-exhausted'`.
   */
  flushTimeoutMs?: number;
}

interface QueueItem {
  entry: unknown;
  attempt: number;
  lastError?: unknown;
}

/**
 * Type guard: does the entry carry retention metadata that signals it must
 * be delivered durably? Accepts both parsed `LogEntry` objects and the
 * pre-serialized JSON string the native pipeline produces.
 */
function hasRetention(entry: unknown): boolean {
  if (typeof entry === 'string') {
    // Cheap heuristic — the JSON path may contain "retention": somewhere
    // in the entry; we don't need to parse here because the JS pipeline
    // calls log() with an object (the native path is for the bundled
    // formatter, not directly to the adapter).
    return entry.includes('"retention"');
  }
  if (entry !== null && typeof entry === 'object') {
    return 'retention' in (entry as Record<string, unknown>);
  }
  return false;
}

/** Microsecond-granularity sleep helper based on setTimeout. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Durable transport. See file header for the full design.
 */
export class DurableAdapterTransport extends Transport {
  private readonly executor: DurableExecutor;
  private readonly bufferSize: number;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly dropStrategy: DurableDropStrategy;
  private readonly onDrop?: (
    entry: unknown,
    reason: DurableDropReason,
    cause?: unknown
  ) => void;
  private readonly durableOnlyForRetention: boolean;
  private readonly flushTimeoutMs: number;

  private readonly queue: QueueItem[] = [];
  private processing = false;
  private shuttingDown = false;

  constructor(options: DurableAdapterTransportOptions) {
    super(options);
    if (typeof options.executor !== 'function') {
      throw new Error('DurableAdapterTransport requires an executor function.');
    }
    this.executor = options.executor;
    this.bufferSize = options.bufferSize ?? 1000;
    this.maxRetries = options.maxRetries ?? 5;
    this.initialBackoffMs = options.initialBackoffMs ?? 100;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.dropStrategy = options.dropStrategy ?? 'oldest';
    this.onDrop = options.onDrop;
    this.durableOnlyForRetention = options.durableOnlyForRetention ?? true;
    this.flushTimeoutMs = options.flushTimeoutMs ?? 5_000;
  }

  public log(entry: LogEntry | string): void {
    // Filter by transport's own level first (parent class API).
    if (typeof entry !== 'string' && !this.isLevelEnabled(entry.level)) {
      return;
    }

    const goDurable = !this.durableOnlyForRetention || hasRetention(entry);

    if (!goDurable) {
      this.fireAndForget(entry);
      return;
    }

    this.enqueue(entry);
    // Kick the drain loop without blocking the caller. Errors inside the
    // drain are handled internally and surfaced via onDrop.
    void this.drain();
  }

  /**
   * Fire-and-forget path for non-retention entries when
   * `durableOnlyForRetention` is true. Matches `AdapterTransport`'s
   * semantics: any executor failure becomes an onDrop event for parity.
   */
  private fireAndForget(entry: unknown): void {
    try {
      const result = this.executor(entry);
      if (
        result !== undefined &&
        result !== null &&
        typeof (result as Promise<unknown>).then === 'function'
      ) {
        (result as Promise<void>).catch((err: unknown) => {
          // No retries on the fire-and-forget path — go straight to DLQ
          // so failures still surface, but without buffering.
          this.onDrop?.(entry, 'retries-exhausted', err);
        });
      }
    } catch (err) {
      this.onDrop?.(entry, 'retries-exhausted', err);
    }
  }

  /** Enqueue with drop-strategy handling when the buffer is full. */
  private enqueue(entry: unknown): void {
    if (this.queue.length < this.bufferSize) {
      this.queue.push({ entry, attempt: 0 });
      return;
    }

    switch (this.dropStrategy) {
      case 'reject': {
        this.onDrop?.(entry, 'buffer-full');
        return;
      }
      case 'newest': {
        // Drop the most recently queued entry (the tail).
        const dropped = this.queue.pop();
        if (dropped) this.onDrop?.(dropped.entry, 'buffer-full');
        this.queue.push({ entry, attempt: 0 });
        return;
      }
      case 'oldest':
      default: {
        const dropped = this.queue.shift();
        if (dropped) this.onDrop?.(dropped.entry, 'buffer-full');
        this.queue.push({ entry, attempt: 0 });
        return;
      }
    }
  }

  /**
   * Drain loop. Single-flight; concurrent callers are no-ops.
   *
   * The in-flight item is **removed from the queue** at the start of its
   * processing. Retries happen inline with exponential backoff — the item
   * is never re-queued. This isolates the in-flight item from the
   * buffer-overflow drop strategy: if a new entry arrives while we're
   * retrying, the drop sees only the queued items, never the one being
   * delivered. (Otherwise an "oldest" drop could yank the entry whose
   * promise was still in flight, corrupting outcomes.)
   */
  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) continue;

        await this.processOneWithRetries(item);
      }
    } finally {
      this.processing = false;
    }
  }

  /** Processes one queue item to completion (success or DLQ). */
  private async processOneWithRetries(item: QueueItem): Promise<void> {
    while (true) {
      try {
        const result = this.executor(item.entry);
        if (result !== undefined && result !== null) {
          await Promise.resolve(result);
        }
        return; // success
      } catch (err) {
        item.lastError = err;
        if (item.attempt >= this.maxRetries || this.shuttingDown) {
          this.onDrop?.(item.entry, 'retries-exhausted', err);
          return;
        }
        item.attempt++;
        const backoff = Math.min(
          this.maxBackoffMs,
          this.initialBackoffMs * 2 ** (item.attempt - 1)
        );
        await sleep(backoff);
      }
    }
  }

  /**
   * Waits for the buffer to empty or `flushTimeoutMs` to elapse. Remaining
   * entries after timeout are sent to {@link onDrop}.
   */
  public override async flush(): Promise<void> {
    const deadline = Date.now() + this.flushTimeoutMs;
    // Wait for both the queued items AND any in-flight item. The drain loop
    // removes the item it's working on from the queue (see `drain`), so a
    // queue length of 0 does NOT mean idle — an entry may still be mid-retry
    // under backoff. `processing` stays true until the drain loop fully
    // settles, so without it flush() could return while an audit entry is
    // still in flight, defeating the delivery guarantee.
    while (
      (this.queue.length > 0 || this.processing) &&
      Date.now() < deadline
    ) {
      // Yield to the drain loop. Short sleep so we don't burn CPU.
      await sleep(10);
    }

    if (this.queue.length > 0) {
      // Timeout reached. DLQ the rest.
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item) {
          this.onDrop?.(
            item.entry,
            'retries-exhausted',
            item.lastError ?? new Error('flush timeout')
          );
        }
      }
    }
  }

  /**
   * Marks the transport as shutting down (causes the drain loop to bail
   * out instead of waiting for further backoff) and then awaits the flush.
   */
  public async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await this.flush();
  }

  /** Current buffered entries — for observability and tests. */
  public get queueSize(): number {
    return this.queue.length;
  }
}
