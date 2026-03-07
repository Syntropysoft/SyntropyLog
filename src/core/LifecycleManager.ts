import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { ZodError } from 'zod';
import { SyntropyLogConfig } from '../config';
import { syntropyLogConfigSchema } from '../config.schema';
import { ContextManager, IContextManager } from '../context';
import { ILogger } from '../logger';
import { LoggerFactory } from '../logger/LoggerFactory';
import { RedisManager } from '../redis/RedisManager';
import { sanitizeConfig } from '../utils/sanitizeConfig';
import { SerializationManager } from '../serialization/SerializationManager';
import { MaskingEngine } from '../masking/MaskingEngine';
import { SyntropyLog } from '../SyntropyLog';
import { errorToJsonValue } from '../types';

export type SyntropyLogState =
  | 'NOT_INITIALIZED'
  | 'INITIALIZING'
  | 'READY'
  | 'ERROR'
  | 'SHUTTING_DOWN'
  | 'SHUTDOWN';

export class LifecycleManager extends EventEmitter {
  private state: SyntropyLogState = 'NOT_INITIALIZED';
  public config: SyntropyLogConfig | undefined;
  public contextManager: IContextManager | undefined;
  public loggerFactory: LoggerFactory | undefined;
  public redisManager: RedisManager | undefined;
  public serializationManager: SerializationManager;
  public maskingEngine: MaskingEngine;
  private logger: ILogger | null = null;
  private syntropyFacade: SyntropyLog;

  constructor(syntropyFacade: SyntropyLog) {
    super();
    this.syntropyFacade = syntropyFacade;
    // Initialize properties here to satisfy TypeScript's strict checks
    this.config = {};
    this.serializationManager = new SerializationManager({});
    this.maskingEngine = new MaskingEngine({});
  }

  public getState(): SyntropyLogState {
    return this.state;
  }

