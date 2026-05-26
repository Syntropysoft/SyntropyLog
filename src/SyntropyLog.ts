/**
 * @file src/SyntropyLog.ts
 * @description The main public-facing class for the SyntropyLog framework.
 *
 * Two ways to obtain an instance:
 *
 * 1. **Global singleton** — `import { syntropyLog } from 'syntropylog'`.
 *    Most apps want one shared logger; this is the default and matches the
 *    behavior the framework has always had.
 *
 * 2. **Factory** — `import { createSyntropyLog } from 'syntropylog'`.
 *    Returns an `ISyntropyLog` instance that is fully independent of the
 *    singleton and of any other factory-produced instances. Use for
 *    multi-tenant apps, parallel tests that need isolation, micro-frontends,
 *    or any scenario where "two SyntropyLogs in one process" is real.
 *
 * Both paths return objects that implement `ISyntropyLog` — the same method
 * surface, the same EventEmitter contract, the same lifecycle. Pick whichever
 * fits the call site; the rest of the codebase can type against `ISyntropyLog`
 * to stay agnostic.
 */
import { EventEmitter } from 'events';
import { SyntropyLogConfig } from './config';
import { IContextManager } from './context';
import { ILogger } from './logger';
import { LifecycleManager, SyntropyLogState } from './core/LifecycleManager';
import { LogLevel } from './logger/levels';
import { LoggingMatrix, JsonValue } from './types';
import type { ReconfigureTransportsForDebugOptions } from './logger/LoggerFactory';
import type { ISyntropyLog, SyntropyLogStats } from './ISyntropyLog';

// Re-export so existing `import { SyntropyLogStats } from 'syntropylog'` paths keep working.
export type { SyntropyLogStats } from './ISyntropyLog';
export type { ISyntropyLog } from './ISyntropyLog';

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
 * @description The main framework class. Acts as a Facade over `LifecycleManager`,
 * exposing the public surface declared by {@link ISyntropyLog} and proxying lifecycle
 * events. Instances are obtained via the global singleton (`syntropyLog`) or via
 * the {@link createSyntropyLog} factory.
 */
export class SyntropyLog extends EventEmitter implements ISyntropyLog {
  private static instance: SyntropyLog;
  private readonly lifecycleManager: LifecycleManager;

  /**
   * Private to keep `new SyntropyLog()` out of the public surface — pick one
   * of the supported entry points instead:
   * - {@link SyntropyLog.getInstance} for the singleton (default for app code).
   * - {@link createSyntropyLog} for a fresh, independent instance.
   */
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

  /**
   * Returns the process-wide singleton instance, creating it on first call.
   * Recommended for app-level usage where one logger config serves the whole
   * process. For multi-tenant, parallel tests, or any scenario that needs
   * isolation, use {@link createSyntropyLog} instead.
   */
  public static getInstance(): SyntropyLog {
    if (!SyntropyLog.instance) {
      SyntropyLog.instance = new SyntropyLog();
    }
    return SyntropyLog.instance;
  }

  /**
   * Creates a brand-new instance that does not share state with the singleton
   * or any other instance. Each instance has its own EventEmitter,
   * LifecycleManager, StatsCollector, and registered hooks. Backing the
   * {@link createSyntropyLog} factory.
   */
  public static create(): SyntropyLog {
    return new SyntropyLog();
  }

  /**
   * Internal test helper to reset the singleton instance.
   * Prefer `createSyntropyLog()` for new test code — it gives genuine
   * isolation without touching global state.
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

  /**
   * Add a console transport in hot (e.g. per POD) for developer clarity only. Existing transports are not removed.
   * Use when a developer needs to review an error inside a POD and see output clearly (e.g. add ColorfulConsoleTransport). No AdapterTransport or custom. Call resetTransports() to remove the added one(s).
   */
  public reconfigureTransportsForDebug(
    options: ReconfigureTransportsForDebugOptions
  ): void {
    this.lifecycleManager.ensureReady();
    this.lifecycleManager.loggerFactory!.reconfigureTransportsForDebug(options);
  }

  /**
   * Remove the transport(s) added by reconfigureTransportsForDebug (back to original set after debugging in a POD). No-op if never called.
   */
  public resetTransports(): void {
    this.lifecycleManager.ensureReady();
    this.lifecycleManager.loggerFactory!.resetTransports();
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

  /** True if the Rust native addon is loaded and used for log serialization. Call after init() for a reliable result. */
  public isNativeAddonInUse(): boolean {
    this.lifecycleManager.ensureReady();
    return this.getSerializer().isNativeAddonInUse();
  }

  /**
   * Returns a snapshot of the framework's health — current state, uptime, and
   * counters for every failure path the framework already reports via hooks.
   *
   * Safe to call before `init()` resolves: counters will be zero and `state`
   * will reflect where the framework is in its lifecycle. User-provided hooks
   * (`onLogFailure`, `onTransportError`, etc.) continue to fire unchanged —
   * `getStats()` just observes what the framework already counts internally.
   */
  public getStats(): SyntropyLogStats {
    const state = this.lifecycleManager.getState();
    const nativeAddonActive =
      state === 'READY'
        ? this.lifecycleManager.serializationManager.isNativeAddonInUse()
        : false;
    return {
      state,
      nativeAddonActive,
      ...this.lifecycleManager.statsCollector.snapshot(),
    };
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

/**
 * Returns a fresh, fully-independent SyntropyLog instance.
 *
 * The returned object implements {@link ISyntropyLog} and shares no state
 * (config, lifecycle, stats, hooks, EventEmitter listeners) with the global
 * `syntropyLog` singleton or with any other factory-produced instance.
 *
 * Typical scenarios:
 *
 * - **Multi-tenant** apps where two tenants need different log routing.
 * - **Parallel tests** that need isolated frameworks without touching
 *   `SyntropyLog.resetInstance()` or `_resetForTesting()`.
 * - **Micro-frontends** or other architectures that load SyntropyLog from
 *   more than one module-graph root.
 *
 * Each instance must be initialized independently:
 *
 * ```typescript
 * import { createSyntropyLog } from 'syntropylog';
 *
 * const sl = createSyntropyLog();
 * await sl.init({ logger: { serviceName: 'tenant-acme' } });
 * sl.getLogger().info('hello from acme');
 * await sl.shutdown();
 * ```
 */
export function createSyntropyLog(): ISyntropyLog {
  return SyntropyLog.create();
}

/** The singleton instance of the SyntropyLog framework. */
export const syntropyLog = SyntropyLog.getInstance();
