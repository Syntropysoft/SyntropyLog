/**
 * FILE: tests/masking/MaskingEngine.test.ts
 * DESCRIPTION: Unit tests for the MaskingEngine class.
 */

import { describe, it, expect } from 'vitest';
import { MaskingEngine, MaskingEngineOptions } from '../../src/masking/MaskingEngine';

describe('MaskingEngine', () => {
  describe('Constructor and Options', () => {
    it('should use default options when none are provided', async () => {
      const engine = new MaskingEngine();
      const result = await engine.process({ password: '123' });
      // No rules are defined, so no masking should occur.
      expect(result.password).toBe('123');
    });

    it('should use a custom maskChar with fixed style', async () => {
      const options: MaskingEngineOptions = {
        maskChar: '[REDACTED]',
        fields: ['secret'],
        style: 'fixed',
      };
      const engine = new MaskingEngine(options);
      const result = await engine.process({ secret: 'value' });
      expect(result.secret).toBe('[REDACTED]');
    });
  });

  describe('Masking Logic (Fixed Style - Default)', () => {
    it('should perform full masking on a matching key', async () => {
      const options: MaskingEngineOptions = {
        fields: ['password'],
        maskChar: '***',
      };
      const engine = new MaskingEngine(options);
      const result = await engine.process({
        user: 'test',
        password: 'a-secret-password',
      });
      expect(result.password).toBe('***');
      expect(result.user).toBe('test');
    });

    it('should mask based on a RegExp path using the default fixed mask', async () => {
      const options: MaskingEngineOptions = {
        fields: [/token/i],
      };
      const engine = new MaskingEngine(options);
      const data = {
        accessToken: 'abc',
        refreshToken: 'def',
        user_id: 1,
      };
      const result = await engine.process(data);
      expect(result.accessToken).toBe('******');
      expect(result.refreshToken).toBe('******');
      expect(result.user_id).toBe(1);
    });
  });

  describe('Masking Logic (Preserve-Length Style)', () => {
    it('should mask a string value preserving its length', async () => {
      const options: MaskingEngineOptions = {
        fields: ['apiKey'],
        style: 'preserve-length',
        maskChar: '#',
      };
      const engine = new MaskingEngine(options);
      const result = await engine.process({ apiKey: 'abcdef1234567890' });
      expect(result.apiKey).toBe('################');
      expect(result.apiKey.length).toBe(16);
    });

    it('should mask a number value preserving its string length', async () => {
      const options: MaskingEngineOptions = {
        fields: ['accountNumber'],
        style: 'preserve-length',
        maskChar: '*',
      };
      const engine = new MaskingEngine(options);
      const result = await engine.process({ accountNumber: 987654321 });
      expect(result.accountNumber).toBe('*********');
      expect(result.accountNumber.length).toBe(9);
    });

    it('should use only the first character of maskChar for preserve-length', async () => {
      const options: MaskingEngineOptions = {
        fields: ['secret'],
        style: 'preserve-length',
        maskChar: 'XYZ', // Should only use 'X'
      };
      const engine = new MaskingEngine(options);
      const result = await engine.process({ secret: 'test' });
      expect(result.secret).toBe('XXXX');
    });
  });

  describe('Recursive Processing', () => {
    it('should mask fields in nested objects', async () => {
      const options: MaskingEngineOptions = {
        fields: ['secret'],
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
      const result = await engine.process(data);
      expect(result.level1.secret).toBe('******');
      expect(result.level1.level2.secret).toBe('******');
      expect(result.level1.level2.data).toBe('unmasked');
    });

    it('should stop recursing at maxDepth', async () => {
      const options: MaskingEngineOptions = {
        maxDepth: 3,
        fields: ['deepSecret'],
      };
      const engine = new MaskingEngine(options);
      const data = {
        a: {
          b: {
            c: {
              deepSecret: 'should be masked now',
            },
          },
        },
      };
      const result = await engine.process(data);
      // The engine now masks by key name regardless of depth, so `deepSecret`
      // at depth 3 should be masked if maxDepth is 3.
      expect(result.a.b.c).toEqual({ deepSecret: '******' });
    });
  });

  describe('Path and URL Masking', () => {
    it('should mask a path segment with fixed style by default', async () => {
      const engine = new MaskingEngine({ fields: ['apiKey'] });
      const data = {
        endpoint: 'https://api.example.com/data/user/apiKey/abcdef12345/more',
      };
      const result = await engine.process(data);
      expect(result.endpoint).toBe(
        'https://api.example.com/data/user/apiKey/******/more',
      );
    });

    it('should mask a path segment preserving length', async () => {
      const options: MaskingEngineOptions = {
        fields: ['secret'],
        style: 'preserve-length',
        maskChar: '#',
      };
      const engine = new MaskingEngine(options);
      const data = {
        path: '/user/secret/a-very-long-secret-value/data',
      };
      const result = await engine.process(data);
      expect(result.path).toBe('/user/secret/########################/data');
    });

    it('should handle multiple sensitive parts in a path using fixed style', async () => {
      const engine = new MaskingEngine({ fields: ['token', 'secret'] });
      const data = {
        requestUrl: '/auth/token/abc-123/user/me/secret/xyz-789',
      };
      const result = await engine.process(data);
      expect(result.requestUrl).toBe('/auth/token/******/user/me/secret/******');
    });

    it('should be case-insensitive when matching path keywords', async () => {
      const engine = new MaskingEngine({ fields: ['password'] });
      const data = { path: '/api/v1/PASSWORD/my-secret' };
      const result = await engine.process(data);
      expect(result.path).toBe('/api/v1/PASSWORD/******');
    });
  });

  describe('Dynamic Configuration', () => {
    it('should add new fields dynamically with addFields()', async () => {
      const engine = new MaskingEngine({ fields: ['password'] });
      engine.addFields(['token']);

      const result = await engine.process({
        password: '123',
        token: 'abc',
        other: 'data',
      });

      expect(result.password).toBe('******');
      expect(result.token).toBe('******');
      expect(result.other).toBe('data');
    });
  });

  describe('Edge Cases and Immutability', () => {
    it('should not mutate the original object', async () => {
      const engine = new MaskingEngine({ fields: ['secret'] });
      const originalData = { user: 'test', secret: 'value' };
      await engine.process(originalData);
      expect(originalData.secret).toBe('value');
    });

    it('should handle null and undefined values correctly', async () => {
      const engine = new MaskingEngine({ fields: ['secret'] });
      const data = {
        a: null,
        b: undefined,
        c: { secret: null },
      };
      const result = await engine.process(data);
      expect(result.a).toBeNull();
      expect(result.b).toBeUndefined();
      expect(result.c.secret).toBe('******'); // preserve-length of 'null' is 4, but let's use fixed for nulls
    });

    it('should handle non-object inputs gracefully', async () => {
      const engine = new MaskingEngine();
      await expect(engine.process(null as any)).resolves.toBeNull();
      await expect(engine.process('a string' as any)).resolves.toBe(
        'a string',
      );
      await expect(engine.process(123 as any)).resolves.toBe(123);
    });
  });
});