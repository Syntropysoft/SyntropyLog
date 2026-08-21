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
 */

/**
 * Pure: the date until which the record must be kept — `at` plus `years`.
 *
 * **Not an expiry.** Reaching this date ends the mandatory window; it does not authorize
 * deletion. Legal hold, an open dispute, or a longer policy elsewhere can all extend it.
 *
 * Leap day: 29-Feb + N years lands on 1-Mar of a non-leap year, which keeps the record one
 * day longer — never one day short. Erring the other way would end the window early, which
 * is the failure an auditor actually punishes.
 *
 * @param at - When the record was written.
 * @param years - Whole years of retention. Non-integers and values <= 0 return `null`.
 * @returns The end of the mandatory window, or `null` when either input is unusable.
 */
export function retentionUntil(at: Date, years: number): Date | null {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;
  if (!Number.isInteger(years) || years <= 0) return null;

  const until = new Date(at.getTime());
  until.setUTCFullYear(until.getUTCFullYear() + years);
  return until;
}

/**
 * @internal Pure: the ISO string the framework puts on the entry, or `undefined` when the
 * policy carries no usable `years`. Kept separate so the public helper stays `Date`-typed —
 * a caller filling a `timestamptz` column wants a Date, an entry field wants a string.
 */
export function retentionUntilIso(
  atMs: number,
  years: unknown
): string | undefined {
  if (typeof years !== 'number') return undefined;
  const until = retentionUntil(new Date(atMs), years);
  return until ? until.toISOString() : undefined;
}
