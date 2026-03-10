/**
 * FILE: tests/serialization/DataSanitizer.test.ts
 * DESCRIPTION: Unit tests for DataSanitizer
 */
import { describe, it, expect } from 'vitest';
import { DataSanitizer } from '../../src/serialization/utils/DataSanitizer';

describe('DataSanitizer', () => {
  const sanitizer = new DataSanitizer();

  it('should return null as-is', () => {
    expect(sanitizer.sanitize(null as any)).toBeNull();
  });

  it('should return undefined as-is', () => {
    expect(sanitizer.sanitize(undefined as any)).toBeUndefined();
  });

  it('should return string as-is', () => {
    expect(sanitizer.sanitize('hello')).toBe('hello');
  });

  it('should return number as-is', () => {
    expect(sanitizer.sanitize(42 as any)).toBe(42);
  });

  it('should return boolean as-is', () => {
    expect(sanitizer.sanitize(true as any)).toBe(true);
  });

  it('should redact default sensitive fields', () => {
    const data = { password: 'secret', username: 'john' };
    const result = sanitizer.sanitize(data) as any;
    expect(result.password).toBe('[REDACTED]');
    expect(result.username).toBe('john');
  });

  it('should use custom sensitive fields', () => {
    const data = { myCustomField: 'value', safe: 'data' };
    const result = sanitizer.sanitize(data, {
      sensitiveFields: ['mycustomfield'],
    }) as any;
    expect(result.myCustomField).toBe('[REDACTED]');
    expect(result.safe).toBe('data');
  });

  it('should handle nested objects recursively', () => {
    const data = { user: { auth: 'token123', name: 'Alice' } };
    const result = sanitizer.sanitize(data) as any;
    expect(result.user.auth).toBe('[REDACTED]');
    expect(result.user.name).toBe('Alice');
  });

  it('should handle arrays with sensitive values', () => {
    const data = [
      { password: 'abc', id: 1 },
      { password: 'xyz', id: 2 },
    ];
    const result = sanitizer.sanitize(data as any) as any;
    expect(result[0].password).toBe('[REDACTED]');
    expect(result[0].id).toBe(1);
    expect(result[1].password).toBe('[REDACTED]');
    expect(result[1].id).toBe(2);
  });

  it('should enforce maxDepth limit and return [MAX_DEPTH_REACHED]', () => {
    const nested = { a: { b: { c: { d: { e: 'deep' } } } } };
    const result = sanitizer.sanitize(nested as any, { maxDepth: 2 }) as any;
    // We expect the deep nested level to get cut off
    expect(result.a.b).toBe('[MAX_DEPTH_REACHED]');
  });

  it('should handle non-sensitive keys that are objects — no mutation when unchanged', () => {
    const data = { safe: { nested: 'value' } };
    const result = sanitizer.sanitize(data) as any;
    expect(result.safe.nested).toBe('value');
  });
});
