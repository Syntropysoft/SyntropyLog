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
import { LifecycleManager, SyntropyLogState } from './core/LifecycleManager';
import { LogLevel } from './logger/levels';
import { LoggingMatrix, JsonValue } from './types';
import { IBeaconRedis } from './redis/IBeaconRedis';

/** Pure: throws if value is null/undefined; returns value otherwise. Use for guard clauses. */
function requireDefined<T>(
  value: T | null | undefined,
  message: string
): asserts value is T {
  if (value == null) {
    throw new Error(message);
  }
}

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
    this.lifecycleManager.on('transports_drained', () =>
      this.emit('transports_drained')
    );
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
    // Intentional reset for tests; instance is private
    (SyntropyLog as unknown as { instance?: SyntropyLog }).instance = undefined;
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

  public getLogger(
    name = 'default',
    bindings?: Record<string, JsonValue>
  ): ILogger {
    requireDefined(
      this.lifecycleManager.loggerFactory,
      'Logger Factory not available.'
    );
    return this.lifecycleManager.loggerFactory!.getLogger(name, bindings);
  }

  public async getRedis(name: string): Promise<IBeaconRedis> {
    this.lifecycleManager.ensureReady();
    requireDefined(
      this.lifecycleManager.redisManager,
      'Redis manager not available. Make sure Redis is configured and redis package is installed.'
    );
    return this.lifecycleManager.redisManager.getInstance(name);
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
    requireDefined(
      this.lifecycleManager.maskingEngine,
      'MaskingEngine not available.'
    );
    return this.lifecycleManager.maskingEngine;
  }

  public getSerializer() {
    requireDefined(
      this.lifecycleManager.serializationManager,
      'SerializationManager not available.'
    );
    return this.lifecycleManager.serializationManager;
  }

  public _resetForTesting(): void {
    // This needs to re-create the lifecycle manager to properly reset state
    this.lifecycleManager.removeAllListeners();
    Object.assign(this, { lifecycleManager: new LifecycleManager(this) });
    this.removeAllListeners();

    this.lifecycleManager.on('ready', () => this.emit('ready'));
    this.lifecycleManager.on('error', (err) => this.emit('error', err));
    this.lifecycleManager.on('shutting_down', () => this.emit('shutting_down'));
    this.lifecycleManager.on('shutdown', () => this.emit('shutdown'));
  }
}

/** The singleton instance of the SyntropyLog framework. */
export const syntropyLog = SyntropyLog.getInstance();
