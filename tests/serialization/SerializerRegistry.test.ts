/**
 * FILE: tests/serialization/SerializerRegistry.test.ts
 * DESCRIPTION: Unit tests for the SerializerRegistry class.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SerializerRegistry, SerializerRegistryOptions } from '../../src/serialization/SerializerRegistry';
import { ILogger } from '../../src/logger/ILogger';

// --- Mocks ---

const mockLogger: ILogger = {
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
};

// --- Tests ---

describe('SerializerRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should add a default error serializer if none is provided', () => {
      const registry = new SerializerRegistry();
      // @ts-expect-error - Accessing private member for testing
      expect(registry.serializers['err']).toBeInstanceOf(Function);
    });

    it('should use a custom error serializer if provided', () => {
      const customErrSerializer = (e: Error) => `Custom: ${e.message}`;
      const options: SerializerRegistryOptions = {
        serializers: { err: customErrSerializer },
      };
      const registry = new SerializerRegistry(options);
      // @ts-expect-error - Accessing private member for testing
      expect(registry.serializers['err']).toBe(customErrSerializer);
    });

    it('should set custom serializers and timeout', () => {
      const customSerializer = (val: any) => `Custom value: ${val}`;
      const options: SerializerRegistryOptions = {
        serializers: { customKey: customSerializer },
        timeoutMs: 100,
      };
      const registry = new SerializerRegistry(options);
      // @ts-expect-error - Accessing private member for testing
      expect(registry.serializers['customKey']).toBe(customSerializer);
      // @ts-expect-error - Accessing private member for testing
      expect(registry.timeoutMs).toBe(100);
    });
  });

  describe('process', () => {
    it('should apply the default error serializer correctly', async () => {
      const registry = new SerializerRegistry();
      const err = new Error('test error');
      err.stack = 'stack-trace';
      const meta = { err, otherKey: 'value' };

      const result = await registry.process(meta, mockLogger);
      const parsedError = JSON.parse(result.err);

      expect(parsedError.name).toBe('Error');
      expect(parsedError.message).toBe('test error');
      expect(parsedError.stack).toBe('stack-trace');
      expect(result.otherKey).toBe('value');
    });

    it('should apply a custom serializer', async () => {
      const options: SerializerRegistryOptions = {
        serializers: { user: (u) => `User ID: ${u.id}` },
      };
      const registry = new SerializerRegistry(options);
      const meta = { user: { id: 123, name: 'John' } };

      const result = await registry.process(meta, mockLogger);

      expect(result.user).toBe('User ID: 123');
    });

    it('should not modify the original metadata object', async () => {
      const registry = new SerializerRegistry();
      const originalMeta = { err: new Error('test') };

      await registry.process(originalMeta, mockLogger);

      expect(originalMeta.err).toBeInstanceOf(Error);
    });

    it('should handle async serializers that resolve successfully', async () => {
      const asyncSerializer = async (val: any) => {
        await new Promise((r) => setTimeout(r, 10));
        return `Async: ${val}`;
      };
      const options: SerializerRegistryOptions = {
        serializers: { data: asyncSerializer },
      };
      const registry = new SerializerRegistry(options);
      const meta = { data: 'some-data' };

      const result = await registry.process(meta, mockLogger);
      expect(result.data).toBe('Async: some-data');
    });
  });

  describe('Error and Timeout Handling', () => {
    // Use fake timers for timeout test
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle a serializer timeout', async () => {
      const slowSerializer = () => new Promise((resolve) => setTimeout(() => resolve('done'), 100));
      const options: SerializerRegistryOptions = {
        serializers: { slow: slowSerializer },
        timeoutMs: 50,
      };
      const registry = new SerializerRegistry(options);
      const meta = { slow: 'data' };

      const processPromise = registry.process(meta, mockLogger);
      await vi.advanceTimersByTimeAsync(60); // Advance time to trigger timeout
      const result = await processPromise;

      expect(result.slow).toBe("[SERIALIZER_ERROR: Failed to process key 'slow']");
      expect(mockLogger.warn).toHaveBeenCalledOnce();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Custom serializer for key "slow" failed or timed out.',
        { error: 'Serializer function timed out after 50ms.' }
      );
    });

    it('should handle a synchronous error in a serializer', async () => {
      const failingSerializer = () => {
        throw new Error('Sync Fail');
      };
      const options: SerializerRegistryOptions = {
        serializers: { bad: failingSerializer },
      };
      const registry = new SerializerRegistry(options);
      const meta = { bad: 'data' };

      const result = await registry.process(meta, mockLogger);

      expect(result.bad).toBe("[SERIALIZER_ERROR: Failed to process key 'bad']");
      expect(mockLogger.warn).toHaveBeenCalledWith('Custom serializer for key "bad" failed or timed out.', {
        error: 'Sync Fail',
      });
    });

    it('should handle a rejected promise from an async serializer', async () => {
      const failingAsyncSerializer = async () => {
        throw new Error('Async Fail');
      };
      const options: SerializerRegistryOptions = {
        serializers: { badAsync: failingAsyncSerializer },
      };
      const registry = new SerializerRegistry(options);
      const meta = { badAsync: 'data' };

      const result = await registry.process(meta, mockLogger);

      expect(result.badAsync).toBe("[SERIALIZER_ERROR: Failed to process key 'badAsync']");
      expect(mockLogger.warn).toHaveBeenCalledWith('Custom serializer for key "badAsync" failed or timed out.', {
        error: 'Async Fail',
      });
    });
  });
});