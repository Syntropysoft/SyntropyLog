/**
 * Tests for config schema validators (pure predicates and Zod custom messages).
 */
import { describe, it, expect } from 'vitest';
import {
  httpInstanceConfigSchema,
  brokerInstanceConfigSchema,
  isHttpClientAdapter,
  isBrokerAdapter,
} from '../../src/config.schema';

describe('config.schema', () => {
  describe('isHttpClientAdapter (pure predicate)', () => {
    it('should return true for object with request method', () => {
      expect(isHttpClientAdapter({ request: () => Promise.resolve({}) })).toBe(
        true
      );
    });

    it('should return false for null/undefined/non-object', () => {
      expect(isHttpClientAdapter(null)).toBe(false);
      expect(isHttpClientAdapter(undefined)).toBe(false);
      expect(isHttpClientAdapter('string')).toBe(false);
    });

    it('should return false for object without request method', () => {
      expect(isHttpClientAdapter({})).toBe(false);
      expect(isHttpClientAdapter({ get: () => {} })).toBe(false);
    });
  });

  describe('isBrokerAdapter (pure predicate)', () => {
    it('should return true for object with publish and subscribe methods', () => {
      expect(
        isBrokerAdapter({
          publish: () => Promise.resolve(),
          subscribe: () => Promise.resolve(),
        })
      ).toBe(true);
    });

    it('should return false for object with only one method', () => {
      expect(isBrokerAdapter({ publish: () => {} })).toBe(false);
      expect(isBrokerAdapter({ subscribe: () => {} })).toBe(false);
    });
  });

  describe('httpInstanceConfigSchema', () => {
    it('should throw with adapter message when adapter is invalid', () => {
      expect(() =>
        httpInstanceConfigSchema.parse({
          instanceName: 'api',
          adapter: {},
        })
      ).toThrow(
        "The provided adapter is invalid. It must be an object with a 'request' method."
      );
    });
  });

  describe('brokerInstanceConfigSchema', () => {
    it('should throw with broker message when adapter is invalid', () => {
      expect(() =>
        brokerInstanceConfigSchema.parse({
          instanceName: 'broker',
          adapter: {},
        })
      ).toThrow('The provided broker adapter is invalid.');
    });
  });
});
