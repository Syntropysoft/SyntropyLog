import { describe, it, expect } from 'vitest';
import { redactObject, redactHeaders } from '../../../src/http/utils/redact';

describe('redactObject', () => {
  const sensitiveKeys = ['password', 'token', 'secret'];

  it('should redact sensitive fields at the top level', () => {
    const obj = { user: 'test', password: '123', token: 'abc' };
    const result = redactObject(obj, sensitiveKeys);
    expect(result.user).toBe('test');
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
  });

  it('should redact sensitive fields in nested objects', () => {
    const obj = {
      user: 'test',
      credentials: { password: '123', secret: 'xyz' },
    };
    const result = redactObject(obj, sensitiveKeys);
    expect(result.credentials.password).toBe('[REDACTED]');
    expect(result.credentials.secret).toBe('[REDACTED]');
  });

  it('should redact sensitive fields within arrays of objects', () => {
    const obj = {
      users: [
        { id: 1, token: 'token1' },
        { id: 2, token: 'token2' },
      ],
    };
    const result = redactObject(obj, sensitiveKeys);
    expect(result.users[0].token).toBe('[REDACTED]');
    expect(result.users[1].token).toBe('[REDACTED]');
  });

  it('should be case-insensitive when matching keys', () => {
    const obj = { user: 'test', Password: '123', TOKEN: 'abc' };
    const result = redactObject(obj, sensitiveKeys);
    expect(result.Password).toBe('[REDACTED]');
    expect(result.TOKEN).toBe('[REDACTED]');
  });

  it('should not modify the original object (immutability)', () => {
    const originalObj = { user: 'test', password: '123' };
    redactObject(originalObj, sensitiveKeys);
    expect(originalObj.password).toBe('123');
  });

  it('should return the original data if it is not an object', () => {
    expect(redactObject('a string', sensitiveKeys)).toBe('a string');
    expect(redactObject(123, sensitiveKeys)).toBe(123);
    expect(redactObject(null, sensitiveKeys)).toBe(null);
  });

  it('should return the original object if sensitiveFields is empty', () => {
    const obj = { user: 'test', password: '123' };
    const result = redactObject(obj, []);
    expect(result).toEqual(obj);
    expect(result).not.toBe(obj); // Should be a clone
  });

  it('should handle max depth to prevent infinite loops', () => {
    const obj: any = { level1: { level2: { level3: {} } } };
    obj.level1.level2.level3.back = obj.level1; // Circular reference

    const result = redactObject(obj, [], 3);
    expect(result.level1.level2.level3).toBe('[REDACTED_DUE_TO_DEPTH]');
  });

  it('should handle Buffer objects without trying to redact them', () => {
    const buffer = Buffer.from('hello world');
    const obj = { data: buffer };
    const result = redactObject(obj, sensitiveKeys);
    expect(result.data).toBe(buffer);
  });
});

describe('redactHeaders', () => {
  const sensitiveHeaders = ['Authorization', 'Cookie', 'X-Api-Key'];

  it('should redact sensitive headers', () => {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer 12345',
      'x-api-key': 'secret-key',
    };
    const result = redactHeaders(headers, sensitiveHeaders);
    expect(result['Content-Type']).toBe('application/json');
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result['x-api-key']).toBe('[REDACTED]');
  });

  it('should be case-insensitive when matching header names', () => {
    const headers = {
      authorization: 'Bearer 12345',
      COOKIE: 'session=abc',
    };
    const result = redactHeaders(headers, sensitiveHeaders);
    expect(result.authorization).toBe('[REDACTED]');
    expect(result.COOKIE).toBe('[REDACTED]');
  });

  it('should not modify the original headers object (immutability)', () => {
    const originalHeaders = { Authorization: 'Bearer 12345' };
    redactHeaders(originalHeaders, sensitiveHeaders);
    expect(originalHeaders.Authorization).toBe('Bearer 12345');
  });

  it('should return the original headers if sensitiveHeaders is empty', () => {
    const headers = { 'Content-Type': 'application/json' };
    const result = redactHeaders(headers, []);
    expect(result).toEqual(headers);
    expect(result).toBe(headers); // This function doesn't clone if no redaction happens
  });

  it('should return the original headers if headers object is null or undefined', () => {
    expect(redactHeaders(null as any, sensitiveHeaders)).toBe(null);
    expect(redactHeaders(undefined as any, sensitiveHeaders)).toBe(undefined);
  });
});