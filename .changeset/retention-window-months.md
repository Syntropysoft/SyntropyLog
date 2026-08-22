---
'syntropylog': minor
---

A retention window can be declared in `months`, not only whole `years`.

`retentionUntil` never materialized a date for anything that was not a whole number of years,
so a policy of 42 months silently emitted no `retentionUntil` and its records fell out of
every range-scan sweep. Policies now declare `{ years: N }` **or** `{ months: N }` — exactly
one unit, never both — and the pure helper widens to `retentionUntil(at, number | { years } |
{ months })`, where a bare number still means years. New exported type: `RetentionWindow`.

Month arithmetic rolls forward when the target month is short: 31-Jan plus one month lands in
March, not on 28-Feb. That matches the existing leap-day rule — both err on keeping the record
longer, because ending a window early is the failure an auditor punishes.
