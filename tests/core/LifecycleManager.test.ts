import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LifecycleManager } from '../../src/core/LifecycleManager';
import { SyntropyLog } from '../../src/SyntropyLog';
import { SyntropyLogConfig } from '../../src/config';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock regex-test to avoid spawning child processes during tests
vi.mock('regex-test', () => {
  return {
    default: class MockRegexTest {
      constructor() {}
      test(regex: RegExp, input: string) {
        return Promise.resolve(regex.test(input));
      }
      cleanWorker() {}
    },
  };
});

// Mock dependencies
vi.mock('../../src/logger/LoggerFactory', () => {
  return {
    LoggerFactory: class {
      getLogger() {
        return {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
          withSource: vi.fn().mockReturnThis(),
        };
      }
      shutdown() {
        return Promise.resolve();
      }
    },
  };
});
// Mocks extracted
vi.mock('../../src/context/ContextManager');

describe('LifecycleManager', () => {
  let lifecycleManager: LifecycleManager;
  let mockSyntropyFacade: SyntropyLog;

  beforeEach(() => {
    mockSyntropyFacade = {} as SyntropyLog;
    lifecycleManager = new LifecycleManager(mockSyntropyFacade);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start in NOT_INITIALIZED state', () => {
      expect(lifecycleManager.getState()).toBe('NOT_INITIALIZED');
    });
  });

  describe('init', () => {
    it('should transition to READY state on successful initialization', async () => {
      const config: SyntropyLogConfig = {
        logger: { level: 'info', serializerTimeoutMs: 50 },
      };

      await lifecycleManager.init(config);

      expect(lifecycleManager.getState()).toBe('READY');
      expect(lifecycleManager.config).toBeDefined();
    });

    it('should not re-initialize if already initialized', async () => {
      const config: SyntropyLogConfig = {
        logger: { level: 'info', serializerTimeoutMs: 50 },
      };

      // First init
      await lifecycleManager.init(config);
      expect(lifecycleManager.getState()).toBe('READY');

      // Second init attempt
      await lifecycleManager.init(config);
      // Should remain READY and not throw
      expect(lifecycleManager.getState()).toBe('READY');
    });

    it('should handle initialization errors', async () => {
      // Force an error by passing invalid config that causes schema validation to fail
      // Since we can't easily mock internal deps here without hoisting, we'll try to pass
      // a config that Zod rejects.
      const invalidConfig = { logger: { level: 'invalid-level' } } as any;

      try {
        await lifecycleManager.init(invalidConfig);
      } catch (e) {
        // expected
      }

      expect(lifecycleManager.getState()).toBe('ERROR');
    });
  });

  describe('shutdown', () => {
    it('should transition to SHUTDOWN state', async () => {
      // Setup
      await lifecycleManager.init({});
      expect(lifecycleManager.getState()).toBe('READY');

      // Act
      await lifecycleManager.shutdown();

      // Assert
      expect(lifecycleManager.getState()).toBe('SHUTDOWN');
    });

    it('should not shutdown if not READY', async () => {
      await lifecycleManager.shutdown();
      expect(lifecycleManager.getState()).toBe('NOT_INITIALIZED');
    });

    it('should transition to ERROR and emit error when shutdown fails', async () => {
      await lifecycleManager.init({});
      expect(lifecycleManager.getState()).toBe('READY');

      const shutdownError = new Error('MaskingEngine shutdown failed');
      lifecycleManager.maskingEngine.shutdown = vi
        .fn()
        .mockImplementation(() => {
          throw shutdownError;
        });

      const errorEmitted = vi.fn();
      lifecycleManager.on('error', errorEmitted);

      await lifecycleManager.shutdown();

      expect(lifecycleManager.getState()).toBe('ERROR');
      expect(errorEmitted).toHaveBeenCalledWith(shutdownError);
    });
  });

  describe('ensureReady', () => {
    it('should throw when not in READY state', () => {
      expect(() => lifecycleManager.ensureReady()).toThrow(
        /SyntropyLog is not ready. Current state: 'NOT_INITIALIZED'/
      );
    });

    it('should not throw when in READY state', async () => {
      await lifecycleManager.init({});
      expect(() => lifecycleManager.ensureReady()).not.toThrow();
    });
  });

  describe('child process management', () => {
    it('should track registered child processes', () => {
      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 123;
      (mockProcess as any).connected = true;
      (mockProcess as any).kill = vi.fn();

      lifecycleManager.registerChildProcess(mockProcess);

      // We can't access private trackedProcesses directly,
      // but we can verify it's cleaned up on shutdown.
    });

    it('should terminate tracked processes on shutdown', async () => {
      // Setup
      await lifecycleManager.init({});

      const mockProcess = new EventEmitter() as ChildProcess;
      (mockProcess as any).pid = 123;
      (mockProcess as any).connected = true;
      (mockProcess as any).kill = vi.fn();
      (mockProcess as any).exitCode = null;

      lifecycleManager.registerChildProcess(mockProcess);

      // Mock the process exit when killed
      (mockProcess.kill as any).mockImplementation((signal: string) => {
        if (signal === 'SIGTERM') {
          setTimeout(() => {
            mockProcess.emit('exit');
            (mockProcess as any).exitCode = 0;
          }, 10);
        }
        return true;
      });

      // Act
      await lifecycleManager.shutdown();

      // Assert
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });
});
