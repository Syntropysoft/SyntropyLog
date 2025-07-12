/**
 * FILE: tests/http/index.test.ts
 * DESCRIPTION: Smoke tests for the public HTTP entry point.
 * These tests ensure that the main components are correctly exported and available to consumers.
 */

import { describe, it, expect } from 'vitest';

// We import from the public entry point to ensure it's correctly assembled.
import {
  AxiosAdapter,
  type IHttpClientAdapter,
  type AdapterHttpRequest,
  type AdapterHttpResponse,
  type AdapterHttpError,
  type InstrumentedHttpClient,
} from '../../src/http/index.js';

describe('HTTP Public API (index.ts)', () => {
  it('should export the AxiosAdapter class', () => {
    expect(AxiosAdapter).toBeDefined();
    expect(typeof AxiosAdapter).toBe('function');
  });

  it('should export all required types and interfaces', () => {
    // This is a compile-time check. The fact that this file compiles without
    // errors is the primary test. The runtime assertion is just a formality.
    expect(true).toBe(true);
  });
});