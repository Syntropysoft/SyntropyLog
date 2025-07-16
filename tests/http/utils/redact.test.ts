/**
 * FILE: tests/http/utils/redact.test.ts
 * DESCRIPTION: Unit tests for the redaction utility functions.
 */

import { describe, it, expect } from 'vitest';
import { redactHeaders, redactObject } from '../../../src/http/utils/redact';

const REDACTED_PLACEHOLDER = '[REDACTED]';

describe('redactObject', () => {
  it('should redact sensitive fields in a flat object', () => {
    const data = { name: 'John', password: '123', token: 'abc' };
    const sensitiveFields = ['password', 'token'];
    const result = redactObject(data, sensitiveFields);
    expect(result).toEqual({
      name: 'John',
      password: REDACTED_PLACEHOLDER,
      token: REDACTED_PLACEHOLDER,
    });
  });

  it('should be case-insensitive when matching sensitive fields', () => {
    const data = { name: 'John', Password: '123', Authorization: 'Bearer xyz' };
    const sensitiveFields = ['password', 'authorization'];
    const result = redactObject(data, sensitiveFields);
    expect(result).toEqual({
      name: 'John',
      Password: REDACTED_PLACEHOLDER,
      Authorization: REDACTED_PLACEHOLDER,
    });
  });

  it('should redact sensitive fields in a nested object', () => {
    const data = {
      user: { name: 'Jane', credentials: { password: '456', apiKey: 'def' } },
      session: { id: 1 },
    };
    const sensitiveFields = ['password', 'apiKey'];
    const result = redactObject(data, sensitiveFields);
    expect(result).toEqual({
      user: {
        name: 'Jane',
        credentials: {
          password: REDACTED_PLACEHOLDER,
          apiKey: REDACTED_PLACEHOLDER,
        },
      },
      session: { id: 1 },
    });
  });

  it('should redact sensitive fields in an array of objects', () => {
    const data = [
      { id: 1, secret: 'one' },
      { id: 2, secret: 'two', other: 'value' },
    ];
    const sensitiveFields = ['secret'];
    const result = redactObject(data, sensitiveFields);
    expect(result).toEqual([
      { id: 1, secret: REDACTED_PLACEHOLDER },
      { id: 2, secret: REDACTED_PLACEHOLDER, other: 'value' },
    ]);
  });

  it('should not modify the original object', () => {
    const originalData = { name: 'John', password: '123' };
    const sensitiveFields = ['password'];
    redactObject(originalData, sensitiveFields);
    expect(originalData).toEqual({ name: 'John', password: '123' });
  });

  it('should return a deep clone if no sensitive fields are provided', () => {
    const data = { user: { name: 'test' } };
    const result = redactObject(data, []);
    expect(result).toEqual(data);
    expect(result).not.toBe(data);
    expect(result.user).not.toBe(data.user);
  });

  it('should handle various data types correctly', () => {
    const data = {
      str: 'string',
      num: 123,
      bool: true,
      nil: null,
      undef: undefined,
      arr: [1, 'two'],
    };
    const result = redactObject(data, ['num']);
    expect(result).toEqual({
      str: 'string',
      num: REDACTED_PLACEHOLDER,
      bool: true,
      nil: null,
      undef: undefined,
      arr: [1, 'two'],
    });
  });

  it('should handle empty objects and arrays', () => {
    expect(redactObject({}, ['any'])).toEqual({});
    expect(redactObject([], ['any'])).toEqual([]);
  });

  it('should return primitive values as-is', () => {
    expect(redactObject('a string', ['any'])).toBe('a string');
    expect(redactObject(123, ['any'])).toBe(123);
    expect(redactObject(null, ['any'])).toBe(null);
    expect(redactObject(undefined, ['any'])).toBe(undefined);
  });

  it('should stop redacting at max depth', () => {
    const deepObject = { a: { b: { c: { d: 'e' } } } };
    const result = redactObject(deepObject, [], 3);
    expect(result).toEqual({
      a: {
        b: {
          c: '[REDACTED_DUE_TO_DEPTH]',
        },
      },
    });
  });

  it('should not traverse Buffer objects', () => {
    const data = {
      file: Buffer.from('hello world'),
      secret: '123',
    };
    const result = redactObject(data, ['secret']);
    expect(result.secret).toBe(REDACTED_PLACEHOLDER);
    expect(Buffer.isBuffer(result.file)).toBe(true);
    expect(result.file.toString()).toBe('hello world');
  });
});

describe('redactHeaders', () => {
  it('should redact sensitive headers', () => {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer 12345',
      'X-Api-Key': 'secret-key',
    };
    const sensitiveHeaders = ['Authorization', 'X-Api-Key'];
    const result = redactHeaders(headers, sensitiveHeaders);
    expect(result).toEqual({
      'Content-Type': 'application/json',
      Authorization: REDACTED_PLACEHOLDER,
      'X-Api-Key': REDACTED_PLACEHOLDER,
    });
  });

  it('should be case-insensitive when matching header names', () => {
    const headers = {
      'content-type': 'application/json',
      authorization: 'Bearer 12345',
    };
    const sensitiveHeaders = ['AUTHORIZATION', 'Content-Type'];
    const result = redactHeaders(headers, sensitiveHeaders);
    expect(result).toEqual({
      'content-type': REDACTED_PLACEHOLDER,
      authorization: REDACTED_PLACEHOLDER,
    });
  });

  it('should not modify the original headers object', () => {
    const originalHeaders = { Authorization: 'Bearer 123' };
    redactHeaders(originalHeaders, ['Authorization']);
    expect(originalHeaders).toEqual({ Authorization: 'Bearer 123' });
  });

  it('should return the original object if sensitiveHeaders is empty or not provided', () => {
    const headers = { 'X-Test': 'value' };
    expect(redactHeaders(headers, [])).toBe(headers);
    expect(redactHeaders(headers)).toBe(headers);
  });

  it('should return the original object if headers object is null or undefined', () => {
    expect(redactHeaders(null, ['any'])).toBe(null);
    expect(redactHeaders(undefined, ['any'])).toBe(undefined);
  });

  it('should handle an empty headers object', () => {
    expect(redactHeaders({}, ['Authorization'])).toEqual({});
  });
});