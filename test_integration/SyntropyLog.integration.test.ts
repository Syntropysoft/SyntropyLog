
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { syntropyLog } from '../src/SyntropyLog';
import { SpyTransport } from '../src/logger/transports/SpyTransport';
import { SyntropyLogConfig } from '../src/config';

describe('SyntropyLog Integration Tests', () => {
  // This helper function is crucial for testing a singleton.
  const resetSingleton = () => {
    (syntropyLog as any)._resetForTesting();
  };

  beforeEach(() => {
    resetSingleton();
  });

  afterEach(async () => {
    // We only try to shutdown if it was successfully initialized.
    if (syntropyLog.getState() === 'READY') {
      await syntropyLog.shutdown();
    }
  });

  it('should correctly propagate context to the final log message', async () => {
    const spyTransport = new SpyTransport();
    const config: SyntropyLogConfig = {
      // silent: true, // This is removed in favor of a more robust testing strategy.
      logger: {
        level: 'debug',
        transports: [spyTransport],
        serializerTimeoutMs: 1000,
      },
      // No redis/http/broker for this test to keep it focused.
    };

    // The test must now handle the asynchronous, event-based initialization.
    await new Promise<void>((resolve, reject) => {
      syntropyLog.on('ready', () => {
        resolve();
      });

      syntropyLog.on('error', (err) => {
        reject(err);
      });

      // We call init but don't await it here. The event handlers will resolve/reject the promise.
      syntropyLog.init(config);
    });

    const contextManager = syntropyLog.getContextManager();
    const logger = syntropyLog.getLogger('integration-test');
    const correlationId = `test-${Date.now()}`;

    // Clear any logs that might have been generated during initialization.
    spyTransport.clear();

    // Act
    await contextManager.run(async () => {
      contextManager.set('correlationId', correlationId);
      // Use pino-style logging: logger.info(metadata, message)
      await logger.info({ userId: 123 }, 'This is a test message with context.');
    });

    // Assert
    const businessEntries = spyTransport.getEntries().filter(e => e.service === 'integration-test');
    expect(businessEntries.length).toBe(1);
    const logObject = businessEntries[0];

    expect(logObject).toBeDefined();

    // With the check above, TypeScript knows logObject is defined, but we can be more explicit.
    if (logObject) {
      expect(logObject.level).toBe('info');
      // The property should be `message`, not `msg`.
      expect(logObject.message).toBe('This is a test message with context.');
      expect(logObject.correlationId).toBe(correlationId);
      expect(logObject.userId).toBe(123);
    }
  });
}); 