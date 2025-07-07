import { describe, it, expect, beforeEach } from 'vitest';
import { beaconLog } from '../../src/index';
import { LoggerFactory } from '../../src/logger/LoggerFactory';

describe('ContextManager', () => {
  beforeEach(() => {
    // Reset beaconLog and LoggerFactory to ensure a clean state for each test
    (beaconLog as any)._isInitialized = false;
    LoggerFactory.reset();
  });

  it('should set and get values within a context', async () => {
    const contextManager = LoggerFactory.getContextManager();

    await contextManager.run(async () => {
      contextManager.set('requestId', 'req-123');
      contextManager.set('userId', 'user-abc');

      expect(contextManager.get('requestId')).toBe('req-123');
      expect(contextManager.get('userId')).toBe('user-abc');
    });
  });

  it('should return all context values with getAll', async () => {
    const contextManager = LoggerFactory.getContextManager();

    await contextManager.run(async () => {
      contextManager.set('requestId', 'req-456');
      contextManager.set('tenantId', 'tenant-xyz');

      const allContext = contextManager.getAll();
      expect(allContext).toEqual({
        requestId: 'req-456',
        tenantId: 'tenant-xyz',
      });
    });
  });

  it('should keep contexts isolated in parallel async operations', async () => {
    const contextManager = LoggerFactory.getContextManager();
    const results: (string | undefined)[] = [];

    const task1 = contextManager.run(async () => {
      contextManager.set('requestId', 'task-1');
      await new Promise((resolve) => setTimeout(resolve, 10)); // simulate async work
      results.push(contextManager.get('requestId'));
    });

    const task2 = contextManager.run(async () => {
      contextManager.set('requestId', 'task-2');
      await new Promise((resolve) => setTimeout(resolve, 5)); // simulate async work
      results.push(contextManager.get('requestId'));
    });

    await Promise.all([task1, task2]);

    // The order of completion might vary, so we check the contents
    expect(results).toContain('task-1');
    expect(results).toContain('task-2');
    expect(results).toHaveLength(2);
  });

  it('should handle nested contexts correctly', async () => {
    const contextManager = LoggerFactory.getContextManager();

    await contextManager.run(async () => {
      contextManager.set('level', 1);
      contextManager.set('shared', 'A');

      expect(contextManager.get('level')).toBe(1);

      await contextManager.run(async () => {
        contextManager.set('level', 2); // Overwrites 'level' for this inner scope
        expect(contextManager.get('level')).toBe(2);
        expect(contextManager.get('shared')).toBe('A'); // Inherits from parent
      });

      // Back in the outer context, the original value is restored
      expect(contextManager.get('level')).toBe(1);
    });
  });

  it('should be empty outside of a run block', () => {
    const contextManager = LoggerFactory.getContextManager();
    expect(contextManager.getAll()).toEqual({});
  });

  it('should automatically enrich logs with context data', async () => {
    const { spyTransport } = beaconLog.setupTestHarness();
    const contextManager = LoggerFactory.getContextManager();

    await contextManager.run(async () => {
      contextManager.set('correlationId', 'corr-id-for-log');
      contextManager.set('user', 'test-user');

      const logger = beaconLog.getLogger('ContextTest');
      logger.info('This log should have context');
    });

    // Find the specific log entry we are interested in
    const logEntries = spyTransport.findEntries({ msg: 'This log should have context' });
    expect(logEntries).toHaveLength(1);

    const logEntry = logEntries[0];
    expect(logEntry.correlationId).toBe('corr-id-for-log');
    expect(logEntry.context).toEqual({
      correlationId: 'corr-id-for-log',
      user: 'test-user',
    });
  });
});