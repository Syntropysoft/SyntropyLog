/**
 * @file src/ISyntropyLog.ts
 * @description Public contract for a SyntropyLog instance.
 *
 * Defines `ISyntropyLog` (the interface every instance fulfills) and
 * `SyntropyLogStats` (the snapshot shape returned by `getStats()`).
 *
 * Use this interface when typing dependencies that should work with either the
 * global singleton (`syntropyLog`) or an instance produced by the factory
 * (`createSyntropyLog()`):
 *
 * ```typescript
 * import type { ISyntropyLog } from 'syntropylog';
 *
 * function buildAuditLogger(sl: ISyntropyLog) {
 *   return sl.getLogger('audit').withRetention('SOX_AUDIT_TRAIL');
 * }
 * ```
 *
 * The interface intentionally excludes static/singleton helpers
 * (`getInstance`, `resetInstance`, `_resetForTesting`) — those belong to the
 * concrete `SyntropyLog` class, not the per-instance contract.
 */

import type { EventEmitter } from 'events';
import type { SyntropyLogConfig } from './config';
import type { IContextManager } from './context';
import type { ILogger } from './logger';
import type { SyntropyLogState } from './core/LifecycleManager';
import type { LogLevel } from './logger/levels';
import type { LoggingMatrix, JsonValue } from './types';
import type { ReconfigureTransportsForDebugOptions } from './logger/LoggerFactory';
import type { StatsSnapshot } from './observability/StatsCollector';
import type { MaskingEngine } from './masking/MaskingEngine';
import type { SerializationManager } from './serialization/SerializationManager';

/**
 * Full health snapshot returned by {@link ISyntropyLog.getStats}.
 *
 * Combines the failure counters owned by the StatsCollector (`StatsSnapshot`)
 * with `state` and `nativeAddonActive` — fields that only the LifecycleManager
 * and serializer can answer authoritatively.
 */
export interface SyntropyLogStats extends StatsSnapshot {
  state: SyntropyLogState;
  /** True if the Rust native addon is loaded and used for serialization. */
  nativeAddonActive: boolean;
}

/**
 * The contract implemented by every SyntropyLog instance.
 *
 * Extends `EventEmitter` so consumers can subscribe to lifecycle events
 * (`ready`, `error`, `shutting_down`, `transports_drained`, `shutdown`).
 * Those events are internal coordination signals — prefer `await init()` /
 * `await shutdown()` in application code (see `docs/lifecycle.md`).
 */
export interface ISyntropyLog extends EventEmitter {
  getState(): SyntropyLogState;
  init(config: SyntropyLogConfig): Promise<void>;
  shutdown(): Promise<void>;
  getLogger(name?: string, bindings?: Record<string, JsonValue>): ILogger;
  getContextManager(): IContextManager;
  getConfig(): SyntropyLogConfig;
  getFilteredContext(level: LogLevel): Record<string, unknown>;
  reconfigureLoggingMatrix(matrix: LoggingMatrix): void;
  reconfigureTransportsForDebug(
    options: ReconfigureTransportsForDebugOptions
  ): void;
  resetTransports(): void;
  getMasker(): MaskingEngine;
  getSerializer(): SerializationManager;
  isNativeAddonInUse(): boolean;
  getStats(): SyntropyLogStats;
}
