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
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
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
      expect(mockLogger.debug).toHaveBeenCalledWith(`Attempted to use method 'multi()' on a failing Redis client.`, {
        errorMessage: expectedError,
      });
    });

    it('should reject with an error when calling a standard command like "get"', async () => {
      const expectedError = `The Redis client "${instanceName}" could not be initialized. Reason: ${initializationError.message}. Check the configuration and startup logs.`;

      // The property access returns a function that returns a promise
      const promise = failingClient.get('my-key');

      await expect(promise).rejects.toThrow(expectedError);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Intento de uso de la propiedad 'get' en un cliente fallido.",
        { errorMessage: expectedError, arguments: ['my-key'] }
      );
    });

    it('should reject with an error when calling a command with multiple arguments like "set"', async () => {
      const expectedError = `The Redis client "${instanceName}" could not be initialized. Reason: ${initializationError.message}. Check the configuration and startup logs.`;

      const promise = failingClient.set('my-key', 'my-value', 'EX', 3600);

      await expect(promise).rejects.toThrow(expectedError);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Intento de uso de la propiedad 'set' en un cliente fallido.",
        { errorMessage: expectedError, arguments: ['my-key', 'my-value', 'EX', 3600] }
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

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Intento de uso de la propiedad 'request' en un cliente fallido.",
        { errorMessage: expectedError, arguments: [requestArgs] }
      );
    });
  });
});