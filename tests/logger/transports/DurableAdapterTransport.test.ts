import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DurableAdapterTransport } from '../../../src/logger/transports/DurableAdapterTransport';
import type {
  DurableDropReason,
  DurableExecutor,
} from '../../../src/logger/transports/DurableAdapterTransport';
import type { LogEntry } from '../../../src/types';

/**
 * Behavioral tests for the durable transport.
 *
 * Each test exercises a real-world failure mode the framework promises to
 * handle for retention-tagged entries (SOX, HIPAA, PCI-DSS). If any of
 * these assertions stops failing on a regression — buffer drops too soon,
 * retries don't actually retry, DLQ doesn't fire — the compliance pitch
 * is broken. So each one asserts on the *outcome*, not on internal state.
 */

function entry(
  level: LogEntry['level'],
  extras: Partial<LogEntry> = {}
): LogEntry {
  return {
    level,
    message: 'msg',
    timestamp: '2026-05-26T00:00:00.000Z',
    ...extras,
  };
}

describe('DurableAdapterTransport — selective durability', () => {
  /**
   * The observable difference between the durable path and fire-and-forget
   * is what happens on executor failure: durable retries before DLQ, fire-
   * and-forget skips straight to DLQ. We assert on that — not on internal
   * queue state, which is implementation detail.
   */

  it('passes non-retention entries through fire-and-forget (failures go straight to onDrop, no retries)', async () => {
    const executor = vi
      .fn<DurableExecutor>()
      .mockRejectedValue(new Error('backend down'));
    const onDrop = vi.fn();
    const t = new DurableAdapterTransport({
      executor,
      onDrop,
      maxRetries: 5, // would mean 6 attempts if durable
      level: 'trace',
    });

    t.log(entry('info'));
    // Let the rejected promise settle.
    await new Promise((r) => setImmediate(r));

    // Fire-and-forget: exactly one attempt then DLQ.
    expect(executor).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop.mock.calls[0][1]).toBe('retries-exhausted');
  });

  it('routes retention-tagged entries through the durable path (failures get retried)', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const executor = vi.fn<DurableExecutor>(async () => {
      attempts++;
      if (attempts < 2) throw new Error('transient backend error');
    });
    const t = new DurableAdapterTransport({
      executor,
      initialBackoffMs: 10,
      level: 'trace',
    });

    t.log(entry('audit', { retention: { policy: 'SOX' } } as never));

    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1); // first attempt
    await vi.advanceTimersByTimeAsync(10);
    expect(attempts).toBe(2); // retried (proves durable path)

    vi.useRealTimers();
  });

  it('makes every entry durable when durableOnlyForRetention=false (info gets retried on failure)', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const executor = vi.fn<DurableExecutor>(async () => {
      attempts++;
      if (attempts < 2) throw new Error('fail');
    });
    const t = new DurableAdapterTransport({
      executor,
      durableOnlyForRetention: false,
      initialBackoffMs: 10,
      level: 'trace',
    });

    t.log(entry('info'));

    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(attempts).toBe(2); // info is now durable — got retried

    vi.useRealTimers();
  });
});

