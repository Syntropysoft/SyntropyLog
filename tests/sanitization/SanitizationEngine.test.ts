/**
 * FILE: tests/sanitization/SanitizationEngine.test.ts
 * DESCRIPTION: Unit tests for the SanitizationEngine class.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SanitizationEngine } from '../../src/sanitization/SanitizationEngine';

// Mock regex-test to avoid spawning child processes during tests
vi.mock('regex-test', () => {
  return {
    default: class MockRegexTest {
      constructor() {}
      test(regex: RegExp, input: string) {
        return Promise.resolve(regex.test(input));
      }
      cleanWorker() {}
    },
  };
});

describe('SanitizationEngine', () => {
  let engine: SanitizationEngine;

  beforeEach(() => {
    engine = new SanitizationEngine();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('String Sanitization', () => {
    it('should remove ANSI escape codes from a string', async () => {
      const dirtyString = 'This is a \u001b[31mred\u001b[39m string.';
      const cleanString = 'This is a red string.';
      const result = await engine.process({ message: dirtyString });
      expect(result.message).toBe(cleanString);
    });

    it('should not modify a string without ANSI codes', async () => {
      const cleanString = 'This is a clean string.';
      const result = await engine.process({ message: cleanString });
      expect(result.message).toBe(cleanString);
    });

    it('should handle multiple ANSI codes in a single string', async () => {
      const dirtyString =
        '\u001b[1m\u001b[34mBold and blue\u001b[39m\u001b[22m';
      const cleanString = 'Bold and blue';
      const result = await engine.process({ text: dirtyString });
      expect(result.text).toBe(cleanString);
    });
  });

  describe('Recursive Processing', () => {
    it('should sanitize strings in a nested object', async () => {
      const dirtyObject = {
        level1: {
          text: 'clean',
          level2: {
            text: 'another \u001b[4munderline\u001b[24m text',
          },
        },
      };
      const result = (await engine.process(dirtyObject)) as any;
      expect(result.level1.text).toBe('clean');
      expect(result.level1.level2.text).toBe('another underline text');
    });

    it('should sanitize strings within an array', async () => {
      const dirtyArray = {
        items: [
          'clean',
          'a \u001b[32mgreen\u001b[39m item',
          'another clean one',
        ],
      };
      const result = (await engine.process(dirtyArray)) as any;
      expect(result.items).toEqual([
        'clean',
        'a green item',
        'another clean one',
      ]);
    });

    it('should sanitize strings in an array of objects', async () => {
      const dirtyData = {
        users: [
          { name: 'Alice', role: '\u001b[35mAdmin\u001b[39m' },
          { name: 'Bob', role: 'User' },
        ],
      };
      const result = (await engine.process(dirtyData)) as any;
      expect(result.users[0].role).toBe('Admin');
      expect(result.users[1].role).toBe('User');
    });
  });

  describe('Data Type Handling', () => {
    it('should not modify non-string primitive values', async () => {
      const data = {
        num: 123,
        bool: true,
        nil: null,
        undef: undefined,
      };
      const result = await engine.process(data);
      expect(result).toEqual(data);
    });

    it('should not traverse or modify RegExp objects', async () => {
      const data = {
        pattern: /^[a-z]+$/,
        description: 'A regex pattern',
      };
      const result = (await engine.process(data)) as any;
      expect(result.pattern).toBeInstanceOf(RegExp);
      expect(result.pattern).toEqual(/^[a-z]+$/);
      expect(result.description).toBe('A regex pattern');
    });

    it('should handle a complex object with mixed types', async () => {
      const complexObject = {
        id: 1,
        details: {
          title: 'A \u001b[1mBold\u001b[22m Title',
          tags: ['tag1', '\u001b[33myellow-tag\u001b[39m'],
          active: true,
        },
        status: null,
      };
      const result = await engine.process(complexObject);
      expect(result).toEqual({
        id: 1,
        details: {
          title: 'A Bold Title',
          tags: ['tag1', 'yellow-tag'],
          active: true,
        },
        status: null,
      });
    });
  });

  describe('Immutability and Edge Cases', () => {
    it('should not mutate the original object', async () => {
      const originalObject = {
        user: { name: 'test', color: '\u001b[31mred\u001b[39m' },
      };
      await engine.process(originalObject);
      expect(originalObject.user.color).toBe('\u001b[31mred\u001b[39m');
    });

    it('should handle an empty object', async () => {
      const result = await engine.process({});
      expect(result).toEqual({});
    });
  });
});
