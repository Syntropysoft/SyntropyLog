/**
 * FILE: tests/index.test.ts
 * DESCRIPTION: Unit tests for the main public API entry point.
 */

import { describe, it, expect } from 'vitest';
import * as allExports from '../src/index';
import { SyntropyLog } from '../src/SyntropyLog';

describe('Main entry point (src/index.ts)', () => {
  it('should export the syntropyLog singleton instance', () => {
    expect(allExports.syntropyLog).toBeDefined();
    // The singleton is an instance of the SyntropyLog class.
    // Importing the class for this check makes the test more robust.
    expect(allExports.syntropyLog).toBeInstanceOf(SyntropyLog);
  });

  it('should export Transport base class and its implementations', () => {
    const transportExports = {
      Transport: allExports.Transport,
      ConsoleTransport: allExports.ConsoleTransport,
      PrettyConsoleTransport: allExports.PrettyConsoleTransport,
      CompactConsoleTransport: allExports.CompactConsoleTransport,
      ClassicConsoleTransport: allExports.ClassicConsoleTransport,
      SpyTransport: allExports.SpyTransport,
    };

    const BaseTransport = allExports.Transport;

    for (const [name, constructor] of Object.entries(transportExports)) {
      expect(constructor, `${name} should be defined`).toBeDefined();
      expect(typeof constructor, `${name} should be a class (function)`).toBe(
        'function'
      );

      // Check that implementations inherit from the base Transport class
      if (name !== 'Transport') {
        // All transport implementations can be instantiated without arguments
        const instance = new constructor();
        expect(instance).toBeInstanceOf(BaseTransport);
      }
    }
  });

  it('should match the public API snapshot to prevent unintentional changes', () => {
    const exportedKeys = Object.keys(allExports).sort();
    expect(exportedKeys).toMatchSnapshot();
    // This ensures that no new exports are added or removed without explicit approval.
    // If you intentionally change the exports, you can update the snapshot.
  });
});