/**
 * @file src/logger/Logger.ts
 * @description The core implementation of the ILogger interface.
 */
import * as util from 'node:util';
import { Transport } from './transports/Transport';
import { LOG_LEVEL_WEIGHTS } from './levels';
import type {
  LogEntry,
  LoggerOptions,
  LogBindings,
  LogMetadata,
  LogRetentionRules,
  LogFormatArg,
  JsonValue,
} from '../types';
import type { LogLevel } from './levels';
import { IContextManager } from '../context';
import { SerializationManager } from '../serialization/SerializationManager';
import { MaskingEngine } from '../masking/MaskingEngine';
import { SyntropyLog } from '../SyntropyLog';
import { ILogger } from './ILogger';

/** Per-call routing: override (only these) or add/remove from default. */
type PendingRouting =
  | { override: string[] }
  | { add: string[]; remove?: string[] }
  | { add?: string[]; remove: string[] };

// --- Pure helpers (same inputs → same outputs, no side effects) ---

/** Pure: should this level be logged given the minimum level? Audit always passes. */
function shouldLogByLevel(
  level: LogLevel,
  minLevel: Exclude<LogLevel, 'silent'>
): boolean {
  if (level === 'silent') return false;
  if (level === 'audit') return true;
  return (
    LOG_LEVEL_WEIGHTS[level as Exclude<LogLevel, 'silent'>] >=
    LOG_LEVEL_WEIGHTS[minLevel]
  );
}

/** Pure: parse Pino-like args into message and metadata. */
function parseLogArgs(args: (LogFormatArg | LogMetadata | JsonValue)[]): {
  message: string;
  metadata: LogMetadata;
} {
  let message: string;
  let metadata: LogMetadata = {};
  if (args.length === 0) {
    message = '';
  } else if (
    typeof args[0] === 'object' &&
    args[0] !== null &&
    !Array.isArray(args[0])
  ) {
    metadata = args[0] as LogMetadata;
    message = (args[1] as string) || '';
    const formatArgs = args.slice(2);
    if (message && formatArgs.length > 0) {
      message = util.format(message, ...formatArgs);
    }
  } else {
    message = (args[0] as string) || '';
    const formatArgs = args.slice(1);
    if (message && formatArgs.length > 0) {
      message = util.format(message, ...formatArgs);
    }
  }
  return { message: message || '', metadata };
}

/** Pure: resolve effective transports from default list + pool and routing (no mutation). */
function resolveEffectiveTransports(
  defaultTransports: Transport[],
  pool: Map<string, Transport> | undefined,
  routing: PendingRouting | null
): Transport[] {
  if (!pool || !routing) return defaultTransports;
  if ('override' in routing) {
    return routing.override
      .map((n) => pool.get(n))
      .filter((t): t is Transport => t != null);
  }
  let list = [...defaultTransports];
  if (routing.add?.length) {
    for (const n of routing.add) {
      const t = pool.get(n);
      if (t) list.push(t);
    }
  }
  if (routing.remove?.length) {
    const removeSet = new Set(routing.remove);
    list = list.filter((t) => !removeSet.has(t.name));
  }
  return list;
}

export interface LoggerDependencies {
  contextManager: IContextManager;
  serializationManager: SerializationManager;
  maskingEngine: MaskingEngine;
  syntropyLogInstance: SyntropyLog;
  /** Pool of transports by name, for override/add/remove per call. */
  transportPool?: Map<string, Transport>;
}

/**
 * @class Logger
 * @description The core logger implementation. It orchestrates the entire logging
 * pipeline, from argument parsing and level checking to serialization, masking,
 * and dispatching to transports.
 */
export class Logger {
  public level: LogLevel;
  public name: string;
  private transports: Transport[];
  private bindings: LogBindings;
  private dependencies: LoggerDependencies;
  /** Applied to the next log call only; then cleared. */
  private pendingRouting: PendingRouting | null = null;

