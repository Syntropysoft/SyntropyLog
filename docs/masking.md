# Masking & Sensitive Keys

The MaskingEngine redacts sensitive fields **before** any transport sees the log. Built-in rules cover the common cases (password, email, token, card, SSN, phone); custom rules let you add domain-specific aliases.

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

## Runtime additions

Masking rules can be **added** at runtime — never removed or widened — for incident response (e.g. a leak is discovered and a new field needs immediate redaction across all PODs):

```typescript
const masker = syntropyLog.getMasker();
masker.addRule({ pattern: /newSensitiveField/i, strategy: MaskingStrategy.PASSWORD });
```

See [runtime-reconfiguration.md](runtime-reconfiguration.md) for the surface and security considerations.
