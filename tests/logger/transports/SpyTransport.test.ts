/**
 * FILE: tests/logger/transports/SpyTransport.test.ts
 * DESCRIPTION: Unit tests for the SpyTransport class.
 */

import { describe, it, expect, vi } from 'vitest';
import { SpyTransport } from '../../../src/logger/transports/SpyTransport';
import { LogEntry } from '../../../src/types';

describe('SpyTransport', () => {
  let transport: SpyTransport;

  const entry1: LogEntry = {
    level: 'info',
    message: 'This is a test message.',
    service: 'test-service',
    timestamp: new Date().toISOString(),
  };
  const entry2: LogEntry = {
    level: 'warn',
    message: 'Another test message.',
    service: 'test-service',
    timestamp: new Date().toISOString(),
    userId: 123,
  };
  const entry3: LogEntry = {
    level: 'info',
    message: 'A final test message.',
    service: 'test-service',
    timestamp: new Date().toISOString(),
    userId: 456,
  };

  beforeEach(() => {
    transport = new SpyTransport();
  });

  describe('log', () => {
    it('should store the log entry in its internal array', async () => {
      expect(transport.getEntries()).toHaveLength(0);
      await transport.log(entry1);
      expect(transport.getEntries()).toHaveLength(1);
      expect(transport.getEntries()[0]).toBe(entry1);
    });
  });

  describe('getEntries', () => {
    it('should return all captured log entries', async () => {
      await transport.log(entry1);
      await transport.log(entry2);
      expect(transport.getEntries()).toEqual([entry1, entry2]);
    });

    it('should return an empty array if no entries have been logged', () => {
      expect(transport.getEntries()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all captured log entries', async () => {
      await transport.log(entry1);
      await transport.log(entry2);
      expect(transport.getEntries()).toHaveLength(2);

      transport.clear();
      expect(transport.getEntries()).toHaveLength(0);
    });
  });

  describe('findEntries', () => {
    beforeEach(async () => {
      await transport.log(entry1);
      await transport.log(entry2);
      await transport.log(entry3);
    });

    it('should find entries matching a single property predicate', () => {
      const found = transport.findEntries({ level: 'warn' });
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(entry2);
    });

    it('should find multiple entries matching a predicate', () => {
      const found = transport.findEntries({ level: 'info' });
      expect(found).toHaveLength(2);
      expect(found).toEqual([entry1, entry3]);
    });

    it('should find entries matching a multi-property predicate', () => {
      const found = transport.findEntries({ level: 'info', userId: 456 });
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(entry3);
    });

    it('should return an empty array if no entries match the predicate', () => {
      const found = transport.findEntries({ level: 'error' });
      expect(found).toHaveLength(0);
    });

    it('should handle predicates with undefined values', () => {
      // All entries have an implicit `source: undefined`
      const found = transport.findEntries({ source: undefined });
      expect(found).toHaveLength(3);
    });

    it('should find entries using a function predicate', () => {
      const found = transport.findEntries((entry) => entry.message.includes('Another'));
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(entry2);
    });
  });

  describe('flush', () => {
    it('should resolve immediately as it does not buffer', async () => {
      await expect(transport.flush()).resolves.toBeUndefined();
    });
  });

  describe('getFirstEntry and getLastEntry', () => {
    it('should return undefined when no entries are present', () => {
      expect(transport.getFirstEntry()).toBeUndefined();
      expect(transport.getLastEntry()).toBeUndefined();
    });

    it('should return the same entry when only one is present', async () => {
      await transport.log(entry1);
      expect(transport.getFirstEntry()).toBe(entry1);
      expect(transport.getLastEntry()).toBe(entry1);
    });

    it('should return the first and last entries correctly when multiple are present', async () => {
      await transport.log(entry1);
      await transport.log(entry2);
      await transport.log(entry3);
      expect(transport.getFirstEntry()).toBe(entry1);
      expect(transport.getLastEntry()).toBe(entry3);
    });
  });
});