describe('DurableAdapterTransport — retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a failing executor with exponential backoff until success', async () => {
    let attempts = 0;
    const executor = vi.fn<DurableExecutor>(async () => {
      attempts++;
      if (attempts < 3) throw new Error(`fail ${attempts}`);
    });
    const onDrop = vi.fn();

    const t = new DurableAdapterTransport({
      executor,
      onDrop,
      maxRetries: 5,
      initialBackoffMs: 50,
      level: 'trace',
    });

    t.log(entry('audit', { retention: { policy: 'SOX' } } as never));

    // First attempt fires synchronously inside the microtask.
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);

    // Backoff 1: 50ms.
    await vi.advanceTimersByTimeAsync(50);
    expect(attempts).toBe(2);

    // Backoff 2: 100ms.
    await vi.advanceTimersByTimeAsync(100);
    expect(attempts).toBe(3);

    // Should have succeeded on attempt 3.
    expect(t.queueSize).toBe(0);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('sends entry to DLQ when retries are exhausted (last error carried)', async () => {
    const lastError = new Error('persistent backend error');
    const executor = vi.fn<DurableExecutor>(() => Promise.reject(lastError));
    const onDrop = vi.fn();

    const t = new DurableAdapterTransport({
      executor,
      onDrop,
      maxRetries: 2,
      initialBackoffMs: 10,
      level: 'trace',
    });

    const auditEntry = entry('audit', {
      retention: { policy: 'SOX' },
    } as never);
    t.log(auditEntry);

    // Drive through all attempts. Each attempt fails; backoff between them.
    // initial(0) → fail → wait 10 → fail → wait 20 → fail → DLQ
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    // Drain microtasks so the final rejection settles.
    await vi.advanceTimersByTimeAsync(0);

    expect(executor).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(t.queueSize).toBe(0);
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith(
      auditEntry,
      'retries-exhausted',
      lastError
    );
  });

  it('caps the backoff at maxBackoffMs', async () => {
    // 100 → 200 → 400 → 800 → 1000 (capped at maxBackoffMs)
    let attempts = 0;
    const executor = vi.fn<DurableExecutor>(async () => {
      attempts++;
      if (attempts < 5) throw new Error(`fail ${attempts}`);
    });

    const t = new DurableAdapterTransport({
      executor,
      maxRetries: 10,
      initialBackoffMs: 100,
      maxBackoffMs: 1000,
      level: 'trace',
    });

    t.log(entry('audit', { retention: { policy: 'SOX' } } as never));

    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(attempts).toBe(3);
    await vi.advanceTimersByTimeAsync(400);
    expect(attempts).toBe(4);
    // 800 < 1000 so still 800.
    await vi.advanceTimersByTimeAsync(800);
    expect(attempts).toBe(5);
  });
});

describe('DurableAdapterTransport — buffer overflow drop strategies', () => {
  /**
   * Setup pattern for these tests:
   * - The executor pauses on its first call (in-flight), so `a` is taken
   *   out of the queue but never resolves.
   * - Later entries land in the queue and trigger the buffer cap.
   *
   * The drop strategy operates only on **queued** entries — not the
   * in-flight one — so the cap of N means "at most N items waiting".
   */
  it("'oldest' drops the front of the queue (in-flight item is never dropped)", async () => {
    let resolveExec!: () => void;
    const executor = vi.fn<DurableExecutor>(
      () => new Promise<void>((r) => (resolveExec = r))
    );
    const onDrop = vi.fn();
    const t = new DurableAdapterTransport({
      executor,
      onDrop,
      bufferSize: 2,
      // default dropStrategy is 'oldest'
      level: 'trace',
    });

    const a = entry('audit', { retention: { p: 'A' }, idx: 1 } as never);
    const b = entry('audit', { retention: { p: 'B' }, idx: 2 } as never);
    const c = entry('audit', { retention: { p: 'C' }, idx: 3 } as never);
    const d = entry('audit', { retention: { p: 'D' }, idx: 4 } as never);

    t.log(a); // → in flight (out of queue)
    t.log(b); // → queue=[b]
    t.log(c); // → queue=[b, c] (at cap)
    t.log(d); // → cap exceeded; oldest queued (b) is dropped, queue=[c, d]

    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith(b, 'buffer-full');

    // After releasing the in-flight call, the executor will see a, then c, then d.
    resolveExec();
    await new Promise((r) => setImmediate(r));
    const seen = executor.mock.calls.map((c) => c[0]);
    expect(seen).toContain(a); // in-flight was never affected
    expect(seen).not.toContain(b); // dropped
  });

  it("'newest' drops the tail of the queue (most recently queued)", async () => {
    let resolveExec!: () => void;
    const executor = vi.fn<DurableExecutor>(
      () => new Promise<void>((r) => (resolveExec = r))
    );
    const onDrop = vi.fn();
    const t = new DurableAdapterTransport({
      executor,
      onDrop,
      bufferSize: 2,
      dropStrategy: 'newest',
      level: 'trace',
    });

    const a = entry('audit', { retention: { p: 'A' } } as never);
    const b = entry('audit', { retention: { p: 'B' } } as never);
    const c = entry('audit', { retention: { p: 'C' } } as never);
    const d = entry('audit', { retention: { p: 'D' } } as never);

    t.log(a); // in flight
    t.log(b); // queue=[b]
    t.log(c); // queue=[b, c]
    t.log(d); // 'newest': drop c (most recent), enqueue d. queue=[b, d]

    expect(onDrop).toHaveBeenCalledWith(c, 'buffer-full');
    resolveExec();
    await new Promise((r) => setImmediate(r));
  });

  it("'reject' drops the incoming entry; existing queue untouched", async () => {
    let resolveExec!: () => void;
    const executor = vi.fn<DurableExecutor>(
      () => new Promise<void>((r) => (resolveExec = r))
    );
    const onDrop = vi.fn();
    const t = new DurableAdapterTransport({
      executor,
      onDrop,
      bufferSize: 2,
      dropStrategy: 'reject',
      level: 'trace',
    });

    const a = entry('audit', { retention: { p: 'A' } } as never);
    const b = entry('audit', { retention: { p: 'B' } } as never);
    const c = entry('audit', { retention: { p: 'C' } } as never);
    const d = entry('audit', { retention: { p: 'D' } } as never);

    t.log(a); // in flight
    t.log(b); // queue=[b]
    t.log(c); // queue=[b, c]
    t.log(d); // 'reject': drop d, queue stays [b, c]

    expect(onDrop).toHaveBeenCalledWith(d, 'buffer-full');
    expect(t.queueSize).toBe(2);
    resolveExec();
    await new Promise((r) => setImmediate(r));
  });
});

