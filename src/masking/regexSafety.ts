/**
 * @file src/masking/regexSafety.ts
 * @description Static ReDoS rejection for custom key patterns — the JS-path defense.
 *
 * V8 regex execution is synchronous and UNINTERRUPTIBLE: no timeout can exist, and the
 * key-length cap alone is insufficient (measured 2026-07-10: `(a+)+$` hangs V8 forever at
 * 40 chars, far below the 256 cap). Timeouts and caps are the wrong tools; the right tool
 * is refusing the explosive pattern BEFORE it ever runs — deterministically, at init time.
 *
 * What this catches (the dominant ReDoS classes):
 *  - star-height > 1: an unbounded quantifier over a group whose body contains another
 *    unbounded quantifier — `(a+)+`, `([a-z]+)*`, `(x*)*`, `(\w+)*$`
 *  - counted repetition of such a group — `(.*a){25}`, `(a+){2,}`
 *
 * Honest residual: overlapping alternation under a quantifier (`(a|a)*$`) also hangs V8
 * and is NOT detected here (it needs NFA ambiguity analysis; safe-regex misses it too).
 * The full elimination is the declarative path — spec-based rules cross to the native
 * Rust engine, whose `regex` crate is linear-time by construction and cannot ReDoS.
 */

/** Parsed quantifier: `*` `+` `?` `{n}` `{n,}` `{n,m}` (with optional lazy `?`). */
interface Quantifier {
  /** True for `*`, `+`, `{n,}` — no upper bound. */
  unbounded: boolean;
  /** Upper bound for bounded forms (`?`→1, `{n}`/`{n,m}`→n/m). Infinity when unbounded. */
  max: number;
  /** Index just past the quantifier (and its lazy `?`, if any). */
  end: number;
}

function readQuantifier(src: string, i: number): Quantifier | null {
  const c = src[i];
  if (c === '*' || c === '+') {
    return { unbounded: true, max: Infinity, end: skipLazy(src, i + 1) };
  }
  if (c === '?') {
    return { unbounded: false, max: 1, end: skipLazy(src, i + 1) };
  }
  if (c === '{') {
    const m = /^\{(\d+)(?:,(\d*))?\}/.exec(src.slice(i));
    if (!m) return null; // literal '{'
    const lo = parseInt(m[1], 10);
    const unbounded = m[2] === ''; // `{n,}`
    const max = unbounded
      ? Infinity
      : m[2] === undefined
        ? lo
        : parseInt(m[2], 10);
    return { unbounded, max, end: skipLazy(src, i + m[0].length) };
  }
  return null;
}

function skipLazy(src: string, i: number): number {
  return src[i] === '?' ? i + 1 : i;
}

/** Skip a character class `[...]`, honoring escapes and the leading `]` literal. */
function skipCharClass(src: string, i: number): number {
  i++; // past '['
  if (src[i] === '^') i++;
  if (src[i] === ']') i++; // first ']' is a literal
  while (i < src.length && src[i] !== ']') {
    if (src[i] === '\\') i++;
    i++;
  }
  return i + 1; // past ']'
}

/**
 * Scan a regex source for super-linear constructs. Returns a human-readable description
 * of the dangerous construct, or null when none is found. Conservative by design: it may
 * reject an exotic-but-safe pattern; it must never accept an explosive one it can model.
 */
export function findDangerousConstruct(source: string): string | null {
  // Each frame tracks whether the group body seen so far contains an unbounded quantifier.
  const stack: { hasUnbounded: boolean }[] = [{ hasUnbounded: false }];
  const top = () => stack[stack.length - 1];
  let i = 0;

  while (i < source.length) {
    const c = source[i];

    if (c === '\\') {
      i += 2;
      const q = readQuantifier(source, i);
      if (q) {
        if (q.unbounded) top().hasUnbounded = true;
        i = q.end;
      }
      continue;
    }

    if (c === '[') {
      i = skipCharClass(source, i);
      const q = readQuantifier(source, i);
      if (q) {
        if (q.unbounded) top().hasUnbounded = true;
        i = q.end;
      }
      continue;
    }

    if (c === '(') {
      stack.push({ hasUnbounded: false });
      i++;
      continue;
    }

    if (c === ')') {
      const closed = stack.pop() ?? { hasUnbounded: false };
      i++;
      const q = readQuantifier(source, i);
      if (q) {
        // Repeating (unbounded, or bounded more than once) a group that can already
        // consume unbounded input = the classic blow-up.
        if (closed.hasUnbounded && (q.unbounded || q.max > 1)) {
          return (
            `quantified group ending at index ${i - 1} repeats a body that already ` +
            `contains an unbounded quantifier (star-height > 1, e.g. "(a+)+")`
          );
        }
        if (q.unbounded || closed.hasUnbounded) top().hasUnbounded = true;
        i = q.end;
      } else if (closed.hasUnbounded) {
        top().hasUnbounded = true;
      }
      continue;
    }

    // Ordinary atom ('.', literal, '|', anchors…): a quantifier on it is linear-safe,
    // but it marks the enclosing group body as unbounded-bearing.
    i++;
    const q = readQuantifier(source, i);
    if (q) {
      if (q.unbounded) top().hasUnbounded = true;
      i = q.end;
    }
  }

  return null;
}

/**
 * Throw if a custom key pattern contains a construct that can blow up V8's backtracking
 * engine. Called once per rule at registration (init time) — never on the log hot path.
 */
export function assertSafeKeyPattern(regex: RegExp): void {
  const danger = findDangerousConstruct(regex.source);
  if (danger) {
    throw new TypeError(
      `[SyntropyLog] Unsafe masking key pattern /${regex.source}/: ${danger}. ` +
        `V8 cannot interrupt a running regex, so this pattern could hang the event loop ` +
        `(ReDoS). Rewrite it without nested quantifiers, or prefer a declarative spec-based ` +
        `rule — those cross to the native Rust engine, which is linear-time and immune.`
    );
  }
}
