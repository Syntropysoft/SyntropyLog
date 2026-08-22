/**
 * @file src/logger/retentionUntil.ts
 * @description The date a retention obligation runs to — materialized so a sweep is a range
 * scan instead of a policy interpretation.
 *
 * Retention is enforced per container (index, stream, bucket) and decided per record. The
 * class name is what routes the record; this date is what lets anything downstream — an ILM
 * policy, a lifecycle rule, a cron, a legal-hold query — act on it **without understanding
 * policies at all**. It is the other half of the bridge: the first half keeps the record long
 * enough, this one makes it findable when the window ends.
 *
 * Because the date is computed **at write time**, a policy that is revised later does not
 * rewrite history: records filed under the old revision keep the window they were filed
 * under, and the sweep stays a single range scan across all of them.
 */

/**
 * How long a record must be kept. Exactly one unit — years **or** months, never both.
 *
 * Two units in one declaration have no single obvious reading, and picking one by precedence
 * would put a date nobody chose into a compliance column. A registered policy that declares
 * both is rejected at `init()`; here it simply yields no date.
 */
export type RetentionWindow = { years: number } | { months: number };

/** Pure: a usable count is a whole number above zero. Anything else is not a window. */
function isWholePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Pure: the date until which the record must be kept — `at` plus the window.
 *
 * **Not an expiry.** Reaching this date ends the mandatory window; it does not authorize
 * deletion. Legal hold, an open dispute, or a longer policy elsewhere can all extend it.
 *
 * **Both roundings err long, never short.** A leap day plus N years lands on 1-Mar of a
 * non-leap year; 31-Jan plus one month has no 31-Feb to land on and rolls into March. Both
 * keep the record *longer*. That is deliberate: ending a window early is the failure an
 * auditor punishes, so neither case is clamped backwards.
 *
 * @param at - When the record was written.
 * @param window - `{ years }` or `{ months }`. A bare number means years, as it always has.
 * @returns The end of the mandatory window, or `null` when the inputs do not describe one.
 */
export function retentionUntil(
  at: Date,
  window: number | RetentionWindow
): Date | null {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;

  const declared = typeof window === 'number' ? { years: window } : window;
  if (declared === null || typeof declared !== 'object') return null;

  const years = (declared as { years?: unknown }).years;
  const months = (declared as { months?: unknown }).months;
  const hasYears = isWholePositive(years);
  const hasMonths = isWholePositive(months);

  // Exactly one unit. `hasYears === hasMonths` covers both of the rejected cases at once:
  // two units declared together, and no usable unit at all.
  if (hasYears === hasMonths) return null;

  const until = new Date(at.getTime());
  if (hasYears) {
    until.setUTCFullYear(until.getUTCFullYear() + (years as number));
  } else {
    until.setUTCMonth(until.getUTCMonth() + (months as number));
  }
  return until;
}

/**
 * @internal Pure: the window a policy's rules declare, or `null` when they declare none.
 *
 * Lenient by design — this runs on the logging path, where refusing to start is not an
 * option. A **registered** policy is checked strictly at `init()` instead, so by the time
 * this sees one it is already well-formed; inline rules passed to `withRetention({ … })`
 * bypass that check and are the case this leniency exists for.
 */
export function resolveRetentionWindow(rules: unknown): RetentionWindow | null {
  if (rules === null || typeof rules !== 'object') return null;
  const { years, months } = rules as { years?: unknown; months?: unknown };
  const hasYears = isWholePositive(years);
  const hasMonths = isWholePositive(months);
  if (hasYears === hasMonths) return null;
  return hasYears ? { years: years as number } : { months: months as number };
}

/**
 * @internal Pure: the ISO string the framework puts on the entry, or `undefined` when the
 * policy carries no usable window. Kept separate so the public helper stays `Date`-typed —
 * a caller filling a `timestamptz` column wants a Date, an entry field wants a string.
 */
export function retentionUntilIso(
  atMs: number,
  window: RetentionWindow | undefined
): string | undefined {
  if (!window) return undefined;
  const until = retentionUntil(new Date(atMs), window);
  return until ? until.toISOString() : undefined;
}
