/**
 * FILE: tests/index.test.ts
 * DESCRIPTION: Unit tests for the main public API entry point.
 */

import { describe, it, expect } from 'vitest';
import {
  syntropyLog,
  SyntropyLog,
  Transport,
  ConsoleTransport,
  PrettyConsoleTransport,
  CompactConsoleTransport,
  ClassicConsoleTransport,
  SpyTransport,
} from '../src/index';

describe('Main entry point (src/index.ts)', () => {
  it('should export the syntropyLog singleton instance', () => {
    expect(syntropyLog).toBeDefined();
    expect(syntropyLog).toBeInstanceOf(SyntropyLog);
  });

  it('should export Transport base class and its concrete implementations', () => {
    // Test that the base class is exported
    expect(Transport).toBeDefined();

    // Test that concrete implementations are exported and inherit from Transport
    const concreteTransports = [
      ConsoleTransport,
      PrettyConsoleTransport,
      CompactConsoleTransport,
      ClassicConsoleTransport,
      SpyTransport,
    ];

    for (const ConcreteTransport of concreteTransports) {
      const instance = new ConcreteTransport();
      expect(instance).toBeInstanceOf(Transport);
    }
  });

  it('should match the public API snapshot to prevent unintentional changes', async () => {
    // We need to import all exports to check against the snapshot
    const allExports = await import('../src/index');
    const exportedKeys = Object.keys(allExports).sort();
    expect(exportedKeys).toMatchSnapshot();
  });
});