/**
 * FILE: tests/type-exports.test.ts
 * DESCRIPTION: Smoke test for type exports and P0 regression: index exports must be in type-exports.
 */

import { describe, it, expect } from 'vitest';

// Import types to verify they exist (compile-time check)
import type {
  SyntropyLogConfig,
  ILogger,
  IContextManager,
  LogEntry,
  LogFormatter,
} from '../src/type-exports';

describe('Type Exports Smoke Test', () => {
  it('should export core types without errors', () => {
    expect(typeof SyntropyLogConfig).toBeDefined();
    expect(typeof ILogger).toBeDefined();
    expect(typeof IContextManager).toBeDefined();
    expect(typeof LogEntry).toBeDefined();
  });

  it('should export transport types without errors', () => {
    expect(typeof LogFormatter).toBeDefined();
  });
});

/**
 * P0 regression: every runtime export from index must exist in type-exports
 * so that dist/index.d.ts stays complete (rollup-plugin-dts uses type-exports as entry).
 */
describe('P0: index exports ⊆ type-exports', () => {
  it('every export from index.ts must be present in type-exports.ts', async () => {
    const indexExports = await import('../src/index');
    const typeExportsModule = await import('../src/type-exports');

    const indexKeys = Object.keys(indexExports).filter((k) => k !== 'default');
    const typeExportKeys = new Set(Object.keys(typeExportsModule));

    const missing: string[] = indexKeys.filter((k) => !typeExportKeys.has(k));
    expect(
      missing,
      `Add these to src/type-exports.ts so .d.ts stays complete: ${missing.join(', ')}`
    ).toEqual([]);
  });
});