  public async init(config: SyntropyLogConfig): Promise<void> {
    if (this.state !== 'NOT_INITIALIZED') {
      this.logger?.warn(
        `LifecycleManager.init() called while in state '${this.state}'. Ignoring subsequent call.`
      );
      return;
    }

    this.state = 'INITIALIZING';

    try {
      const parsedConfig = syntropyLogConfigSchema.parse(config);
      const sanitizedConfig = sanitizeConfig(parsedConfig);
      this.config = sanitizedConfig;

      this.contextManager = new ContextManager(this.config.loggingMatrix);
      if (this.config.context) {
        this.contextManager.configure(this.config.context);
      }

      this.serializationManager = new SerializationManager({
        timeoutMs: this.config.logger?.serializerTimeoutMs,
        sanitizeSensitiveData:
          this.config.masking?.enableDefaultRules !== false,
      });

      this.maskingEngine = new MaskingEngine({
        rules: this.config.masking?.rules,
        maskChar: this.config.masking?.maskChar,
        preserveLength: this.config.masking?.preserveLength,
        enableDefaultRules: this.config.masking?.enableDefaultRules !== false,
      });

      this.loggerFactory = new LoggerFactory(
        this.config,
        this.contextManager,
        this.syntropyFacade
      );
      const logger = this.loggerFactory.getLogger('syntropylog-main');
      this.logger = logger;

      if (this.config.redis) {
        try {
          const { RedisManager } = await import('../redis/RedisManager');
          this.redisManager = new RedisManager(
            this.config.redis,
            logger.withSource('redis-manager'),
            this.contextManager
          );
          this.redisManager.init();
        } catch (error) {
          logger.error(
            'Failed to initialize Redis manager. Make sure redis package is installed.',
            { error: errorToJsonValue(error) }
          );
        }
      }

      logger.info('SyntropyLog framework initialized successfully.');
      this.state = 'READY';
      this.emit('ready');
    } catch (error) {
      this.state = 'ERROR';
      this.emit('error', error);

      if (error instanceof ZodError) {
        console.error(
          '[SyntropyLog] Configuration validation failed:',
          error.issues
        );
      } else {
        console.error('[SyntropyLog] Failed to initialize framework:', error);
      }
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    this.logger?.info(
      `🔄 LifecycleManager.shutdown() called. Current state: ${this.state}`
    );

    if (this.state !== 'READY') {
      this.logger?.warn(
        `❌ Cannot perform shutdown. Current state: ${this.state}`
      );
      return;
    }

    this.state = 'SHUTTING_DOWN';
    this.emit('shutting_down');
    this.logger?.info('🔄 State changed to SHUTTING_DOWN');

    try {
      this.logger?.info('Shutting down SyntropyLog framework...');

      const shutdownPromises = [
        this.redisManager?.shutdown(),
        this.loggerFactory?.shutdown?.(),
      ].filter(Boolean);

      this.logger?.info(
        `📋 Executing ${shutdownPromises.length} shutdown promises...`
      );
      await Promise.allSettled(shutdownPromises);
      this.logger?.info('✅ Shutdown promises completed');

      // Terminate external processes that might keep the process active
      this.logger?.info('🔍 Starting external process termination...');
      await this.terminateExternalProcesses();

      this.logger?.info('All managers have been shut down.');
      this.state = 'SHUTDOWN';
      this.emit('shutdown');
      this.logger?.info('✅ State changed to SHUTDOWN');
    } catch (error) {
      this.state = 'ERROR';
      this.emit('error', error);
      this.logger?.error('❌ Error during shutdown:', {
        error: errorToJsonValue(error),
      });
    }
  }

  /**
   * Terminates external processes that might keep the Node.js process active.
   * This includes regex-test workers and other child processes.
   */
  private async terminateExternalProcesses(): Promise<void> {
    try {
      this.logger?.info('🔍 Starting external process termination...');

      // Get all active handles
      const activeHandles =
        (
          process as NodeJS.Process & { _getActiveHandles?(): unknown[] }
        )._getActiveHandles?.() ?? [];
      this.logger?.debug(`Total active handles: ${activeHandles.length}`);

      // Filter child processes that need to be terminated
      const childProcesses = activeHandles.filter((handle: unknown) => {
        const h = handle as {
          constructor: { name: string };
          connected?: boolean;
          spawnargs?: string[];
        };
        const isChildProcess = h.constructor?.name === 'ChildProcess';
        const isConnected = h.connected;
        const hasRegexTest = h.spawnargs?.some((arg: string) =>
          arg.includes('regex-test')
        );

        this.logger?.debug(
          `Handle: ${h.constructor?.name}, connected: ${isConnected}, hasRegexTest: ${hasRegexTest}`
        );

        return Boolean(isChildProcess && isConnected && hasRegexTest);
      });

      this.logger?.info(
        `Found ${childProcesses.length} regex-test processes to terminate`
      );

      if (childProcesses.length > 0) {
        this.logger?.info(
          `Terminating ${childProcesses.length} external processes...`
        );

        // Terminate each child process directly with SIGKILL for maximum effectiveness
        for (const childProcess of childProcesses as ChildProcess[]) {
          try {
            this.logger?.debug(
              `Terminating process ${childProcess.pid} with SIGKILL...`
            );
            childProcess.kill('SIGKILL');
            this.logger?.debug(
              `Process ${childProcess.pid} terminated with SIGKILL`
            );
          } catch (error) {
            this.logger?.warn(
              `Error terminating process ${childProcess.pid}:`,
              { error: errorToJsonValue(error) }
            );
          }
        }

        // Wait a bit for processes to terminate
        this.logger?.debug('Waiting 200ms for processes to terminate...');
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Check if processes are still active
        const remainingHandles =
          (
            process as NodeJS.Process & { _getActiveHandles?(): unknown[] }
          )._getActiveHandles?.() ?? [];
        const remainingChildProcesses = remainingHandles.filter(
          (handle: unknown) => {
            const h = handle as {
              constructor: { name: string };
              connected?: boolean;
              spawnargs?: string[];
            };
            return (
              h.constructor?.name === 'ChildProcess' &&
              h.connected &&
              h.spawnargs?.some((arg: string) => arg.includes('regex-test'))
            );
          }
        );

        if (remainingChildProcesses.length > 0) {
          this.logger?.warn(
            `${remainingChildProcesses.length} regex-test processes still active after SIGKILL`
          );

          // Try to disconnect the processes
          for (const childProcess of remainingChildProcesses as ChildProcess[]) {
            try {
              childProcess.disconnect();
              this.logger?.debug(`Process ${childProcess.pid} disconnected`);
            } catch (error) {
              this.logger?.warn(
                `Error disconnecting process ${childProcess.pid}:`,
                { error: errorToJsonValue(error) }
              );
            }
          }
        } else {
          this.logger?.info(
            '✅ All regex-test processes terminated successfully'
          );
        }
      } else {
        this.logger?.info('No regex-test processes found to terminate');
      }
    } catch (error) {
      this.logger?.warn('Error terminating external processes:', {
        error: errorToJsonValue(error),
      });
    }
  }

  public ensureReady(): asserts this is this & {
    config: SyntropyLogConfig;
    contextManager: IContextManager;
    loggerFactory: LoggerFactory;
    redisManager: RedisManager;
  } {
    if (this.state !== 'READY') {
      throw new Error(
        `SyntropyLog is not ready. Current state: '${this.state}'. Ensure init() has completed successfully by listening for the 'ready' event.`
      );
    }
  }
}
