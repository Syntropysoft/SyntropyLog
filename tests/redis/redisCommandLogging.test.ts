/**
 * FILE: tests/redis/redisCommandLogging.test.ts
 * DESCRIPTION: Unit tests for pure Redis command logging helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  getSuccessLogLevel,
  getErrorLogLevel,
  buildSuccessLogPayload,
  buildErrorLogPayload,
  type RedisLoggingConfig,
} from '../../src/redis/redisCommandLogging';

describe('redisCommandLogging', () => {
  describe('getSuccessLogLevel', () => {
    it('returns "debug" when logging is undefined', () => {
      expect(getSuccessLogLevel(undefined)).toBe('debug');
    });

    it('returns "debug" when logging.onSuccess is undefined', () => {
      expect(getSuccessLogLevel({})).toBe('debug');
    });

    it('returns configured onSuccess when set', () => {
      expect(getSuccessLogLevel({ onSuccess: 'trace' })).toBe('trace');
      expect(getSuccessLogLevel({ onSuccess: 'debug' })).toBe('debug');
      expect(getSuccessLogLevel({ onSuccess: 'info' })).toBe('info');
    });
  });

  describe('getErrorLogLevel', () => {
    it('returns "error" when logging is undefined', () => {
      expect(getErrorLogLevel(undefined)).toBe('error');
    });

    it('returns "error" when logging.onError is undefined', () => {
      expect(getErrorLogLevel({})).toBe('error');
    });

    it('returns configured onError when set', () => {
      expect(getErrorLogLevel({ onError: 'warn' })).toBe('warn');
      expect(getErrorLogLevel({ onError: 'error' })).toBe('error');
      expect(getErrorLogLevel({ onError: 'fatal' })).toBe('fatal');
    });
  });

  describe('buildSuccessLogPayload', () => {
    it('always includes command, instance, durationMs', () => {
      const payload = buildSuccessLogPayload(
        'GET',
        'my-instance',
        5,
        [],
        null,
        undefined
      );
      expect(payload).toEqual({
        command: 'GET',
        instance: 'my-instance',
        durationMs: 5,
      });
    });

    it('does not add params when logCommandValues is false', () => {
      const logging: RedisLoggingConfig = { logCommandValues: false };
      const payload = buildSuccessLogPayload(
        'GET',
        'i',
        1,
        ['key1'],
        'value',
        logging
      );
      expect(payload.params).toBeUndefined();
    });

    it('does not add params when logCommandValues is undefined', () => {
      const payload = buildSuccessLogPayload(
        'GET',
        'i',
        1,
        ['key1'],
        'value',
        undefined
      );
      expect(payload.params).toBeUndefined();
    });

    it('adds params when logCommandValues is true', () => {
      const logging: RedisLoggingConfig = { logCommandValues: true };
      const payload = buildSuccessLogPayload(
        'SET',
        'i',
        2,
        ['k', 'v', 60],
        'OK',
        logging
      );
      expect(payload.params).toEqual(['k', 'v', 60]);
    });

    it('does not add result when logReturnValue is false', () => {
      const logging: RedisLoggingConfig = { logReturnValue: false };
      const payload = buildSuccessLogPayload(
        'GET',
        'i',
        1,
        [],
        'secret',
        logging
      );
      expect(payload.result).toBeUndefined();
    });

    it('adds result when logReturnValue is true', () => {
      const logging: RedisLoggingConfig = { logReturnValue: true };
      const payload = buildSuccessLogPayload(
        'GET',
        'i',
        1,
        ['key'],
        'myvalue',
        logging
      );
      expect(payload.result).toBe('myvalue');
    });

    it('includes both params and result when both options are true', () => {
      const logging: RedisLoggingConfig = {
        logCommandValues: true,
        logReturnValue: true,
      };
      const payload = buildSuccessLogPayload(
        'HGET',
        'inst',
        3,
        ['hash', 'field'],
        'val',
        logging
      );
      expect(payload.params).toEqual(['hash', 'field']);
      expect(payload.result).toBe('val');
    });
  });

  describe('buildErrorLogPayload', () => {
    it('always includes command, instance, durationMs, err', () => {
      const payload = buildErrorLogPayload(
        'GET',
        'my-instance',
        10,
        new Error('Connection refused'),
        [],
        undefined
      );
      expect(payload.command).toBe('GET');
      expect(payload.instance).toBe('my-instance');
      expect(payload.durationMs).toBe(10);
      expect(payload.err).toEqual(
        expect.objectContaining({
          name: 'Error',
          message: 'Connection refused',
        })
      );
    });

    it('does not add params when logCommandValues is false', () => {
      const logging: RedisLoggingConfig = { logCommandValues: false };
      const payload = buildErrorLogPayload(
        'GET',
        'i',
        1,
        new Error('fail'),
        ['key'],
        logging
      );
      expect(payload.params).toBeUndefined();
    });

    it('adds params when logCommandValues is true', () => {
      const logging: RedisLoggingConfig = { logCommandValues: true };
      const payload = buildErrorLogPayload(
        'DEL',
        'i',
        2,
        new Error('fail'),
        ['k1', 'k2'],
        logging
      );
      expect(payload.params).toEqual(['k1', 'k2']);
    });

    it('serializes non-Error throwables as string in err', () => {
      const payload = buildErrorLogPayload(
        'GET',
        'i',
        1,
        'something broke',
        [],
        undefined
      );
      expect(payload.err).toBe('something broke');
    });
  });
});
