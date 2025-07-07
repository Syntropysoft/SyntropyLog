import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { beaconLog } from '../src/index';
import { SpyTransport } from '../src/logger/transports/SpyTransport';
import { RedisManager } from '../src/redis/RedisManager';
import { HttpManager } from '../src/http/HttpManager';
import { LoggerFactory } from '../src/logger/LoggerFactory';

// Mock the managers, as we need to control their constructor and methods
vi.mock('../src/redis/RedisManager');
vi.mock('../src/http/HttpManager');

describe('BeaconLog Core Functionality', () => {
  let spyTransport: SpyTransport;
  const mockRedisManagerShutdown = vi.fn();
  const mockHttpManagerShutdown = vi.fn();
  let flushTransportsSpy: vi.SpyInstance;

  beforeEach(() => {
    // Reset the singleton state for test isolation
    (beaconLog as any)._isInitialized = false;
    LoggerFactory.reset(); // Use the real reset
    
    // Create a new spy transport for each test.
    spyTransport = new SpyTransport();

    // Mock the implementations of the manager's shutdown methods
    vi.mocked(RedisManager).mockImplementation(() => ({
      shutdown: mockRedisManagerShutdown,
    } as any));

    vi.mocked(HttpManager).mockImplementation(() => ({
      shutdown: mockHttpManagerShutdown,
    } as any));

    // Spy on the static method of the real LoggerFactory
    flushTransportsSpy = vi
      .spyOn(LoggerFactory, 'flushTransports')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    flushTransportsSpy.mockRestore(); // Restore the original spy
    vi.useRealTimers();
  });

  describe('shutdown', () => {
    it('should shut down successfully within the timeout', async () => {
      // Arrange: All shutdown operations are fast
      mockRedisManagerShutdown.mockResolvedValue(undefined);
      mockHttpManagerShutdown.mockResolvedValue(undefined);

      // Initialize with the spy transport, which is the "advanced" path.
      beaconLog.init({
        logger: {
          transports: [spyTransport],
          level: 'trace',
        },
      });

      // Act
      await beaconLog.shutdown();

      // Assert
      expect(mockRedisManagerShutdown).toHaveBeenCalledTimes(1);
      expect(mockHttpManagerShutdown).toHaveBeenCalledTimes(1);
      expect(flushTransportsSpy).toHaveBeenCalledTimes(1);

      const successLog = spyTransport.findEntries({
        msg: /BeaconLog shut down successfully\./,
      });
      expect(successLog).toHaveLength(1);

      const timeoutLog = spyTransport.findEntries({ msg: /Shutdown timed out/ });
      expect(timeoutLog).toHaveLength(0);

      expect(beaconLog.isInitialized()).toBe(false);
    });

    it('should log a warning if shutdown exceeds the configured timeout', async () => {
      vi.useFakeTimers();

      // Arrange: Re-init with a short timeout and make one operation slow
      beaconLog.init({
        shutdownTimeout: 50,
        logger: {
          transports: [spyTransport],
          level: 'trace',
        },
      });
      
      mockRedisManagerShutdown.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      ); // Takes 100ms
      mockHttpManagerShutdown.mockResolvedValue(undefined);

      // Act
      const shutdownPromise = beaconLog.shutdown();
      await vi.advanceTimersByTimeAsync(51); // Trigger the timeout
      await shutdownPromise;
      await vi.advanceTimersByTimeAsync(50); // Allow the slow promise to finish

      // Assert
      const successLog = spyTransport.findEntries({ msg: /successfully/ });
      expect(successLog).toHaveLength(0);

      const timeoutLog = spyTransport.findEntries({
        msg: /Shutdown timed out after 50ms/, // This message comes from new Error() and has no period.
      });
      expect(timeoutLog).toHaveLength(1);
      expect(timeoutLog[0].level).toBe('warn');

      expect(beaconLog.isInitialized()).toBe(false);
    });
  });
});  