  constructor(
    name: string,
    transports: Transport[],
    dependencies: LoggerDependencies,
    options: Omit<LoggerOptions, 'transports'> = {}
  ) {
    this.name = name;
    this.transports = transports;
    this.dependencies = dependencies;
    this.bindings = (options.bindings ?? {}) as LogBindings;
    this.level = options.level ?? 'info';
  }

  /**
   * For the next log call only, send to exactly these transports (by name).
   * Names must exist in the configured transport pool.
   */
  override(...names: string[]): this {
    this.pendingRouting = { override: names };
    return this;
  }

  /**
   * For the next log call only, add these transports (by name) to the default set.
   * Chain with remove() to add and remove in one go.
   */
  add(...names: string[]): this {
    const prev = this.pendingRouting;
    const add = [...(prev && 'add' in prev ? (prev.add ?? []) : []), ...names];
    const remove = prev && 'remove' in prev ? (prev.remove ?? []) : undefined;
    this.pendingRouting = remove?.length ? { add, remove } : { add };
    return this;
  }

  /**
   * For the next log call only, remove these transports (by name) from the default set.
   * Chain with add() to remove and add in one go.
   */
  remove(...names: string[]): this {
    const prev = this.pendingRouting;
    const remove = [
      ...(prev && 'remove' in prev ? (prev.remove ?? []) : []),
      ...names,
    ];
    const add = prev && 'add' in prev ? (prev.add ?? []) : undefined;
    this.pendingRouting = add?.length ? { add, remove } : { remove };
    return this;
  }

  /** Resolve effective transports from pendingRouting and pool; clears pendingRouting. Call once per _log at entry to avoid races. */
  private captureEffectiveTransports(): Transport[] {
    const routing = this.pendingRouting;
    this.pendingRouting = null;
    return resolveEffectiveTransports(
      this.transports,
      this.dependencies.transportPool,
      routing
    );
  }

  /**
   * @private
   * Método de logging síncrono que ejecuta el pipeline completo (sin devolver Promise).
   * It handles argument parsing, level filtering, serialization, masking,
   * and finally dispatches the processed log entry to the appropriate transports.
   * Routing is captured at entry to avoid race conditions when multiple log calls run concurrently.
   * @param {LogLevel} level - The severity level of the log message.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to be logged, following the Pino-like signature (e.g., `(obj, msg, ...)` or `(msg, ...)`).
   * @returns {void} Síncrono; no se devuelve Promise para no saturar el GC.
   */
  private _log(
    level: LogLevel,
    ...args: (LogFormatArg | LogMetadata | JsonValue)[]
  ): void {
    if (level === 'silent') return;

    const minLevel = this.level as Exclude<LogLevel, 'silent'>;
    if (!shouldLogByLevel(level, minLevel)) return;

    // Capture routing at entry so this call's override/add/remove is not consumed by a concurrent call.
    const effectiveTransports = this.captureEffectiveTransports();

    try {
      // 1. Camino ultra-rápido para el caso común: logger.info("mensaje")
      // Evitamos llamar a parseLogArgs (que crea un objeto { message, metadata })
      if (args.length === 1 && typeof args[0] === 'string') {
        const message = args[0];
        const context =
          this.dependencies.contextManager.getFilteredContext(level);

        // Chequear si hay bindings o contexto sin reservar memoria (sin Object.keys)
        let hasExtra = false;
        for (const key in context) {
          if (key) hasExtra = true;
          break;
        }
        if (!hasExtra) {
          for (const key in this.bindings) {
            if (key) hasExtra = true;
            break;
          }
        }

        const effectiveMetadata = hasExtra
          ? Object.assign({}, context, this.bindings)
          : undefined;

        const serializationResult =
          this.dependencies.serializationManager.serializeDirect(
            level,
            message,
            Date.now(),
            this.name,
            effectiveMetadata
          );

        if (serializationResult.serializedNative) {
          for (const transport of effectiveTransports) {
            if (transport.isLevelEnabled(level)) {
              transport.log(serializationResult.serializedNative);
            }
          }
          return;
        }
      }

      // 2. Camino normal para argumentos complejos
      const { message, metadata } = parseLogArgs(args);
      const context =
        this.dependencies.contextManager.getFilteredContext(level);

      // Chequear si hay bindings o contexto sin reservar memoria
      let hasExtra = false;
      for (const key in context) {
        if (key) hasExtra = true;
        break;
      }
      if (!hasExtra) {
        for (const key in this.bindings) {
          if (key) hasExtra = true;
          break;
        }
      }

      const effectiveMetadata = hasExtra
        ? Object.assign({}, context, this.bindings, metadata)
        : metadata;

      const serializationResult =
        this.dependencies.serializationManager.serializeDirect(
          level,
          message,
          Date.now(),
          this.name,
          effectiveMetadata
        );

      // 2. Si la ruta nativa devolvió ya la línea, pasarla a los transports; si no, masking y luego objeto.
      if (serializationResult.serializedNative) {
        for (const transport of effectiveTransports) {
          if (transport.isLevelEnabled(level)) {
            transport.log(serializationResult.serializedNative);
          }
        }
      } else {
        const finalEntry = serializationResult.data;
        const maskedEntry = this.dependencies.maskingEngine.process(
          finalEntry as Record<string, unknown>
        );
        for (const transport of effectiveTransports) {
          if (transport.isLevelEnabled(level)) {
            transport.log(maskedEntry as LogEntry);
          }
        }
      }
    } catch {
      // Intentionally swallow: logging must not throw. Failures (serialization, transport) are dropped.
    }
  }

