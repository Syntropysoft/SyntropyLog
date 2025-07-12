/**
 * FILE: tests/testing/index.test.ts
 * DESCRIPTION: Unit tests for the testing utilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LogEntry } from '../../src/types.js';
import { LogLevelName } from '../../src/logger/levels.js';
import { MockContextManager, SpyTransport } from '../../src/testing/index.js';

describe('Testing Utilities', () => {
  describe('SpyTransport', () => {
    let spyTransport: SpyTransport;

    // Helper to create consistent log entries for tests
    const createLogEntry = (
      level: LogLevelName,
      msg: string
    ): LogEntry => ({
      level,
      msg,
      timestamp: new Date().toISOString(),
      service: 'test-service',
    });

    beforeEach(() => {
      spyTransport = new SpyTransport();
    });

    it('should be instantiated correctly', () => {
      expect(spyTransport).toBeInstanceOf(SpyTransport);
      expect(spyTransport.getEntries()).toEqual([]);
    });

    it('should capture log entries', async () => {
      const entry1 = createLogEntry('info', 'First message');
      const entry2 = createLogEntry('warn', 'Second message');

      await spyTransport.log(entry1);
      await spyTransport.log(entry2);

      expect(spyTransport.getEntries()).toHaveLength(2);
      expect(spyTransport.getEntries()).toEqual([entry1, entry2]);
    });

    it('should clear captured entries', async () => {
      const entry = createLogEntry('info', 'message');
      await spyTransport.log(entry);
      expect(spyTransport.getEntries()).toHaveLength(1);

      spyTransport.clear();
      expect(spyTransport.getEntries()).toHaveLength(0);
    });

    it('should find entries with a predicate', async () => {
      const infoEntry = createLogEntry('info', 'info message');
      const warnEntry = createLogEntry('warn', 'warn message');
      await spyTransport.log(infoEntry);
      await spyTransport.log(warnEntry);

      const found = spyTransport.findEntries({ level: 'warn' });
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(warnEntry);
    });

    it('should get the first and last entry', async () => {
      const entry1 = createLogEntry('info', 'First message');
      const entry2 = createLogEntry('warn', 'Second message');
      const entry3 = createLogEntry('error', 'Third message');

      expect(spyTransport.getFirstEntry()).toBeUndefined();
      expect(spyTransport.getLastEntry()).toBeUndefined();

      await spyTransport.log(entry1);
      expect(spyTransport.getFirstEntry()).toBe(entry1);
      expect(spyTransport.getLastEntry()).toBe(entry1);

      await spyTransport.log(entry2);
      await spyTransport.log(entry3);
      expect(spyTransport.getFirstEntry()).toBe(entry1);
      expect(spyTransport.getLastEntry()).toBe(entry3);
    });
  });

  describe('MockContextManager', () => {
    let contextManager: MockContextManager;

    beforeEach(() => {
      contextManager = new MockContextManager();
    });

    it('should set and get values within a run block and isolate them', () => {
      const callback = () => {
        contextManager.set('key', 'value');
        expect(contextManager.get('key')).toBe('value');
      };
      contextManager.run(callback);
      // After the run block, the context modifications should be gone.
      expect(contextManager.get('key')).toBeUndefined();
    });

    it('should isolate context between different runs', () => {
      contextManager.run(() => {
        contextManager.set('id', 'run1');
        expect(contextManager.get('id')).toBe('run1');
      });

      // The context from the first run should be gone.
      expect(contextManager.get('id')).toBeUndefined();

      contextManager.run(() => {
        expect(contextManager.get('id')).toBeUndefined();
        contextManager.set('id', 'run2');
        expect(contextManager.get('id')).toBe('run2');
      });
    });

    it('should handle nested runs by inheriting and isolating context', () => {
      contextManager.run(() => {
        contextManager.set('scope', 'outer');
        contextManager.run(() => {
          expect(contextManager.get('scope')).toBe('outer');
        });
        expect(contextManager.get('scope')).toBe('outer');
      });
      expect(contextManager.get('scope')).toBeUndefined();
    });
  });
});