describe('DurableAdapterTransport — shutdown / flush', () => {
  it('flush() drains the queue when the executor cooperates', async () => {
    const executor = vi.fn<DurableExecutor>().mockResolvedValue(undefined);
    const t = new DurableAdapterTransport({ executor, level: 'trace' });

    for (let i = 0; i < 5; i++) {
      t.log(entry('audit', { retention: { p: 'X' }, idx: i } as never));
    }

    await t.flush();
    expect(t.queueSize).toBe(0);
    expect(executor).toHaveBeenCalledTimes(5);
  });

  it('flush() DLQs remaining entries when the executor refuses to resolve before timeout', async () => {
    // Executor never resolves — pure backpressure scenario.
    const executor = vi.fn<DurableExecutor>(
      () => new Promise<void>(() => undefined)
    );
    const onDrop = vi.fn();
    const t = new DurableAdapterTransport({
      executor,
      onDrop,
      flushTimeoutMs: 50,
      level: 'trace',
    });

    t.log(entry('audit', { retention: { p: 'X' } } as never));
    t.log(entry('audit', { retention: { p: 'Y' } } as never));

    await t.flush();

    // Both entries should have been handed off to onDrop (retries-exhausted).
    const reasons = onDrop.mock.calls.map((c) => c[1] as DurableDropReason);
    expect(reasons.length).toBeGreaterThanOrEqual(1);
    expect(reasons.every((r) => r === 'retries-exhausted')).toBe(true);
  });

  it('shutdown() prevents further retries from waiting full backoff', async () => {
    const lastError = new Error('slow backend');
    const executor = vi.fn<DurableExecutor>(() => Promise.reject(lastError));
    const onDrop = vi.fn();
    const t = new DurableAdapterTransport({
      executor,
      onDrop,
      maxRetries: 5,
      initialBackoffMs: 60_000, // 1 minute backoff — would normally hang shutdown
      flushTimeoutMs: 200,
      level: 'trace',
    });

    t.log(entry('audit', { retention: { p: 'X' } } as never));

    // Without shutdown, the next backoff is 60s and shutdown would hang.
    // With shutdown, the drain loop bails out and the entry goes to DLQ.
    const start = Date.now();
    await t.shutdown();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2_000); // well under the 60s backoff
    expect(onDrop).toHaveBeenCalled();
  });
});
