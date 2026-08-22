/**
 * @file src/logger/retentionUntil.ts
 * @description Computes the end of a retention window from the policy's declared unit, so the
 * date travels on the entry and downstream tooling can act on it without reading policies.
 */

/** How long a record must be kept: years or months. */
export type RetentionWindow = { years: number } | { months: number };

/** Pure: a usable count is a whole number above zero. */
function isWholePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Pure: `at` plus the window; `years` wins if both are declared, `null` if neither is usable. */
export function retentionUntil(
  at: Date,
  window: number | RetentionWindow
): Date | null {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;

  const declared = typeof window === 'number' ? { years: window } : window;
  if (declared === null || typeof declared !== 'object') return null;

  const years = (declared as { years?: unknown }).years;
  const months = (declared as { months?: unknown }).months;

  const until = new Date(at.getTime());
  if (isWholePositive(years)) {
    until.setUTCFullYear(until.getUTCFullYear() + years);
    return until;
  }
  if (isWholePositive(months)) {
    // Short target month rolls forward, keeping the record longer — never shorter.
    until.setUTCMonth(until.getUTCMonth() + months);
    return until;
  }
  return null;
}

/** Pure: the window a policy's rules declare, or `null` when they declare none. */
export function resolveRetentionWindow(rules: unknown): RetentionWindow | null {
  if (rules === null || typeof rules !== 'object') return null;
  const { years, months } = rules as { years?: unknown; months?: unknown };
  if (isWholePositive(years)) return { years };
  if (isWholePositive(months)) return { months };
  return null;
}

/** Pure: the window as the ISO string the entry carries; the caller supplies a window or skips. */
export function retentionUntilIso(
  atMs: number,
  window: RetentionWindow
): string | undefined {
  return retentionUntil(new Date(atMs), window)?.toISOString();
}
