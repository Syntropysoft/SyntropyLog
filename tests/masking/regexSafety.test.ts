/**
 * FILE: tests/masking/regexSafety.test.ts
 * DESCRIPTION: Static ReDoS rejection — deterministic tests (no timing races, on purpose:
 * we never trigger real catastrophic backtracking, which is engine-version-dependent).
 * Every "dangerous" pattern below was MEASURED to hang V8 (>3s on ≤40 chars, 2026-07-10),
 * except where noted as the documented residual.
 */

import { describe, it, expect } from 'vitest';
import {
  findDangerousConstruct,
  assertSafeKeyPattern,
} from '../../src/masking/regexSafety';
import { MaskingEngine, MaskingStrategy } from '../../src/masking/MaskingEngine';

describe('findDangerousConstruct', () => {
  describe('rejects the measured-explosive classes', () => {
    const dangerous = [
      '(a+)+$', // classic nested quantifier — hangs V8 at 40 chars
      '([a-z]+)*$', // hangs V8
      '(a*)*$', // hangs V8
      '(\\w+)*', // word-class variant
      '(.*a){25}', // counted repetition of an unbounded body
      '(a+){2,}', // bounded-min repetition of an unbounded body
      '((b|c)+d?)+', // nesting one level deeper
    ];
    for (const p of dangerous) {
      it(`rejects ${p}`, () => {
        expect(findDangerousConstruct(p)).not.toBeNull();
      });
    }
  });

  describe('accepts the patterns real rules use', () => {
    const safe = [
      'email',
      'credit_card|creditcard|card_number|cardnumber|payment_number',
      'ssn|social_security|security_number',
      '^user_(id|name)$',
      'pass(word)?',
      '(foo|bar)+', // star-height 1: no inner quantifier
      'a{3}', // bounded atom repetition
      '[a-z]+@[a-z]+', // quantified classes, never nested
      '\\d+-\\d+',
      '(a+)?', // group repeated at most once — cannot amplify
    ];
    for (const p of safe) {
      it(`accepts ${p}`, () => {
        expect(findDangerousConstruct(p)).toBeNull();
      });
    }
  });

  it('handles escapes and character classes without false positives', () => {
    // '*' and '+' inside a class or escaped are literals, not quantifiers.
    expect(findDangerousConstruct('([*+]+)')).toBeNull();
    expect(findDangerousConstruct('(\\+\\d+)')).toBeNull();
  });

  it('documented residual: overlapping alternation is NOT detected (Rust path eliminates it)', () => {
    // (a|a)*$ also hangs V8, but detecting it needs NFA ambiguity analysis. Kept honest here:
    // this test pins the KNOWN limitation so a future improvement flips it consciously.
    expect(findDangerousConstruct('(a|a)*$')).toBeNull();
  });
});

describe('assertSafeKeyPattern + MaskingEngine wiring', () => {
  it('throws a clear TypeError naming the pattern and the fix', () => {
    expect(() => assertSafeKeyPattern(/(a+)+$/)).toThrowError(
      /Unsafe masking key pattern.*ReDoS.*declarative/s
    );
  });

  it('MaskingEngine rejects a dangerous custom rule at construction (init-time, fail-fast)', () => {
    expect(
      () =>
        new MaskingEngine({
          rules: [{ pattern: '(a+)+$', strategy: MaskingStrategy.PASSWORD }],
        })
    ).toThrowError(/Unsafe masking key pattern/);
  });

  it('MaskingEngine still accepts safe custom rules', () => {
    const engine = new MaskingEngine({
      rules: [{ pattern: 'internal_secret', strategy: MaskingStrategy.PASSWORD }],
    });
    expect(engine).toBeDefined();
  });

  it('default rules are unaffected (known-safe, skip the check)', () => {
    expect(() => new MaskingEngine({ enableDefaultRules: true })).not.toThrow();
  });
});

describe('over-long keys: truncate, never skip (fail-closed)', () => {
  it('a >256-char key matching a custom rule in its prefix is still masked', async () => {
    const engine = new MaskingEngine({
      enableDefaultRules: false,
      rules: [{ pattern: 'internal_secret', strategy: MaskingStrategy.PASSWORD }],
    });
    const longKey = 'internal_secret_' + 'x'.repeat(300); // old behavior: skipped → leaked
    const out = (await engine.process({ [longKey]: 'sensitive-value' })) as Record<
      string,
      unknown
    >;
    expect(out[longKey]).not.toBe('sensitive-value');
  });
});
