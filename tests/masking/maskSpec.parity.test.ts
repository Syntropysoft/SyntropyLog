/**
 * JS half of the cross-language masking parity guard. Both this test and the Rust
 * test `shared_parity_fixture_matches` assert the SAME fixture
 * (syntropylog-native/tests/mask-parity-cases.json). When both pass, the JS
 * `applyMask` and the native `apply_mask` are byte-for-byte equivalent — that is the
 * contract that lets the engine be data-driven instead of N functions per feature.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { applyMask, type MaskSpec } from '../../src/masking/maskSpec';

interface ParityCase {
  value: string;
  spec: MaskSpec;
  expected: string;
}

const fixtureUrl = new URL(
  '../../syntropylog-native/tests/mask-parity-cases.json',
  import.meta.url
);
const cases: ParityCase[] = JSON.parse(
  readFileSync(fileURLToPath(fixtureUrl), 'utf8')
);

describe('applyMask — shared parity fixture (JS ↔ native)', () => {
  it('has a meaningful number of cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10);
  });

  it.each(cases)('masks $value → $expected', ({ value, spec, expected }) => {
    expect(applyMask(value, spec)).toBe(expected);
  });
});
