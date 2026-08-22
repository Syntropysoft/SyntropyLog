/**
 * FILE: tests/logger/retentionUntil.months.test.ts
 * DESCRIPTION: A retention window declared in months. Years and months are mutually
 * exclusive — a policy states one unit or the other, never both — because a mixed
 * declaration has no single obvious reading and guessing one lands a wrong date in a
 * compliance column.
 */
import { describe, it, expect } from 'vitest';
import { retentionUntil } from '../../src/logger/retentionUntil';

const at = new Date('2026-01-15T10:00:00.000Z');

describe('retentionUntil — months', () => {
  it('materializes a window declared in months', () => {
    expect(retentionUntil(at, { months: 42 })?.toISOString()).toBe(
      '2029-07-15T10:00:00.000Z'
    );
  });

  it('a bare number still means years (the 1.x signature keeps working)', () => {
    expect(retentionUntil(at, 3)?.toISOString()).toBe(
      retentionUntil(at, { years: 3 })?.toISOString()
    );
  });

  it('36 months and 3 years land on the same day', () => {
    expect(retentionUntil(at, { months: 36 })?.toISOString()).toBe(
      retentionUntil(at, { years: 3 })?.toISOString()
    );
  });

  /**
   * A policy carrying BOTH units keeps the date it already had. Before `months` was read at
   * all, `{ years: 3, months: 6 }` produced a date from `years` and ignored the rest — so
   * refusing to compute would silently take a date away from records that get one today.
   * Removing a compliance date in a minor is a worse failure than resolving an ambiguity the
   * way it has always been resolved.
   */
  it('prefers years when both units are declared, as it always did', () => {
    expect(retentionUntil(at, { years: 3, months: 6 })?.toISOString()).toBe(
      retentionUntil(at, { years: 3 })?.toISOString()
    );
  });

  it.each([
    ['neither unit', {}],
    ['non-integer months', { months: 3.5 }],
    ['zero months', { months: 0 }],
    ['negative months', { months: -12 }],
    ['months of the wrong type', { months: '42' }],
  ])('yields null for %s', (_label, window) => {
    expect(retentionUntil(at, window as never)).toBeNull();
  });

  /**
   * Month arithmetic overflows: 31-Jan + 1 month has no 31-Feb to land on, and JS rolls
   * forward into March. That is KEPT ON PURPOSE — it errs on keeping the record longer,
   * the same direction the leap-day rule already chose. Ending a window early is the
   * failure an auditor punishes. Do not "fix" this to clamp at the end of February.
   */
  it('rolls a short month forward, keeping the record longer — never shorter', () => {
    const endOfJanuary = new Date('2026-01-31T00:00:00.000Z');
    const until = retentionUntil(endOfJanuary, { months: 1 })!;
    expect(until.toISOString()).toBe('2026-03-03T00:00:00.000Z');
    expect(until.getTime()).toBeGreaterThan(
      new Date('2026-02-28T00:00:00.000Z').getTime()
    );
  });

  it('keeps the leap-day guarantee when the window is in months', () => {
    const leapDay = new Date('2024-02-29T12:00:00.000Z');
    // 12 months from 29-Feb-2024 → 2025 has no 29-Feb, so it rolls to 1-Mar: one day longer.
    expect(retentionUntil(leapDay, { months: 12 })?.toISOString()).toBe(
      '2025-03-01T12:00:00.000Z'
    );
  });
});
