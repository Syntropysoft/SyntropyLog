/**
 * FILE: tests/redis/RedisConnectionManager.test.ts
 * DESCRIPTION: Unit tests for the RedisConnectionManager class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as redis from 'redis';
import { RedisConnectionManager } from '../../src/redis/RedisConnectionManager';
import { ILogger } from '../../src/logger';
import { RedisInstanceConfig } from '../../src/config';

// Mock the 'redis' library
vi.mock('redis');

let mockNativeClient: any;
let eventListeners: Record<string, (...args: any[]) => void>;

const setupMockClient = () => {
  eventListeners = {};
  mockNativeClient = {
    on: vi.fn((event, listener) => {
      eventListeners[event] = listener;
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue('PONG'),
    info: vi.fn().mockResolvedValue('info string'),
    exists: vi.fn(),
    isOpen: false, // Start as closed
  };
  vi.mocked(redis.createClient).mockReturnValue(mockNativeClient);
  vi.mocked(redis.createCluster).mockReturnValue(mockNativeClient);
};

// Mock logger defined inline
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

describe('RedisConnectionManager', () => {
  let manager: RedisConnectionManager;
  const mockConfig: RedisInstanceConfig = {
    mode: 'single',
    instanceName: 'test-instance',
    url: 'redis://localhost:6379',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMockClient();
    manager = new RedisConnectionManager(mockConfig, mockLogger);
  });

  describe('Client Creation and Configuration', () => {
    // This suite tests the constructor with various configurations.
    // We add a beforeEach here to reset the mocks after the parent beforeEach runs,
    // ensuring that we are only inspecting the client created within each specific test.
    beforeEach(() => {
      vi.clearAllMocks();
      setupMockClient();
    });

    it('should create a single-node client with the correct URL and reconnect strategy', () => {
      const singleNodeConfig: RedisInstanceConfig = {
        mode: 'single',
        instanceName: 'test-instance',
        url: 'redis://test-host:1234',
        retryOptions: { maxRetries: 5, retryDelay: 1000 },
      };
      new RedisConnectionManager(singleNodeConfig, mockLogger);

      const createClientCall = vi.mocked(redis.createClient).mock.calls[0][0];
      expect(createClientCall).toMatchObject({
        url: 'redis://test-host:1234',
      });
      expect(createClientCall?.socket?.reconnectStrategy).toBeInstanceOf(
        Function
      );
    });

    it('should create a sentinel client with the correct options', () => {
      const sentinelConfig: RedisInstanceConfig = {
        mode: 'sentinel',
        instanceName: 'test-instance',
        sentinels: [{ host: 's1', port: 26379 }],
        name: 'mymaster',
        sentinelPassword: 'spass',
      };
      new RedisConnectionManager(sentinelConfig, mockLogger);

      expect(redis.createClient).toHaveBeenCalledWith({
        sentinels: [{ host: 's1', port: 26379 }],
        name: 'mymaster',
        sentinelPassword: 'spass',
        socket: {
          reconnectStrategy: expect.any(Function),
        },
      });
    });

    it('should create a cluster client with the correct root nodes', () => {
      const clusterConfig: RedisInstanceConfig = {
        mode: 'cluster',
        instanceName: 'test-instance',
        rootNodes: [
          { host: 'c1', port: 7001 },
          { host: 'c2', port: 7002 },
        ],
      };
      new RedisConnectionManager(clusterConfig, mockLogger);

      expect(redis.createCluster).toHaveBeenCalledWith({
        rootNodes: [
          { socket: { host: 'c1', port: 7001 } },
          { socket: { host: 'c2', port: 7002 } },
        ],
      });
    });

    it('should throw an error for an unsupported mode', () => {
      const invalidConfig = { mode: 'invalid-mode' } as any;
      expect(() => new RedisConnectionManager(invalidConfig, mockLogger)).toThrow(
        'Unsupported Redis mode: "invalid-mode"'
      );
    });

    it('should use a reconnectStrategy that returns an error if max retries are exceeded', () => {
      const configWithRetries: RedisInstanceConfig = {
        mode: 'single',
        instanceName: 'test-instance',
        url: 'redis://localhost:6379',
        retryOptions: { maxRetries: 5 },
      };
      new RedisConnectionManager(configWithRetries, mockLogger);
      const createClientCall = vi.mocked(redis.createClient).mock.calls[0][0] as any;
      const strategy = createClientCall.socket.reconnectStrategy;

      const error = strategy(6); // One more than maxRetries
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('Exceeded the maximum number of Redis connection retries');
    });
  });

  describe('Connection Lifecycle', () => {
    it('should resolve the connection promise when the client emits "ready"', async () => {
      const connectPromise = manager.connect();
      expect(mockLogger.info).toHaveBeenCalledWith('Attempting to connect...');
      expect(mockNativeClient.connect).toHaveBeenCalledOnce();

      // Simulate the 'ready' event from the native client
      eventListeners.ready();

      await expect(connectPromise).resolves.toBeUndefined();
      expect(manager.isReady()).toBe(true);
    });

    it('should reject the connection promise when the client emits "error"', async () => {
      const testError = new Error('Connection failed');
      const connectPromise = manager.connect();

      // Simulate the 'error' event
      eventListeners.error(testError);

      await expect(connectPromise).rejects.toThrow(testError);
      expect(manager.isReady()).toBe(false);
    });

    it('should log an error and reject if the initial connect() call fails', async () => {
      const connectionError = new Error('Initial connect failed');
      mockNativeClient.connect.mockRejectedValue(connectionError);

      await expect(manager.connect()).rejects.toThrow(connectionError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Immediate connection attempt failed.',
        { error: connectionError }
      );
    });

    it('should be idempotent and return the same promise if connect is called multiple times', () => {
      const promise1 = manager.connect();
      const promise2 = manager.connect();
      expect(promise1).toBe(promise2);
      expect(mockNativeClient.connect).toHaveBeenCalledOnce();
    });

    it('should resolve immediately if connect is called when already ready', async () => {
      // First connection
      const connectPromise = manager.connect();
      eventListeners.ready();
      await connectPromise;

      // Second call
      const secondConnectPromise = manager.connect();
      await expect(secondConnectPromise).resolves.toBeUndefined();
      // connect should not be called again
      expect(mockNativeClient.connect).toHaveBeenCalledOnce();
    });

    it('should call client.quit() and log on disconnect when client is open', async () => {
      mockNativeClient.isOpen = true;
      await manager.disconnect();
      expect(mockLogger.info).toHaveBeenCalledWith('Attempting to quit client.');
      expect(mockNativeClient.quit).toHaveBeenCalledOnce();
      expect(manager.isQuit()).toBe(true);
    });

    it('should not call client.quit() and log on disconnect when client is already closed', async () => {
      mockNativeClient.isOpen = false;
      await manager.disconnect();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Client was not open. Quit operation effectively complete.'
      );
      expect(mockNativeClient.quit).not.toHaveBeenCalled();
      expect(manager.isQuit()).toBe(true);
    });

    it('should log and do nothing if disconnect is called when already in quit state', async () => {
      await manager.disconnect(); // First call
      vi.clearAllMocks(); // Clear mocks to check the second call
      setupMockClient(); // Re-setup mocks for logger

      await manager.disconnect(); // Second call
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Quit already called. No action taken.'
      );
      expect(mockNativeClient.quit).not.toHaveBeenCalled();
    });

    it('should reject the pending connection promise if disconnect is called mid-connection', async () => {
      const connectPromise = manager.connect();
      // Call disconnect while the promise is pending
      await manager.disconnect();
      await expect(connectPromise).rejects.toThrow(
        'Connection aborted due to disconnect call.'
      );
    });

    it('should log and re-throw an error if client.quit() fails', async () => {
      mockNativeClient.isOpen = true;
      const quitError = new Error('Quit failed');
      mockNativeClient.quit.mockRejectedValue(quitError);
      await expect(manager.disconnect()).rejects.toThrow(quitError);
      expect(mockLogger.error).toHaveBeenCalledWith('Error during client.quit().', { error: quitError });
    });

    it('should reject ensureReady if quit has been called', async () => {
      await manager.disconnect();
      await expect(manager.ensureReady()).rejects.toThrow(
        'Client has been quit. Cannot execute commands.'
      );
    });
  });

  describe('Event Listeners and Logging', () => {
    it('should log on "connect" event', () => {
      eventListeners.connect();
      expect(mockLogger.info).toHaveBeenCalledWith('[test-instance] Connecting to Redis...');
    });

    it('should log on "ready" event', () => {
      eventListeners.ready();
      expect(mockLogger.info).toHaveBeenCalledWith('[test-instance] ✅ Redis is operational and ready to accept commands.');
    });

    it('should log on "end" event', () => {
      eventListeners.end();
      expect(mockLogger.warn).toHaveBeenCalledWith('[test-instance] Connection closed.');
    });

    it('should log on "error" event', () => {
      const testError = new Error('Something went wrong');
      eventListeners.error(testError);
      expect(mockLogger.error).toHaveBeenCalledWith('[test-instance] Client error.', { error: testError });
    });

    it('should log on "reconnecting" event', () => {
      eventListeners.reconnecting();
      expect(mockLogger.info).toHaveBeenCalledWith('[test-instance] Reconnecting...');
    });
  });

  describe('Server Commands (ping, info)', () => {
    beforeEach(() => {
      // Simulate a ready connection for these tests
      vi.spyOn(manager, 'ensureReady').mockResolvedValue(undefined);
    });

    it('should call the native ping for single-node clients', async () => {
      // The mock client has a `ping` method, so the type guard will pass.
      await manager.ping('test');
      expect(mockNativeClient.ping).toHaveBeenCalledWith('test');
    });

    it('should call the native info for single-node clients', async () => {
      await manager.info('server');
      expect(mockNativeClient.info).toHaveBeenCalledWith('server');
    });
  });

  describe('exists', () => {
    beforeEach(() => {
      // Simulate a ready connection for most tests
      vi.spyOn(manager, 'ensureReady').mockResolvedValue(undefined);
    });

    it('should call ensureReady before executing the command', async () => {
      mockNativeClient.exists.mockResolvedValue(1);
      await manager.exists('mykey');
      expect(manager.ensureReady).toHaveBeenCalledOnce();
    });

    it("should call the native client's exists method with a single key", async () => {
      mockNativeClient.exists.mockResolvedValue(1);
      const result = await manager.exists('mykey');
      expect(mockNativeClient.exists).toHaveBeenCalledWith('mykey');
      expect(result).toBe(1);
    });

    it("should call the native client's exists method with an array of keys", async () => {
      mockNativeClient.exists.mockResolvedValue(2);
      const result = await manager.exists(['key1', 'key2', 'key3']);
      expect(mockNativeClient.exists).toHaveBeenCalledWith([
        'key1',
        'key2',
        'key3',
      ]);
      expect(result).toBe(2);
    });

    it('should return 0 if no keys exist', async () => {
      mockNativeClient.exists.mockResolvedValue(0);
      const result = await manager.exists('nonexistent');
      expect(result).toBe(0);
    });

    it('should propagate errors from the native client', async () => {
      const testError = new Error('Redis is down');
      mockNativeClient.exists.mockRejectedValue(testError);
      await expect(manager.exists('anykey')).rejects.toThrow(testError);
    });
  });

  describe('isHealthy', () => {
    it('should return false if the client is in a quit state', async () => {
      vi.spyOn(manager, 'isQuit').mockReturnValue(true);
      const healthy = await manager.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should return false if the client is not ready', async () => {
      vi.spyOn(manager, 'isReady').mockReturnValue(false);
      const healthy = await manager.isHealthy();
      expect(healthy).toBe(false);
    });

    it('should return true if the client is ready and ping is successful', async () => {
      vi.spyOn(manager, 'isReady').mockReturnValue(true);
      vi.spyOn(manager, 'ping').mockResolvedValue('PONG');

      const healthy = await manager.isHealthy();
      expect(healthy).toBe(true);
      expect(manager.ping).toHaveBeenCalledOnce();
      expect(mockLogger.debug).toHaveBeenCalledWith('PING response: PONG');
    });

    it('should return false if ping returns an unexpected response', async () => {
      vi.spyOn(manager, 'isReady').mockReturnValue(true);
      vi.spyOn(manager, 'ping').mockResolvedValue('OK'); // Not 'PONG'

      const healthy = await manager.isHealthy();
      expect(healthy).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('PING response: OK');
    });

    it('should return false and log an error if ping fails', async () => {
      vi.spyOn(manager, 'isReady').mockReturnValue(true);
      const testError = new Error('PING command failed');
      vi.spyOn(manager, 'ping').mockRejectedValue(testError);

      const healthy = await manager.isHealthy();
      expect(healthy).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('PING failed during health check.', { error: testError });
    });
  });
});