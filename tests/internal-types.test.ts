/**
 * Tests for internal-types (e.g. errorToJsonValue).
 */
import { describe, it, expect } from 'vitest';
import { errorToJsonValue } from '../src/internal-types';

describe('errorToJsonValue', () => {
  it('should serialize Error to object with name, message, stack', () => {
    const err = new Error('test message');
    const result = errorToJsonValue(err);
    expect(result).toEqual(
      expect.objectContaining({
        name: 'Error',
        message: 'test message',
        stack: expect.any(String),
      })
    );
  });

  it('should return Error with stack: null when error.stack is missing', () => {
    const err = new Error('no stack');
    delete (err as any).stack;
    const result = errorToJsonValue(err);
    expect(result).toEqual(
      expect.objectContaining({
        name: 'Error',
        message: 'no stack',
        stack: null,
      })
    );
  });

  it('should return String(value) for non-Error (pure branch coverage)', () => {
    expect(errorToJsonValue('oops')).toBe('oops');
    expect(errorToJsonValue(123)).toBe('123');
    expect(errorToJsonValue(null)).toBe('null');
  });
});
