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

// Pure helper function for process termination
const terminateProcess = async (
  childProcess: ChildProcess,
  logger: ILogger | null
): Promise<void> => {
  if (!childProcess.connected && childProcess.exitCode !== null) {
    return;
  }

  const pid = childProcess.pid;
  logger?.debug(`Sending SIGTERM to process ${pid}...`);

  childProcess.kill('SIGTERM');

  // Wait up to 5 seconds for graceful exit
  const gracefulExit = new Promise<void>((resolve) => {
    const onExit = () => {
      resolve();
      childProcess.removeListener('exit', onExit);
    };
    childProcess.on('exit', onExit);
  });

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));

  await Promise.race([gracefulExit, timeout]);

  if (childProcess.exitCode === null) {
    logger?.warn(
      `Process ${pid} did not exit after SIGTERM, sending SIGKILL...`
    );
    childProcess.kill('SIGKILL');
  } else {
    logger?.debug(`Process ${pid} exited gracefully`);
  }
};

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
  private trackedProcesses = new Set<ChildProcess>();

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

      // Shutdown MaskingEngine first so regex-test worker is cleaned (avoids process leak)
      this.maskingEngine?.shutdown?.();

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
   * Registers a child process to be managed by the LifecycleManager.
   * Managed processes will be gracefully terminated during shutdown.
   * @param childProcess The child process to track
   */
  public registerChildProcess(childProcess: ChildProcess): void {
    this.trackedProcesses.add(childProcess);

    // Auto-remove if it exits on its own
    childProcess.on('exit', () => {
      this.trackedProcesses.delete(childProcess);
    });
  }

  /**
   * Terminates external processes that might keep the Node.js process active.
   * Uses a graceful shutdown strategy (SIGTERM -> wait -> SIGKILL).
   */
  private async terminateExternalProcesses(): Promise<void> {
    try {
      if (this.trackedProcesses.size === 0) {
        this.logger?.info('No tracked external processes to terminate');
        return;
      }

      this.logger?.info(
        `Terminating ${this.trackedProcesses.size} external processes...`
      );

      const terminationPromises = Array.from(this.trackedProcesses).map(
        (childProcess) => terminateProcess(childProcess, this.logger)
      );

      await Promise.allSettled(terminationPromises);
      this.trackedProcesses.clear();
      this.logger?.info('✅ All external processes terminated');
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
