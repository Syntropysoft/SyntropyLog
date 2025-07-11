/**
 * FILE: tests/redis/RedisConnectionManager.test.ts
 * DESCRIPTION: Unit tests for the RedisConnectionManager class.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedisConnectionManager } from '../../src/redis/RedisConnectionManager';
import { ILogger } from '../../src/logger/ILogger';
import { RedisInstanceConfig } from '../../src/config';
import { createClient } from 'redis';

// Mock the entire 'redis' module
vi.mock('redis', () => ({
  createClient: vi.fn(),
}));

const createMockLogger = (): ILogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
});

describe('RedisConnectionManager', () => {
  let mockNativeClient: any;
  let mockLogger: ILogger;
  let eventListeners: Map<string, (...args: any[]) => void>;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    eventListeners = new Map();
    mockNativeClient = {
      on: vi.fn((event, listener) => {
        eventListeners.set(event, listener);
      }),
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      ping: vi.fn().mockResolvedValue('PONG'),
      info: vi.fn().mockResolvedValue('info_string'),
      isOpen: false,
    };

    // Ensure createClient returns our mock client
    (createClient as vi.Mock).mockReturnValue(mockNativeClient);
    mockLogger = createMockLogger();
  });

  describe('Constructor and Client Creation', () => {
    it('should create a single-node client with correct options', () => {
      const config: RedisInstanceConfig = {
        instanceName: 'single-test',
        mode: 'single',
        url: 'redis://localhost:6379',
      };

      new RedisConnectionManager(config, mockLogger);

      expect(createClient).toHaveBeenCalledOnce();
      const clientOptions = (createClient as vi.Mock).mock.calls[0][0];
      expect(clientOptions.url).toBe('redis://localhost:6379');
      expect(clientOptions.socket.reconnectStrategy).toBeInstanceOf(Function);
    });

    it('should create a sentinel client with correct options', () => {
      const config: RedisInstanceConfig = {
        instanceName: 'sentinel-test',
        mode: 'sentinel',
        sentinels: [{ host: 'localhost', port: 26379 }],
        name: 'mymaster',
        sentinelPassword: 'pw',
      };

      new RedisConnectionManager(config, mockLogger);

      expect(createClient).toHaveBeenCalledOnce();
      const clientOptions = (createClient as vi.Mock).mock.calls[0][0];
      expect(clientOptions.sentinels).toEqual([
        { host: 'localhost', port: 26379 },
      ]);
      expect(clientOptions.name).toBe('mymaster');
      expect(clientOptions.sentinelPassword).toBe('pw');
      expect(clientOptions.socket.reconnectStrategy).toBeInstanceOf(Function);
    });

    it('should create a cluster client with correct options', () => {
      const config: RedisInstanceConfig = {
        instanceName: 'cluster-test',
        mode: 'cluster',
        rootNodes: [{ host: 'localhost', port: 7000 }],
      };

      new RedisConnectionManager(config, mockLogger);

      expect(createClient).toHaveBeenCalledOnce();
      const clientOptions = (createClient as vi.Mock).mock.calls[0][0];
      expect(clientOptions.rootNodes).toEqual([
        { socket: { host: 'localhost', port: 7000 } },
      ]);
      // Cluster mode does not use our custom reconnectStrategy
      expect(clientOptions.socket).toBeUndefined();
    });

    it('should throw an error for an unsupported mode', () => {
      const config = {
        instanceName: 'invalid-test',
        mode: 'invalid-mode',
      } as any;

      expect(() => new RedisConnectionManager(config, mockLogger)).toThrow(
        'Unsupported Redis mode: "invalid-mode"'
      );
    });

    it('should setup all necessary event listeners on the native client', () => {
      const config: RedisInstanceConfig = {
        instanceName: 'listener-test',
        mode: 'single',
        url: 'redis://localhost:6379',
      };

      new RedisConnectionManager(config, mockLogger);

      expect(mockNativeClient.on).toHaveBeenCalledWith(
        'connect',
        expect.any(Function)
      );
      expect(mockNativeClient.on).toHaveBeenCalledWith(
        'ready',
        expect.any(Function)
      );
      expect(mockNativeClient.on).toHaveBeenCalledWith(
        'end',
        expect.any(Function)
      );
      expect(mockNativeClient.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
      expect(mockNativeClient.on).toHaveBeenCalledWith(
        'reconnecting',
        expect.any(Function)
      );
      expect(eventListeners.size).toBe(5);
    });
  });

  describe('Connection and Disconnection', () => {
    let manager: RedisConnectionManager;
    const config: RedisInstanceConfig = {
      instanceName: 'connection-test',
      mode: 'single',
      url: 'redis://localhost:6379',
    };

    beforeEach(() => {
      manager = new RedisConnectionManager(config, mockLogger);
    });

    it('should connect successfully and become ready', async () => {
      const connectPromise = manager.connect();
      expect(mockLogger.info).toHaveBeenCalledWith('Attempting to connect...');
      expect(mockNativeClient.connect).toHaveBeenCalledOnce();

      // Simulate the 'ready' event from the native client
      eventListeners.get('ready')!();

      await expect(connectPromise).resolves.toBeUndefined();
      expect(manager.isReady()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Client is ready.');
    });

    it('should reject connection if native client fails to connect', async () => {
      const connectionError = new Error('Connection refused');
      mockNativeClient.connect.mockRejectedValue(connectionError);

      await expect(manager.connect()).rejects.toThrow(connectionError);

      expect(manager.isReady()).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Immediate connection attempt failed.',
        { error: connectionError }
      );
    });

    it('should reject connection on a client error event', async () => {
      const clientError = new Error('Some redis error');
      const connectPromise = manager.connect();

      // Simulate an 'error' event
      eventListeners.get('error')!(clientError);

      await expect(connectPromise).rejects.toThrow(clientError);
      expect(manager.isReady()).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Client Error.', {
        error: clientError,
      });
    });

    it('should be idempotent and return the same promise while connecting', () => {
      const p1 = manager.connect();
      const p2 = manager.connect();
      expect(p1).toBe(p2);
      expect(mockNativeClient.connect).toHaveBeenCalledOnce();
    });

    it('should resolve immediately if already connected', async () => {
      // First connection
      const connectPromise = manager.connect();
      eventListeners.get('ready')!();
      await connectPromise;

      // Second call after ready
      await expect(manager.connect()).resolves.toBeUndefined();
      // connect should not be called again
      expect(mockNativeClient.connect).toHaveBeenCalledOnce();
    });

    it('ensureReady should initiate connection if not connected', async () => {
      const readyPromise = manager.ensureReady();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'ensureReady: Client not open, initiating connect.'
      );
      eventListeners.get('ready')!();
      await expect(readyPromise).resolves.toBeUndefined();
    });

    it('should disconnect gracefully when client is open', async () => {
      // Make it seem like the client is connected
      mockNativeClient.isOpen = true;
      const connectPromise = manager.connect();
      eventListeners.get('ready')!();
      await connectPromise;

      await manager.disconnect();

      expect(manager.isQuit()).toBe(true);
      expect(manager.isReady()).toBe(false);
      expect(mockNativeClient.quit).toHaveBeenCalledOnce();
      expect(mockLogger.info).toHaveBeenCalledWith('Attempting to quit client.');
    });

    it('should handle disconnect when client is not open', async () => {
      mockNativeClient.isOpen = false;
      await manager.disconnect();

      expect(manager.isQuit()).toBe(true);
      expect(mockNativeClient.quit).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Client was not open. Quit operation effectively complete.'
      );
    });

    it('should reject pending connection promise on disconnect', async () => {
      const connectPromise = manager.connect();
      const disconnectPromise = manager.disconnect();

      await expect(connectPromise).rejects.toThrow(
        'Connection aborted due to disconnect call.'
      );
      await expect(disconnectPromise).resolves.toBeUndefined();
    });

    it('should prevent new connections after being quit', async () => {
      await manager.disconnect();
      await expect(manager.connect()).rejects.toThrow(
        'Client has been quit and cannot be reconnected.'
      );
      await expect(manager.ensureReady()).rejects.toThrow(
        'Client has been quit. Cannot execute commands.'
      );
    });

    it('should update state on "end" event', async () => {
      // Connect first
      const connectPromise = manager.connect();
      eventListeners.get('ready')!();
      await connectPromise;
      expect(manager.isReady()).toBe(true);

      // Simulate connection end
      eventListeners.get('end')!();
      expect(manager.isReady()).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Connection closed.');
    });

    it('should log on "connect" and "reconnecting" events', () => {
      // Simulate events
      eventListeners.get('connect')!();
      expect(mockLogger.info).toHaveBeenCalledWith('Connection established.');

      eventListeners.get('reconnecting')!();
      expect(mockLogger.info).toHaveBeenCalledWith('Client is reconnecting...');
    });
  });

  describe('Utility Methods', () => {
    let manager: RedisConnectionManager;
    const config: RedisInstanceConfig = {
      instanceName: 'utility-test',
      mode: 'single',
      url: 'redis://localhost:6379',
    };

    beforeEach(() => {
      manager = new RedisConnectionManager(config, mockLogger);
    });

    it('getNativeClient should return the underlying client instance', () => {
      expect(manager.getNativeClient()).toBe(mockNativeClient);
    });

    describe('isHealthy', () => {
      it('should return false if the client is not ready', async () => {
        mockNativeClient.isOpen = false;
        expect(await manager.isHealthy()).toBe(false);
      });

      it('should return true if the client is ready and ping succeeds', async () => {
        const p = manager.connect();
        eventListeners.get('ready')!();
        await p;

        mockNativeClient.ping.mockResolvedValue('PONG');
        expect(await manager.isHealthy()).toBe(true);
        expect(mockNativeClient.ping).toHaveBeenCalledOnce();
      });

      it('should return false if the client is ready but ping fails', async () => {
        const p = manager.connect();
        eventListeners.get('ready')!();
        await p;

        const pingError = new Error('Ping failed');
        mockNativeClient.ping.mockRejectedValue(pingError);
        expect(await manager.isHealthy()).toBe(false);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'PING failed during health check.',
          { error: pingError }
        );
      });
    });

    describe('ping', () => {
      it('should call ensureReady and then the native ping', async () => {
        const p = manager.connect();
        eventListeners.get('ready')!();
        await p;

        await manager.ping('test-message');
        expect(mockNativeClient.ping).toHaveBeenCalledWith('test-message');
      });

      it('should work for cluster clients by returning the message or PONG', async () => {
        const clusterConfig: RedisInstanceConfig = {
          instanceName: 'cluster-ping',
          mode: 'cluster',
          rootNodes: [{ host: 'c1', port: 7000 }],
        };
        // Simulate a client that is not a "single" client for the type guard
        const mockClusterClient = { ...mockNativeClient, ping: undefined };
        (createClient as vi.Mock).mockReturnValue(mockClusterClient);
        const clusterManager = new RedisConnectionManager(clusterConfig, mockLogger);

        const readyPromise = clusterManager.ensureReady();
        // We must simulate the 'ready' event for the connection promise to resolve.
        eventListeners.get('ready')!();
        await readyPromise;

        expect(await clusterManager.ping('hello')).toBe('hello');
        expect(await clusterManager.ping()).toBe('PONG');
      });
    });

    describe('info', () => {
      it('should call ensureReady and then the native info', async () => {
        // Simulate the connection becoming ready
        const readyPromise = manager.ensureReady();
        eventListeners.get('ready')!();
        await readyPromise;

        await manager.info('server');
        expect(mockNativeClient.info).toHaveBeenCalledWith('server');
      });

      it('should return a specific message for cluster clients', async () => {
        const clusterConfig: RedisInstanceConfig = {
          instanceName: 'cluster-info',
          mode: 'cluster',
          rootNodes: [{ host: 'c1', port: 7000 }],
        };
        // Create a mock that looks like a cluster client for the type guard (no top-level ping)
        const mockClusterClient = { ...mockNativeClient, ping: undefined };
        (createClient as vi.Mock).mockReturnValue(mockClusterClient);

        const clusterManager = new RedisConnectionManager(clusterConfig, mockLogger);

        // Simulate the connection becoming ready
        const readyPromise = clusterManager.ensureReady();
        eventListeners.get('ready')!();
        await readyPromise;

        expect(await clusterManager.info()).toBe('# INFO command is not supported in cluster mode.');
      });
    });
  });
});