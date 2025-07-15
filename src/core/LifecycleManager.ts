/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';
import { ZodError } from 'zod';
import { SyntropyLogConfig } from '../config';
import { syntropyLogConfigSchema } from '../config.schema';
import { ContextManager, IContextManager } from '../context';
import { ILogger } from '../logger';
import { LoggerFactory } from '../logger/LoggerFactory';
import { RedisManager } from '../redis/RedisManager';
import { sanitizeConfig } from '../utils/sanitizeConfig';
import { HttpManager } from '../http/HttpManager';
import { BrokerManager } from '../brokers/BrokerManager';
import { SerializerRegistry } from '../serialization/SerializerRegistry';
import { MaskingEngine } from '../masking/MaskingEngine';
import { SyntropyLog } from '../SyntropyLog';

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
  public httpManager: HttpManager | undefined;
  public brokerManager: BrokerManager | undefined;
  public serializerRegistry: SerializerRegistry;
  public maskingEngine: MaskingEngine;
  private logger: ILogger | null = null;
  private syntropyFacade: SyntropyLog;

  constructor(syntropyFacade: SyntropyLog) {
    super();
    this.syntropyFacade = syntropyFacade;
    // Initialize properties here to satisfy TypeScript's strict checks
    this.config = {};
    this.serializerRegistry = new SerializerRegistry({});
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

      this.serializerRegistry = new SerializerRegistry({
        serializers: this.config.logger?.serializers,
        timeoutMs: this.config.logger?.serializerTimeoutMs,
      });
      this.maskingEngine = new MaskingEngine(this.config.masking);

      this.loggerFactory = new LoggerFactory(
        this.config,
        this.contextManager,
        this.syntropyFacade
      );
      const logger = this.loggerFactory.getLogger('syntropylog-main');
      this.logger = logger;

      if (this.config.redis) {
        this.redisManager = new RedisManager(
          this.config.redis,
          logger.withSource('redis-manager'),
          this.contextManager
        );
      }
      if (this.config.http) {
        this.httpManager = new HttpManager(
          this.config.http,
          logger.withSource('http-manager'),
          this.contextManager
        );
        this.httpManager.init();
      }
      if (this.config.brokers) {
        this.brokerManager = new BrokerManager(
          this.config.brokers,
          logger.withSource('broker-manager'),
          this.contextManager
        );
        await this.brokerManager.init();
      }

      await logger.info('SyntropyLog framework initialized successfully.');
      this.state = 'READY';
      this.emit('ready');
    } catch (error) {
      this.state = 'ERROR';
      this.emit('error', error);

      if (error instanceof ZodError) {
        console.error(
          '[SyntropyLog] Configuration validation failed:',
          error.errors
        );
      } else {
        console.error('[SyntropyLog] Failed to initialize framework:', error);
      }
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (this.state !== 'READY') {
      return;
    }
    this.state = 'SHUTTING_DOWN';
    this.emit('shutting_down');

    try {
      this.logger?.info('Shutting down SyntropyLog framework...');

      const shutdownPromises = [
        this.redisManager?.shutdown(),
        this.brokerManager?.shutdown(),
        this.httpManager?.shutdown(),
      ].filter(Boolean);

      await Promise.allSettled(shutdownPromises);

      this.logger?.info('All managers have been shut down.');
      this.state = 'SHUTDOWN';
      this.emit('shutdown');
    } catch (error) {
      this.state = 'ERROR';
      this.emit('error', error);
    }
  }

  public ensureReady(): asserts this is this & {
    config: SyntropyLogConfig;
    contextManager: IContextManager;
    loggerFactory: LoggerFactory;
    redisManager: RedisManager;
    httpManager: HttpManager;
    brokerManager: BrokerManager;
  } {
    if (this.state !== 'READY') {
      throw new Error(
        `SyntropyLog is not ready. Current state: '${this.state}'. Ensure init() has completed successfully by listening for the 'ready' event.`
      );
    }
  }
}
