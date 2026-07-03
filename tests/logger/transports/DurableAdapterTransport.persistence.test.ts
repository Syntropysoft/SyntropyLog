import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurableAdapterTransport } from '../../../src/logger/transports/DurableAdapterTransport';
import type { DurableExecutor } from '../../../src/logger/transports/DurableAdapterTransport';
import type { LogEntry } from '../../../src/types';

/**
 * Opt-in disk persistence: the durable backlog survives a process restart.
 * The spool is a self-emptying buffer (deleted once drained), not an archive.
 * Guarantee is at-least-once. Absent `persistPath` ⇒ zero disk behavior.
 */

const created: string[] = [];
function tmp(): string {
  const p = join(
    tmpdir(),
    `sl-durable-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`
  );
  created.push(p);
  return p;
}

afterEach(() => {
  for (const p of created.splice(0)) rmSync(p, { force: true });
});

function auditEntry(marker: string): LogEntry {
  return {
    level: 'audit',
    message: marker,
    timestamp: '2026-05-26T00:00:00.000Z',
    retention: { policy: 'SOX' },
  } as never;
}

async function waitFor(cond: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!cond() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('DurableAdapterTransport — disk persistence (opt-in)', () => {
  it('write-ahead: an accepted durable entry is spooled to disk', async () => {
    const path = tmp();
    // Never resolves → the entry stays undelivered, so the spool is not cleared.
    const stuck = vi.fn<DurableExecutor>(
      () => new Promise<void>(() => undefined)
    );
    const t = new DurableAdapterTransport({
      executor: stuck,
      persistPath: path,
      level: 'trace',
    });

    t.log(auditEntry('marker-write-ahead'));

    await waitFor(
      () =>
        existsSync(path) &&
        readFileSync(path, 'utf8').includes('marker-write-ahead')
    );
    expect(readFileSync(path, 'utf8')).toContain('marker-write-ahead');
  });

  it('self-empties the spool once the backlog drains', async () => {
    const path = tmp();
    const executor = vi.fn<DurableExecutor>().mockResolvedValue(undefined);
    const t = new DurableAdapterTransport({
      executor,
      persistPath: path,
      level: 'trace',
    });

    t.log(auditEntry('drains-clean'));
    await t.flush();

    expect(existsSync(path)).toBe(false); // spool deleted after a full drain
    expect(executor).toHaveBeenCalledOnce();
  });

  it('a fresh instance recovers a leftover spool and delivers it (survives restart)', async () => {
    const path = tmp();

    // Instance 1: executor hangs, so the entry is written to the spool but never
    // delivered/cleared. Then we simulate a crash — no shutdown.
    const stuck = vi.fn<DurableExecutor>(
      () => new Promise<void>(() => undefined)
    );
    const t1 = new DurableAdapterTransport({
      executor: stuck,
      persistPath: path,
      level: 'trace',
    });
    t1.log(auditEntry('survivor-entry'));
    await waitFor(
      () =>
        existsSync(path) &&
        readFileSync(path, 'utf8').includes('survivor-entry')
    );

    // Instance 2 (process "restart"): same path, a healthy backend.
    const delivered: unknown[] = [];
    const good = vi.fn<DurableExecutor>((e) => {
      delivered.push(e);
    });
    const t2 = new DurableAdapterTransport({
      executor: good,
      persistPath: path,
      level: 'trace',
    });
    await t2.flush();

    expect(good).toHaveBeenCalledOnce();
    expect(JSON.stringify(delivered[0])).toContain('survivor-entry');
    expect(existsSync(path)).toBe(false); // t2 drained the backlog and self-emptied
  });

  it('no persistPath ⇒ no spool file is created (behavior unchanged)', async () => {
    const path = tmp();
    const executor = vi.fn<DurableExecutor>().mockResolvedValue(undefined);
    const t = new DurableAdapterTransport({ executor, level: 'trace' }); // no persistPath

    t.log(auditEntry('no-persist'));
    await t.flush();

    expect(existsSync(path)).toBe(false);
  });
});
