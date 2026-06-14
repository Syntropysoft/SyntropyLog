# Masking & Sensitive Keys

The MaskingEngine redacts sensitive fields **by key name**, **before** any transport sees the log: when a field's *key* matches a rule (built-in: `password`, `email`, `token`, `card`, `ssn`, `phone`; plus your custom aliases), that field's *value* is redacted. It matches on the **field name, not the field's content** — see [Scope & limitations](#scope--limitations).

---

## Scope & limitations

Masking is **field-name based**: a rule matches the *key* of a field and redacts that field's *value*. That keeps it fast and declarative, but it deliberately does **not** scan free text for PII. Three things are **not** masked:

1. **Free text under a non-sensitive key.** `{ detail: "call Juan Pérez at 11-5555-1234" }` → the key `detail` matches no rule, so the value passes through untouched. Same for `note`, `description`, `comment`, `error`, etc.
2. **Bare strings inside arrays.** `{ recipients: ["a@x.com", "b@x.com"] }` → array elements have no key to match, so none are redacted. An email is masked only as `{ email: "a@x.com" }` — a field whose key matches a rule.
3. **The log message itself.** `log.info(meta, "user john@x.com failed")` → only `meta` runs through masking; the message string is emitted as-is.

> The value-level `redactPatterns` (used by the native path) catch **embedded credentials** like `password=...`, `token=...`, `secret=...` — **not** free-text emails, phones, or names.

**Guidance:** put anything sensitive in a field with a known sensitive key (`{ email, phone, ssn, ... }`) so masking can redact it. Do **not** rely on masking to find PII inside free-text strings, array elements, or the log message — structure it into keyed fields, or mask it in your own code before logging.

---

## Basic configuration

```typescript
import { MaskingStrategy } from 'syntropylog';

await syntropyLog.init({
  logger: { level: 'info', serviceName: 'my-app' },
  masking: {
    enableDefaultRules: true,
    maskChar: '*',
    preserveLength: true,
    rules: [
      {
        pattern: /cuit|cuil/i,
        strategy: MaskingStrategy.CUSTOM,
        customMask: (value) => value.replace(/\d(?=\d{4})/g, '*'),
      },
    ],
  },
});
```

---

## Strategies

| Strategy      | Example output             |
|---------------|----------------------------|
| `PASSWORD`    | `********`                 |
| `EMAIL`       | `j***@example.com`         |
| `TOKEN`       | `eyJh...a1B9c`             |
| `CREDIT_CARD` | `****-****-****-1234`      |
| `CUSTOM`      | whatever `customMask` returns |

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
    // Or pick a few
    {
      pattern: new RegExp(
        [maskEnum.MASK_KEY_ACCESS_TOKEN, maskEnum.MASK_KEY_REFRESH_TOKEN].join('|'),
        'i',
      ),
      strategy: MaskingStrategy.TOKEN,
    },
  ],
}
```

`maskEnum` exposes:

- **Individual constants** — every `MASK_KEY_*` (e.g. `MASK_KEY_PWD`, `MASK_KEY_ACCESS_TOKEN`, `MASK_KEY_EMAIL`).
- **Grouped arrays** — `MASK_KEYS_PASSWORD`, `MASK_KEYS_TOKEN`, `MASK_KEYS_ALL`.

Use the grouped arrays when you want one regex covering a whole family; use individual constants when you want fine control.

---

## Sonar exception for your own sensitive-words file

If your project defines its **own** sensitive-key aliases in a file (e.g. `mySensitiveKeys.ts`), Sonar may flag those literals as secrets (rule S2068). Two options:

**Exclude the file from analysis:**
```properties
# sonar-project.properties
sonar.exclusions=**/mySensitiveKeys.ts
```

**Or ignore only S2068 on that file:**
```properties
sonar.issue.ignore.multicriteria=e1
sonar.issue.ignore.multicriteria.e1.ruleKey=typescript:S2068
sonar.issue.ignore.multicriteria.e1.resourceKey=**/mySensitiveKeys.ts
```

---

## Safety properties

- **Silent Observer.** If masking fails (e.g. a custom regex times out), the pipeline does not throw. The `masking.onMaskingError` hook fires; the log entry continues through (see [lifecycle.md](lifecycle.md)).
- **ReDoS protection.** Provide ReDoS-safe regexes; the engine applies a configurable `regexTimeoutMs` to abort long matches.
- **Long-key guard.** Keys longer than 256 characters are skipped to prevent pathological inputs.

---

## Sanitization — control characters and ANSI

Sanitization runs alongside masking as part of the pipeline's safety boundary. Where masking redacts *sensitive values*, sanitization strips *dangerous characters* from string values before any transport sees them:

- Control characters (e.g. `\x00–\x1F` except whitespace) are removed.
- ANSI escape sequences are stripped from metadata.

This reduces log-injection risk in terminals and downstream SIEMs that interpret control codes (e.g. a logged user input containing `\e[2J` could clear an operator's screen).

No configuration is required — it runs automatically inside the serialization pipeline. The Rust native addon performs sanitization in the same single pass as serialization and masking ([native-addon.md](native-addon.md)).

Together with the [Logging Matrix](logging-matrix.md) — which whitelists *which keys* are emitted — these three layers (matrix → masking → sanitization) form the content safety boundary.

---

## Runtime additions

Masking rules can be **added** at runtime — never removed or widened — for incident response (e.g. a leak is discovered and a new field needs immediate redaction across all PODs):

```typescript
const masker = syntropyLog.getMasker();
masker.addRule({ pattern: /newSensitiveField/i, strategy: MaskingStrategy.PASSWORD });
```

See [runtime-reconfiguration.md](runtime-reconfiguration.md) for the surface and security considerations.
