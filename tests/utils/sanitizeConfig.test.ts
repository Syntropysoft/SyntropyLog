/**
 * FILE: tests/utils/sanitizeConfig.test.ts
 * DESCRIPTION: Unit tests for the configuration sanitization utility.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeConfig } from '../../src/utils/sanitizeConfig';
import { Transport } from '../../src/logger/transports/Transport';
import { IHttpClientAdapter } from '../../src/http/adapters/adapter.types';
import { IBrokerAdapter } from '../../src/brokers';

const MASK = '[CONFIG_MASKED]';

// --- Mocks for special instances ---

class MockTransport extends Transport {
  log() {
    return Promise.resolve();
  }
}

const mockHttpAdapter: IHttpClientAdapter = {
  request: () => Promise.resolve({ statusCode: 200, data: {}, headers: {} }),
};

const mockBrokerAdapter: IBrokerAdapter = {
  publish: () => Promise.resolve(),
  subscribe: () => Promise.resolve(),
  disconnect: () => Promise.resolve(),
};

// --- Tests ---

describe('sanitizeConfig', () => {
  describe('Basic Sanitization', () => {
    it('should mask known sensitive keys', () => {
      const config = {
        user: 'test',
        password: '123',
        secret: 'abc',
        other: 'value',
      };
      const result = sanitizeConfig(config);
      expect(result).toEqual({
        user: 'test',
        password: MASK,
        secret: MASK,
        other: 'value',
      });
    });

    it('should be case-insensitive when matching sensitive keys', () => {
      const config = {
        User: 'test',
        Password: '123',
        APIKEY: 'abc-def',
        RefreshToken: 'xyz-987',
      };
      const result = sanitizeConfig(config);
      expect(result).toEqual({
        User: 'test',
        Password: MASK,
        APIKEY: MASK,
        RefreshToken: MASK,
      });
    });
  });

  describe('URL Sanitization', () => {
    it('should mask the password in a URL string', () => {
      const config = {
        dbUrl: 'postgres://user:supersecret@host:5432/db',
      };
      const result = sanitizeConfig(config);
      expect(result.dbUrl).toBe(`postgres://user:${MASK}@host:5432/db`);
    });

    it('should not modify a URL without credentials', () => {
      const url = 'https://api.example.com/data';
      const result = sanitizeConfig({ url });
      expect(result.url).toBe(url);
    });
  });

  describe('Recursive Processing', () => {
    it('should sanitize nested objects', () => {
      const config = {
        database: {
          host: 'localhost',
          auth: {
            user: 'admin',
            pass: 'admin-pass',
          },
        },
      };
      const result = sanitizeConfig(config);
      expect(result.database.auth.pass).toBe(MASK);
      expect(result.database.auth.user).toBe('admin');
    });

    it('should sanitize objects within an array', () => {
      const config = {
        connections: [
          { name: 'primary', token: 'token1' },
          { name: 'secondary', token: 'token2' },
        ],
      };
      const result = sanitizeConfig(config);
      expect(result.connections[0].token).toBe(MASK);
      expect(result.connections[1].token).toBe(MASK);
    });
  });

  describe('Special Instance Handling', () => {
    it('should not sanitize or clone Transport instances', () => {
      const transport = new MockTransport();
      const config = { transports: [transport] };
      const result = sanitizeConfig(config);
      expect(result.transports[0]).toBe(transport);
    });

    it('should not sanitize or clone HTTP Adapter instances', () => {
      const config = { adapter: mockHttpAdapter, secret: '123' };
      const result = sanitizeConfig(config);
      expect(result.adapter).toBe(mockHttpAdapter);
      expect(result.secret).toBe(MASK);
    });

    it('should not sanitize or clone Broker Adapter instances', () => {
      const config = { broker: mockBrokerAdapter, password: 'abc' };
      const result = sanitizeConfig(config);
      expect(result.broker).toBe(mockBrokerAdapter);
      expect(result.password).toBe(MASK);
    });
  });

  describe('Immutability and Edge Cases', () => {
    it('should not modify the original object', () => {
      const originalConfig = { password: '123' };
      sanitizeConfig(originalConfig);
      expect(originalConfig.password).toBe('123');
    });

    it('should handle null and non-object inputs gracefully', () => {
      expect(sanitizeConfig(null as any)).toBeNull();
      expect(sanitizeConfig('a string' as any)).toBe('a string');
    });
  });
});