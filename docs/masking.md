# Masking & Sensitive Keys

The MaskingEngine redacts sensitive fields **by key name**, **before** any transport sees the log: when a field's *key* matches a rule (built-in: `email`, `phone`, `credit_card`, `ssn`, `password`, `token`, plus the secret-key families and your own rules), that field's *value* is masked. It matches on the **field name, not the field's content** — see [Scope & limitations](#scope--limitations).

## One definition, two engines, no drift

Masking is **data-driven**. A strategy is a declarative `MaskSpec` (e.g. `{ scope: 'digits', unmaskEnd: 4 }`), and a single primitive interprets it. That same primitive exists in two places — the JS engine and the native Rust addon — and a **shared parity fixture is asserted from both languages**, so they cannot produce different output. Whether your process runs the native addon (the default) or the JS fallback, **the masked output is identical**.

The rules come from **one source** (the MaskingEngine); the native engine is configured from those very same rules. If the native engine cannot honor a rule (an exotic regex it can't compile, or a custom JS *function*), it does **not** silently skip it — it falls back to the JS engine (which honors any rule) and reports it via `onSerializationFallback`. A rule you define is always applied, in every path.

> **Canonical behavior:** *identifiers* (email, phone, credit card, SSN) keep a **format-preserving partial mask** — the last 4 of an identifier is not the secret and aids debugging. *Credentials* (password, token, secret, key, auth, …) are **fully redacted** to `[REDACTED]` — a credential is never shown, not even partially.

---

## Strategies

| Strategy      | Spec                                   | Example output          |
|---------------|----------------------------------------|-------------------------|
| `EMAIL`       | `{ unmaskStart: 1, keepAfter: '@' }`   | `j***@example.com`      |
| `CREDIT_CARD` | `{ scope: 'digits', unmaskEnd: 4 }`    | `****-****-****-1234`   |
| `SSN`         | `{ scope: 'digits', unmaskEnd: 4 }`    | `***-**-6789`           |
| `PHONE`       | `{ scope: 'digits', unmaskEnd: 4 }`    | `+*******1234`          |
| `PASSWORD`    | `{ redact: true }`                     | `[REDACTED]`            |
| `TOKEN`       | `{ redact: true }`                     | `[REDACTED]`            |
| `CUSTOM`      | your `spec`, or a `customMask` function | whatever you define     |

A non-string value under a matched key (object, array, number) is fully redacted to `[REDACTED]` — masking never descends into it, so nested PII can't leak under a sensitive-named parent.

---

## Basic configuration

```typescript
import { MaskingStrategy } from 'syntropylog';

await syntropyLog.init({
  logger: { level: 'info', serviceName: 'my-app' },
  masking: {
    enableDefaultRules: true,   // email, phone, credit_card, ssn, password, token + secret families
    maskChar: '*',
    preserveLength: true,
  },
});
```

With the defaults on, `log.info({ email, password, creditCard, ssn }, '...')` comes out masked automatically, the same way under the native and JS engines.

---

## Custom masks — declarative `spec` (recommended) vs `customMask` function

You can express a custom mask **as data** with `spec`. A declarative spec **crosses into the native engine**, so it runs at native speed and stays consistent with the JS path:

```typescript
import { MaskingStrategy } from 'syntropylog';

masking: {
  rules: [
    // Argentine CUIT/CUIL: keep the last 4 digits, mask the rest. Runs in BOTH engines.
    { pattern: /cuit|cuil/i, strategy: MaskingStrategy.CUSTOM, spec: { scope: 'digits', unmaskEnd: 4 } },
  ],
}
// cuit "20-30405060-7" → "**-*****060-7"
```

`MaskSpec` fields: `redact`, `unmaskStart`, `unmaskEnd`, `scope` (`'digits'` masks only digits, keeping separators), `keepAfter` (keep everything from a delimiter, e.g. an email domain), `maskChar`, `preserveLength`.

A `customMask` **function** is still supported, but a JS closure **cannot run inside the native engine**. A rule that uses one disables the native path for that logger (masking runs in JS so your function executes faithfully) — `onSerializationFallback` reports it. Prefer a declarative `spec` whenever it can express your mask.

```typescript
// JS-only: disables native for this logger (function can't cross to Rust).
{ pattern: /legacy/i, strategy: MaskingStrategy.CUSTOM, customMask: (v) => v.slice(0, 2) + '…' }
```

---

## Scope & limitations

Masking is **field-name based**: a rule matches the *key* of a field and masks that field's *value*. That keeps it fast and declarative, but it deliberately does **not** scan free text for PII. Three things are **not** masked:

1. **Free text under a non-sensitive key.** `{ detail: "call Juan Pérez at 11-5555-1234" }` → the key `detail` matches no rule, so the value passes through untouched. Same for `note`, `description`, `comment`, `error`, etc.
2. **Bare strings inside arrays.** `{ recipients: ["a@x.com", "b@x.com"] }` → array elements have no key to match, so none are redacted. An email is masked only as `{ email: "a@x.com" }` — a field whose key matches a rule.
3. **The log message itself.** `log.info(meta, "user john@x.com failed")` → only `meta` runs through masking; the message string is emitted as-is.

> The value-level `redactPatterns` (applied to every string in the native path) catch **embedded credentials** like `password=...`, `token=...`, `secret=...` — **not** free-text emails, phones, or names.

**Guidance:** put anything sensitive in a field with a known sensitive key (`{ email, phone, ssn, ... }`) so masking can redact it. Do **not** rely on masking to find PII inside free-text strings, array elements, or the log message — structure it into keyed fields, or mask it in your own code before logging.

**Log-data quality is the responsibility of the caller.** Masking enforces *your* rules on keyed fields, deterministically and fast; it does not guess at PII buried in prose. Drawing that line on purpose is what keeps the boundary honest — so nobody believes a free-text field is covered when it isn't — and keeps the framework out of the impossible job of parsing whatever text you happened to write.

---

## Mixing defaults with your own rules

`getDefaultMaskingRules` returns the built-in rule set so you can spread it alongside custom rules. Set `enableDefaultRules: false` when you provide the full list yourself.

```typescript
import { getDefaultMaskingRules, MaskingStrategy } from 'syntropylog';

masking: {
  enableDefaultRules: false,
  maskChar: '*',
  rules: [
    ...getDefaultMaskingRules({ maskChar: '*' }),
    { pattern: /myCustomKey|internalSecret/i, strategy: MaskingStrategy.PASSWORD },
  ],
}
```

---

## `maskEnum` — sensitive key aliases without string literals

`maskEnum` is a single exported object containing every sensitive-key alias and grouped arrays. Import it once and pick or spread what you need — no string literals (Sonar-safe), no listing every constant.

```typescript
import { maskEnum, MaskingStrategy, getDefaultMaskingRules } from 'syntropylog';

masking: {
  enableDefaultRules: false,
  maskChar: '*',
  rules: [
    ...getDefaultMaskingRules({ maskChar: '*' }),
    // One pattern for all token-like keys (access_token, refresh_token, api_key, jwt, …)
    {
      pattern: new RegExp(maskEnum.MASK_KEYS_TOKEN.join('|'), 'i'),
      strategy: MaskingStrategy.TOKEN,
    },
  ],
}
```

`maskEnum` exposes individual `MASK_KEY_*` constants and grouped arrays (`MASK_KEYS_PASSWORD`, `MASK_KEYS_TOKEN`, `MASK_KEYS_ALL`). Use grouped arrays for a whole family; individual constants for fine control.

---

## Sonar exception for your own sensitive-words file

If your project defines its **own** sensitive-key aliases in a file (e.g. `mySensitiveKeys.ts`), Sonar may flag those literals as secrets (rule S2068). Two options:

```properties
# Exclude the file from analysis:
sonar.exclusions=**/mySensitiveKeys.ts

# Or ignore only S2068 on that file:
sonar.issue.ignore.multicriteria=e1
sonar.issue.ignore.multicriteria.e1.ruleKey=typescript:S2068
sonar.issue.ignore.multicriteria.e1.resourceKey=**/mySensitiveKeys.ts
```

---

## Safety properties

- **Silent Observer.** If masking fails (e.g. a custom regex times out), the pipeline does not throw. The `masking.onMaskingError` hook fires; on failure the entry is replaced by a safe redaction marker rather than leaking raw payload (see [lifecycle.md](lifecycle.md)).
- **ReDoS protection.** Provide ReDoS-safe regexes; the JS engine applies a configurable `regexTimeoutMs` to abort long matches, and the native engine uses the linear `regex` crate. Long keys (>256 chars) are skipped.
- **No silent skips.** A masking rule the native engine cannot compile (lookahead/backrefs) makes it fall back to the JS engine instead of dropping the rule — data is never let through unmasked.

---

## Sanitization — control characters and ANSI

Sanitization runs alongside masking as part of the pipeline's safety boundary. Where masking redacts *sensitive values*, sanitization strips *dangerous characters* from string values before any transport sees them: control characters and ANSI escape sequences are removed. This reduces log-injection risk in terminals and downstream SIEMs.

No configuration is required — it runs automatically inside the serialization pipeline. The native addon performs sanitization in the same single pass as serialization and masking ([native-addon.md](native-addon.md)).

Together with the [Logging Matrix](logging-matrix.md) — which whitelists *which keys* are emitted — these three layers (matrix → masking → sanitization) form the content safety boundary.

---

## Runtime additions

Masking rules can be **added** at runtime — never removed or widened — for incident response (e.g. a leak is discovered and a new field needs immediate redaction across all PODs):

```typescript
const masker = syntropyLog.getMasker();
masker.addRule({ pattern: /newSensitiveField/i, strategy: MaskingStrategy.PASSWORD });
```

See [runtime-reconfiguration.md](runtime-reconfiguration.md) for the surface and security considerations.
