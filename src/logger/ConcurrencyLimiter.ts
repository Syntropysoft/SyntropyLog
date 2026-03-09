/**
 * @file src/logger/ConcurrencyLimiter.ts
 * @description Limits how many log operations run concurrently to avoid unbounded
 * promises and memory pressure when the app logs in a tight loop without awaiting.
 */

import type { IConcurrencyLimiter } from './Logger';

/**
 * Simple semaphore: at most `limit` callers can hold a slot at once.
 * Others wait via acquire() until a slot is released.
 */
export class ConcurrencyLimiter implements IConcurrencyLimiter {
  private current = 0;
  private readonly limit: number;
  private readonly waitQueue: Array<() => void> = [];

  constructor(limit: number) {
    if (limit < 1) throw new Error('ConcurrencyLimiter limit must be >= 1');
    this.limit = limit;
  }

  acquire(): Promise<void> {
    if (this.current < this.limit) {
      this.current++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.current <= 0) return;
    this.current--;
    const next = this.waitQueue.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}
