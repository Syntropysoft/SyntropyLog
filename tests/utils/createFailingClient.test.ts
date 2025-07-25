/**
 * FILE: tests/utils/createFailingClient.test.ts
 * DESCRIPTION: Unit tests for the failing client factory functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ILogger } from '../../src/logger';
import { createFailingRedisClient, createFailingHttpClient } from '../../src/utils/createFailingClient';
import { IBeaconRedis } from '../../src/redis/IBeaconRedis';

// --- Mocks ---

const mockLogger: ILogger = {
  debug: vi.fn() as any,
  info: vi.fn() as any,
  warn: vi.fn() as any,
  error: vi.fn() as any,
  trace: vi.fn() as any,
  fatal: vi.fn() as any,
  child: vi.fn().mockReturnThis(),
  withSource: vi.fn().mockReturnThis(),
  level: 'info',
  setLevel: vi.fn(),
  withRetention: vi.fn().mockReturnThis(),
  withTransactionId: vi.fn().mockReturnThis(),
};

// --- Tests ---

describe('createFailingClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createFailingRedisClient', () => {
    const instanceName = 'my-redis';
    const initializationError = new Error('Connection refused');
    let failingClient: IBeaconRedis;

    beforeEach(() => {
      failingClient = createFailingRedisClient(instanceName, initializationError, mockLogger);
    });

    it('should return the instance name correctly via special handler', () => {
      expect(failingClient.getInstanceName()).toBe(instanceName);
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should throw a synchronous error when calling "multi"', () => {
      const expectedError = `The Redis client "${instanceName}" could not be initialized. Reason: ${initializationError.message}. Check the configuration and startup logs.`;
      expect(() => failingClient.multi()).toThrow(expectedError);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        { errorMessage: expectedError },
        `Attempted to use method 'multi()' on a failing Redis client.`
      );
    });

    it('should reject with an error when calling a standard command like "get"', async () => {
      const expectedError = `The Redis client "${instanceName}" could not be initialized. Reason: ${initializationError.message}. Check the configuration and startup logs.`;

      // The property access returns a function that returns a promise
      const promise = failingClient.get('my-key');

      await expect(promise).rejects.toThrow(expectedError);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { errorMessage: expectedError, arguments: ['my-key'] },
        "Attempted to use property 'get' on a failing client."
      );
    });

    it('should reject with an error when calling a command with multiple arguments like "set"', async () => {
      const expectedError = `The Redis client "${instanceName}" could not be initialized. Reason: ${initializationError.message}. Check the configuration and startup logs.`;

      const promise = failingClient.set('my-key', 'my-value', 3600);

      await expect(promise).rejects.toThrow(expectedError);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { errorMessage: expectedError, arguments: ['my-key', 'my-value', 3600] },
        "Attempted to use property 'set' on a failing client."
      );
    });
  });

  describe('createFailingHttpClient', () => {
    const instanceName = 'my-api';
    const type = 'axios';
    let failingClient: any;

    beforeEach(() => {
      failingClient = createFailingHttpClient(instanceName, type, mockLogger);
    });

    it('should reject with an error when calling a method like "request"', async () => {
      const expectedError = `The HTTP client "${instanceName}" (type: ${type}) could not be initialized. Check the configuration and startup logs.`;
      const requestArgs = { url: '/test', method: 'POST' };

      const promise = failingClient.request(requestArgs);

      await expect(promise).rejects.toThrow(expectedError);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        { errorMessage: expectedError, arguments: [requestArgs] },
        "Attempted to use property 'request' on a failing client."
      );
    });
  });
});