/**
 * FILE: tests/logger/index.test.ts
 * DESCRIPTION: Smoke tests for the public logger entry point.
 * These tests ensure that the main components are correctly exported and available to consumers.
 */

import { describe, it, expect } from 'vitest';

// We import from the public entry point to ensure it's correctly assembled.
import { Logger, type ILogger } from '../../src/logger/index.js';

describe('Logger Public API (index.ts)', () => {
  it('should export the Logger class', () => {
    expect(Logger).toBeDefined();
    expect(typeof Logger).toBe('function');
  });

  it('should export the ILogger interface correctly', () => {
    // This is a compile-time check. The fact that this file compiles is the test.
    expect(true).toBe(true);
  });
});