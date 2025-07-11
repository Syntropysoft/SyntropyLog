/**
 * FILE: tests/masking/MaskingEngine.test.ts
 * DESCRIPTION: Unit tests for the MaskingEngine class.
 */

import { describe, it, expect } from 'vitest';
import { MaskingEngine, MaskingEngineOptions } from '../../src/masking/MaskingEngine';

describe('MaskingEngine', () => {
  describe('Constructor and Options', () => {
    it('should use default options when none are provided', () => {
      const engine = new MaskingEngine();
      const result = engine.process({ password: '123' });
      // No rules are defined, so no masking should occur.
      expect(result.password).toBe('123');
    });

    it('should use a custom maskChar', () => {
      const options: MaskingEngineOptions = {
        maskChar: '[REDACTED]',
        fields: [{ path: 'secret', type: 'full' }],
      };
      const engine = new MaskingEngine(options);
      const result = engine.process({ secret: 'value' });
      expect(result.secret).toBe('[REDACTED]');
    });
  });

  describe('Masking Logic', () => {
    it('should perform full masking on a matching key', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: 'password', type: 'full' }],
        maskChar: '***',
      };
      const engine = new MaskingEngine(options);
      const result = engine.process({ user: 'test', password: 'a-secret-password' });
      expect(result.password).toBe('***');
      expect(result.user).toBe('test');
    });

    it('should perform partial masking with default showLast (4)', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: 'creditCard', type: 'partial' }],
      };
      const engine = new MaskingEngine(options);
      const result = engine.process({ creditCard: '1234567890123456' });
      expect(result.creditCard).toBe('******3456');
    });

    it('should perform partial masking with custom showLast', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: 'apiKey', type: 'partial', showLast: 6 }],
      };
      const engine = new MaskingEngine(options);
      const result = engine.process({ apiKey: 'abcdefghijklmnopqrstuvwxyz' });
      expect(result.apiKey).toBe('******uvwxyz');
    });

    it('should mask based on a RegExp path', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: /token/i, type: 'full' }],
      };
      const engine = new MaskingEngine(options);
      const data = {
        accessToken: 'abc',
        refreshToken: 'def',
        user_id: 1,
      };
      const result = engine.process(data);
      expect(result.accessToken).toBe('******');
      expect(result.refreshToken).toBe('******');
      expect(result.user_id).toBe(1);
    });
  });

  describe('Recursive Processing', () => {
    it('should mask fields in nested objects', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: 'secret', type: 'full' }],
      };
      const engine = new MaskingEngine(options);
      const data = {
        level1: {
          secret: 'level1_secret',
          level2: {
            secret: 'level2_secret',
            data: 'unmasked',
          },
        },
      };
      const result = engine.process(data);
      expect(result.level1.secret).toBe('******');
      expect(result.level1.level2.secret).toBe('******');
      expect(result.level1.level2.data).toBe('unmasked');
    });

    it('should mask fields in arrays of objects', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: 'password', type: 'full' }],
      };
      const engine = new MaskingEngine(options);
      const data = {
        users: [
          { name: 'Alice', password: '123' },
          { name: 'Bob', password: '456' },
        ],
      };
      const result = engine.process(data);
      expect(result.users[0].password).toBe('******');
      expect(result.users[1].password).toBe('******');
      expect(result.users[0].name).toBe('Alice');
    });

    it('should stop recursing at maxDepth', () => {
      const options: MaskingEngineOptions = {
        maxDepth: 3,
        fields: [{ path: 'deepSecret', type: 'full' }],
      };
      const engine = new MaskingEngine(options);
      const data = {
        a: {
          b: {
            c: {
              deepSecret: 'should not be masked',
            },
          },
        },
      };
      const result = engine.process(data);
      // The engine stops at depth 3 (object `c`), so it doesn't process its children.
      // The value of `c` is returned as is.
      expect(result.a.b.c).toEqual({ deepSecret: 'should not be masked' });
    });
  });

  describe('URL Sanitization', () => {
    it('should sanitize sensitive query parameters in a URL string value', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: 'apiKey', type: 'full' }],
      };
      const engine = new MaskingEngine(options);
      const data = {
        endpoint: 'https://api.example.com/data?user=test&apiKey=abcdef12345',
      };
      const result = engine.process(data);
      expect(result.endpoint).toBe('https://api.example.com/data?user=test&apiKey=******');
    });

    it('should not modify non-sensitive query parameters', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: 'password', type: 'full' }],
      };
      const engine = new MaskingEngine(options);
      const data = {
        url: 'https://api.example.com/data?user=test&session=active',
      };
      const result = engine.process(data);
      expect(result.url).toBe('https://api.example.com/data?user=test&session=active');
    });

    it('should handle multiple sensitive query parameters', () => {
      const options: MaskingEngineOptions = {
        fields: [
          { path: 'token', type: 'full' },
          { path: 'secret', type: 'partial', showLast: 2 },
        ],
      };
      const engine = new MaskingEngine(options);
      const data = {
        requestUrl: 'https://api.service.com/auth?token=abc-123&user=me&secret=xyz-789',
      };
      const result = engine.process(data);
      expect(result.requestUrl).toBe('https://api.service.com/auth?token=******&user=me&secret=******89');
    });

    it('should return an invalid URL string as-is', () => {
      const engine = new MaskingEngine();
      const data = { url: 'not-a-valid-url' };
      const result = engine.process(data);
      expect(result.url).toBe('not-a-valid-url');
    });
  });

  describe('Edge Cases and Immutability', () => {
    it('should not mutate the original object', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: 'secret', type: 'full' }],
      };
      const engine = new MaskingEngine(options);
      const originalData = { user: 'test', secret: 'value' };
      engine.process(originalData);
      expect(originalData.secret).toBe('value');
    });

    it('should handle null and undefined values correctly', () => {
      const options: MaskingEngineOptions = {
        fields: [{ path: 'secret', type: 'full' }],
      };
      const engine = new MaskingEngine(options);
      const data = {
        a: null,
        b: undefined,
        c: { secret: null },
      };
      const result = engine.process(data);
      expect(result.a).toBeNull();
      expect(result.b).toBeUndefined();
      // String(null) is 'null', which gets masked.
      expect(result.c.secret).toBe('******');
    });

    it('should handle non-object inputs gracefully', () => {
      const engine = new MaskingEngine();
      expect(engine.process(null as any)).toBeNull();
      expect(engine.process('a string' as any)).toBe('a string');
      expect(engine.process(123 as any)).toBe(123);
    });
  });
});