  /**
   * Logs a message at the 'info' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  info(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void {
    this._log('info', ...args);
  }

  /**
   * Logs a message at the 'warn' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  warn(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void {
    this._log('warn', ...args);
  }

  /**
   * Logs a message at the 'error' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  error(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void {
    this._log('error', ...args);
  }

  /**
   * Logs a message at the 'debug' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  debug(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void {
    this._log('debug', ...args);
  }

  /**
   * Logs a message at the 'trace' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  trace(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void {
    this._log('trace', ...args);
  }

  /**
   * Logs a message at the 'audit' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  audit(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void {
    this._log('audit', ...args);
  }

  /**
   * Logs a message at the 'fatal' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  fatal(...args: (LogFormatArg | LogMetadata | JsonValue)[]): void {
    this._log('fatal', ...args);
  }

  /**
   * Dynamically updates the minimum log level for this logger instance.
   * Any messages with a severity lower than the new level will be ignored.
   * @param {LogLevel} level - The new minimum log level.
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Creates a new child logger instance that inherits the parent's configuration
   * and adds the specified bindings. Bindings are stored by reference (no deep clone).
   * @param {LogBindings} bindings - Key-value pairs to bind to the child logger.
   * @returns {ILogger} A new logger instance with the specified bindings.
   */
  child(bindings: LogBindings): ILogger {
    const childLogger = new Logger(
      this.name,
      this.transports,
      this.dependencies,
      {
        level: this.level,
        bindings: { ...this.bindings, ...bindings },
      }
    );
    return childLogger;
  }

  /**
   * Creates a new logger instance with a `source` field bound to it.
   * @param {string} source - The name of the source (e.g., 'redis', 'AuthModule').
   * @returns {ILogger} A new logger instance with the `source` binding.
   */
  withSource(source: string): ILogger {
    return this.child({ source });
  }

  /**
   * Creates a new logger instance with a `retention` field bound to it.
   * @param {LogRetentionRules} rules - A JSON object containing the retention rules.
   * @returns {ILogger} A new logger instance with the `retention` binding.
   */
  withRetention(rules: LogRetentionRules): ILogger {
    return this.child({ retention: rules } as LogBindings);
  }

  /**
   * Creates a new logger instance with a `transactionId` field bound to it.
   * @param {string} transactionId - The unique ID of the transaction.
   * @returns {ILogger} A new logger instance with the `transactionId` binding.
   */
  withTransactionId(transactionId: string): ILogger {
    return this.child({ transactionId });
  }
}
