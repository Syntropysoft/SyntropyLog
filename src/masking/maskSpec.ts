/**
 * @file src/masking/maskSpec.ts
 * @description The single declarative masking primitive.
 *
 * A masking strategy is DATA, not code: a {@link MaskSpec} describes how to mask a
 * string, and {@link applyMask} interprets it. The native Rust engine mirrors this
 * exactly (`apply_mask` in syntropylog-native/src/lib.rs); a shared fixture
 * (syntropylog-native/tests/mask-parity-cases.json) is asserted from both languages,
 * so adding a strategy is a new spec — never a new function in two places.
 */

/** Replacement for fully redacted values; must equal REDACTED in the Rust engine. */
export const REDACTED = '[REDACTED]';

/** Mirror of DEFAULT_VALUES.maskDefaultCapLength (kept local to keep this module dependency-free). */
const MASK_DEFAULT_CAP_LENGTH = 8;

/**
 * A masking instruction expressed as data. Built-in strategies (email, card, …) are
 * presets that expand to one of these. Defaults: maskChar `*`, preserveLength `true`,
 * scope all chars.
 */
export interface MaskSpec {
  /** Replace the whole value with {@link REDACTED} (credentials). Wins over everything else. */
  redact?: boolean;
  /** Keep the first N units (chars, or digits when `scope: 'digits'`). */
  unmaskStart?: number;
  /** Keep the last N units. */
  unmaskEnd?: number;
  /** `'digits'` → only mask digit characters (separators kept); otherwise mask all chars. */
  scope?: 'all' | 'digits';
  /** Keep everything from the first occurrence of this delimiter onward (e.g. an email domain). */
  keepAfter?: string;
  /** Mask character (default `*`). */
  maskChar?: string;
  /** Preserve original length; when false the masked run is capped (default `true`). */
  preserveLength?: boolean;
}

/** A masking rule serialized for the native engine: a key regex + the spec to apply. */
export interface NativeMaskRule {
  /** Regex source matched against the field key. */
  pattern: string;
  /** Regex flags (only the linear subset i/m/s is honored natively). */
  flags: string;
  /** The declarative mask to apply to the matched value. */
  spec: MaskSpec;
}

function isAsciiDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

/** Mask all characters of `s` except the first `start` and last `end`. */
function maskChars(
  s: string,
  start: number,
  end: number,
  maskChar: string,
  preserveLength: boolean
): string {
  const chars = Array.from(s);
  const n = chars.length;
  const keepStart = Math.min(start, n);
  const keepEnd = Math.min(end, n - keepStart);
  const maskedCount = n - keepStart - keepEnd;
  const bodyLen = preserveLength
    ? maskedCount
    : Math.min(maskedCount, MASK_DEFAULT_CAP_LENGTH);
  return (
    chars.slice(0, keepStart).join('') +
    maskChar.repeat(bodyLen) +
    chars.slice(n - keepEnd).join('')
  );
}

/** Mask only the digit characters of `s` except the first `start` and last `end` digits. */
function maskDigits(
  s: string,
  start: number,
  end: number,
  maskChar: string
): string {
  const chars = Array.from(s);
  const digitPositions: number[] = [];
  chars.forEach((c, i) => {
    if (isAsciiDigit(c)) digitPositions.push(i);
  });
  const d = digitPositions.length;
  const keepStart = Math.min(start, d);
  const keepEnd = Math.min(end, d - keepStart);
  const masked = new Set(digitPositions.slice(keepStart, d - keepEnd));
  return chars.map((c, i) => (masked.has(i) ? maskChar : c)).join('');
}

/** Split `value` into the head to mask and the verbatim tail kept from `delim` onward. */
function splitKeptTail(value: string, delim?: string): [string, string] {
  if (!delim) return [value, ''];
  const idx = value.indexOf(delim);
  if (idx < 0) return [value, ''];
  return [value.slice(0, idx), value.slice(idx)];
}

/**
 * Apply a declarative mask spec to a string. Pure; guard clauses.
 * MUST stay byte-for-byte equivalent to `apply_mask` in the Rust engine.
 */
export function applyMask(value: string, spec: MaskSpec): string {
  if (spec.redact) return REDACTED;

  const maskChar = spec.maskChar ?? '*';
  const preserveLength = spec.preserveLength ?? true;
  const [head, tail] = splitKeptTail(value, spec.keepAfter);
  const start = spec.unmaskStart ?? 0;
  const end = spec.unmaskEnd ?? 0;

  const masked =
    spec.scope === 'digits'
      ? maskDigits(head, start, end, maskChar)
      : maskChars(head, start, end, maskChar, preserveLength);

  return masked + tail;
}
