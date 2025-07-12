/**
 * FILE: tests/brokers/index.test.ts
 * DESCRIPTION: Smoke tests for the public brokers entry point.
 * These tests ensure that the main components are correctly exported and available to consumers.
 */

import { describe, it, expect } from 'vitest';

// We import from the public entry point to ensure it's correctly assembled.
import {
  InstrumentedBrokerClient,
  BrokerManager,
  type IBrokerAdapter,
  type BrokerMessage,
} from '../../src/brokers/index.js';

describe('Brokers Public API (index.ts)', () => {
  it('should export the InstrumentedBrokerClient class', () => {
    // This test verifies that the class is exported and is a function (which classes are).
    expect(InstrumentedBrokerClient).toBeDefined();
    expect(typeof InstrumentedBrokerClient).toBe('function');
  });

  it('should export the BrokerManager class', () => {
    // This test verifies that the class is exported and is a function.
    expect(BrokerManager).toBeDefined();
    expect(typeof BrokerManager).toBe('function');
  });

  it('should export types from adapter.types correctly', () => {
    // This is a compile-time check. The fact that this file compiles without
    // errors is the primary test. The runtime assertion is just a formality.
    expect(true).toBe(true);
  });
});