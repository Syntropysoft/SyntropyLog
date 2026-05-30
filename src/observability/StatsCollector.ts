/**
 * @file src/observability/StatsCollector.ts
 * @description Internal counters for failure paths the framework already reports via hooks.
 * Exposed read-only through `syntropyLog.getStats()`.
 *
 * Design notes:
 * - Pure data sink; never throws, never mutates user input.
 * - Counters are tracked monotonically since `markInitialized()`. They reset only when
 *   the framework itself resets (e.g. `_resetForTesting`).
 * - The collector does not subscribe to anything on its own — the LifecycleManager
 *   wraps the user's hooks so each fire increments the relevant counter and then
 *   delegates to the user's callback unchanged.
 */

/** Counts of pipeline failures observed since the framework was initialized. */
export interface StatsFailureCounts {
  /** `onLogFailure` fired — a log call failed (serialization or transport). */
  log: number;
  /** `onTransportError` fired — a transport rejected, on flush/shutdown/log. */
  transport: number;
  /** `onSerializationFallback` fired — the native pipeline yielded to the JS pipeline. */
  serializationFallback: number;
  /** `onMaskingError` fired — masking failed (e.g. regex timeout). */
  masking: number;
  /** `onStepError` fired — pipeline step failed, broken down by step name. */
  step: Record<string, number>;
}

/** The data the StatsCollector owns. Caller adds `state` and `nativeAddonActive`. */
export interface StatsSnapshot {
  /** Epoch ms when `markInitialized()` was called, or null before that. */
  initializedAt: number | null;
  /** Milliseconds since `markInitialized()` (0 if not yet initialized). */
  uptimeMs: number;
  failures: StatsFailureCounts;
}

/**
 * Mutable failure-count tracker. One instance per LifecycleManager.
 */
export class StatsCollector {
  private initializedAt: number | null = null;
  private logFailures = 0;
  private transportFailures = 0;
  private serializationFallbacks = 0;
  private maskingFailures = 0;
  private stepFailures = new Map<string, number>();

  /** Stamp the initialization time. Idempotent. */
  public markInitialized(): void {
    if (this.initializedAt === null) {
      this.initializedAt = Date.now();
    }
  }

  /** Reset counters and the init stamp. For test helpers and `_resetForTesting`. */
  public reset(): void {
    this.initializedAt = null;
    this.logFailures = 0;
    this.transportFailures = 0;
    this.serializationFallbacks = 0;
    this.maskingFailures = 0;
    this.stepFailures.clear();
  }

  public recordLogFailure(): void {
    this.logFailures++;
  }

  public recordTransportError(): void {
    this.transportFailures++;
  }

  public recordSerializationFallback(): void {
    this.serializationFallbacks++;
  }

  public recordMaskingError(): void {
    this.maskingFailures++;
  }

  public recordStepError(step: string): void {
    this.stepFailures.set(step, (this.stepFailures.get(step) ?? 0) + 1);
  }

  /** Read-only snapshot. Safe to expose to users. */
  public snapshot(): StatsSnapshot {
    return {
      initializedAt: this.initializedAt,
      uptimeMs:
        this.initializedAt === null ? 0 : Date.now() - this.initializedAt,
      failures: {
        log: this.logFailures,
        transport: this.transportFailures,
        serializationFallback: this.serializationFallbacks,
        masking: this.maskingFailures,
        step: Object.fromEntries(this.stepFailures),
      },
    };
  }
}
