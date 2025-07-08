import { describe, expect, it, vi } from 'vitest';
/**
 * FILE: tests/doctor.test.ts
 * DESCRIPTION: Unit tests for the public doctor entry point.
*/

// Mock the dependency before any imports.
// This ensures that when `src/doctor.ts` is imported, it receives our mocked version of `cli/checks`.
import * as doctor from '../src/doctor';

// Import the mocked dependency to compare against.
import { coreRules as originalCoreRules } from '../src/cli/checks';
import type { DiagnosticRule, CheckResult } from '../src/doctor';

vi.mock('../src/cli/checks', () => ({
  coreRules: [
    {
      id: 'test-rule',
      description: 'A test rule.',
      // The check function must return an array of CheckResult to match the type.
      check: () => [{
        level: 'INFO',
        title: 'Mocked Check',
        message: 'This is a result from a mocked rule.',
      }],
    },
  ],
}));

// Import the module we are testing.

describe('src/doctor.ts', () => {
  it('should re-export `coreRules` from ./cli/checks', () => {
    // Assert that the `coreRules` exported from `doctor.ts` is the same
    // as the `coreRules` from our mocked `cli/checks.ts`.
    expect(doctor.coreRules).toBe(originalCoreRules);
    expect(doctor.coreRules).toHaveLength(1);
    expect(doctor.coreRules[0].id).toBe('test-rule');
  });

  it('should allow types to be imported (compile-time check)', () => {
    // This test doesn't perform runtime checks for types, but it serves as
    // a compile-time validation that the types are correctly exported.
    // If this code compiles, it means the types are available to consumers.
    const sampleRule: DiagnosticRule = {
      id: 'sample-rule',
      description: 'A sample rule to check the DiagnosticRule type.',
      // Corrected to return CheckResult[] to match the DiagnosticRule type definition.
      check: () => [
        {
          level: 'INFO',
          title: 'Sample Check Passed',
          message: 'This check confirms the type is correctly applied.',
        },
      ],
    };

    // A minimal runtime assertion to make the test valid.
    expect(sampleRule.id).toBe('sample-rule');
    expect(typeof sampleRule.check).toBe('function');
  });
});