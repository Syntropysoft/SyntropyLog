/**
 * @file src/SyntropyLog.ts
 * @description The main public-facing singleton class for the SyntropyLog framework.
 * This class acts as a Facade, providing a simple and clean API surface
 * while delegating all complex lifecycle and orchestration work to the internal
 * LifecycleManager.
 */
import { EventEmitter } from 'events';
import { SyntropyLogConfig } from './config';
import { IContextManager } from './context';
import { ILogger } from './logger';
import { InstrumentedHttpClient } from './http/InstrumentedHttpClient';
import { InstrumentedBrokerClient } from './brokers/InstrumentedBrokerClient';
import { LifecycleManager, SyntropyLogState } from './core/LifecycleManager';
import { LogLevel } from './logger/levels';
import { LoggingMatrix } from './types';
// Dynamic import for Redis to avoid requiring it when not used
// import { RedisConnectionManager } from './redis/RedisConnectionManager';
import { IBeaconRedis } from './redis/IBeaconRedis';

/**
 * @class SyntropyLog
 * @description The main public entry point for the framework. It follows the
 * Singleton pattern and acts as an EventEmitter to report on its lifecycle,
 * proxying events from its internal LifecycleManager.
 */
export class SyntropyLog extends EventEmitter {
  private static instance: SyntropyLog;
  private readonly lifecycleManager: LifecycleManager;

  private constructor() {
    super();
    this.lifecycleManager = new LifecycleManager(this);

    // Proxy events from the lifecycle manager to the public facade
    this.lifecycleManager.on('ready', () => this.emit('ready'));
    this.lifecycleManager.on('error', (err) => this.emit('error', err));
    this.lifecycleManager.on('shutting_down', () => this.emit('shutting_down'));
    this.lifecycleManager.on('shutdown', () => this.emit('shutdown'));
  }

  public static getInstance(): SyntropyLog {
    if (!SyntropyLog.instance) {
      SyntropyLog.instance = new SyntropyLog();
    }
    return SyntropyLog.instance;
  }

  /**
   * Internal test helper to reset the singleton instance.
   * DO NOT USE in production code.
   */
  public static resetInstance(): void {
    SyntropyLog.instance = undefined as any;
  }

  public getState(): SyntropyLogState {
    return this.lifecycleManager.getState();
  }

  public async init(config: SyntropyLogConfig): Promise<void> {
    return this.lifecycleManager.init(config);
  }

  public async shutdown(): Promise<void> {
    return this.lifecycleManager.shutdown();
  }

  public getLogger(name = 'default', bindings?: Record<string, any>): ILogger {
    if (!this.lifecycleManager.loggerFactory) {
      throw new Error('Logger Factory not available.');
    }
    return this.lifecycleManager.loggerFactory.getLogger(name, bindings);
  }

  public async getRedis(name: string): Promise<IBeaconRedis> {
    this.lifecycleManager.ensureReady();
    if (!this.lifecycleManager.redisManager) {
      throw new Error(
        'Redis manager not available. Make sure Redis is configured and redis package is installed.'
      );
    }
    return this.lifecycleManager.redisManager.getInstance(name);
  }

  public getHttp(name: string): InstrumentedHttpClient {
    this.lifecycleManager.ensureReady();
    return this.lifecycleManager.httpManager.getInstance(name);
  }

  public getBroker(name: string): InstrumentedBrokerClient {
    this.lifecycleManager.ensureReady();
    return this.lifecycleManager.brokerManager.getInstance(name);
  }

  public getContextManager(): IContextManager {
    this.lifecycleManager.ensureReady();
    return this.lifecycleManager.contextManager;
  }

  public getConfig(): SyntropyLogConfig {
    this.lifecycleManager.ensureReady();
    return this.lifecycleManager.config;
  }

  public getFilteredContext(level: LogLevel): Record<string, unknown> {
    this.lifecycleManager.ensureReady();
    return this.lifecycleManager.contextManager.getFilteredContext(level);
  }

  /**
   * Reconfigures the logging matrix dynamically.
   * This method allows changing which context fields are included in logs
   * without affecting security configurations like masking or log levels.
   * @param matrix The new logging matrix configuration
   */
  public reconfigureLoggingMatrix(matrix: LoggingMatrix): void {
    this.lifecycleManager.ensureReady();
    this.lifecycleManager.contextManager.reconfigureLoggingMatrix(matrix);
  }

  public getMasker() {
    if (!this.lifecycleManager.maskingEngine) {
      throw new Error('MaskingEngine not available.');
    }
    return this.lifecycleManager.maskingEngine;
  }

  public getSerializer() {
    if (!this.lifecycleManager.serializationManager) {
      throw new Error('SerializationManager not available.');
    }
    return this.lifecycleManager.serializationManager;
  }

  public _resetForTesting(): void {
    // This needs to re-create the lifecycle manager to properly reset state
    this.lifecycleManager.removeAllListeners();
    (this as any).lifecycleManager = new LifecycleManager(this);
    this.removeAllListeners();

    this.lifecycleManager.on('ready', () => this.emit('ready'));
    this.lifecycleManager.on('error', (err) => this.emit('error', err));
    this.lifecycleManager.on('shutting_down', () => this.emit('shutting_down'));
    this.lifecycleManager.on('shutdown', () => this.emit('shutdown'));
  }
}

/** The singleton instance of the SyntropyLog framework. */
export const syntropyLog = SyntropyLog.getInstance();
