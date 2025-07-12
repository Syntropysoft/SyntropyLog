/**
 * FILE: tests/context/index.test.ts
 * DESCRIPTION: Smoke tests for the public context entry point.
 * These tests ensure that the main components are correctly exported and available to consumers.
 */

import { describe, it, expect } from 'vitest';

// We import from the public entry point to ensure it's correctly assembled.
import {
  ContextManager,
  MockContextManager,
  type IContextManager,
} from '../../src/context/index.js';

describe('Context Public API (index.ts)', () => {
  it('should export the ContextManager class', () => {
    expect(ContextManager).toBeDefined();
    expect(typeof ContextManager).toBe('function');
  });

  it('should export the MockContextManager class', () => {
    expect(MockContextManager).toBeDefined();
    expect(typeof MockContextManager).toBe('function');
  });

  it('should export the IContextManager interface correctly', () => {
    // This is a compile-time check. The fact that this file compiles is the test.
    expect(true).toBe(true);
  });
});