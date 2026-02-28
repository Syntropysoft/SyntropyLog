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
import { SerializerRegistry } from '../serialization/SerializerRegistry';
import { MaskingEngine } from '../masking/MaskingEngine';
import { SyntropyLog } from '../SyntropyLog';
import { ILogger } from './ILogger';

export interface LoggerDependencies {
  contextManager: IContextManager;
  serializerRegistry: SerializerRegistry;
  maskingEngine: MaskingEngine;
  syntropyLogInstance: SyntropyLog;
}

type LogLevelWithWeight = Exclude<LogLevel, 'silent'>;

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

  constructor(
    name: string,
    transports: Transport[],
    dependencies: LoggerDependencies,
    options: Omit<LoggerOptions, 'transports'> = {}
  ) {
    this.name = name;
    this.transports = transports;
    this.dependencies = dependencies;
    this.bindings = options.bindings ?? {};
    this.level = options.level ?? 'info';
  }

  /**
   * @private
   * The core asynchronous logging method that runs the full processing pipeline.
   * It handles argument parsing, level filtering, serialization, masking,
   * and finally dispatches the processed log entry to the appropriate transports.
   * @param {LogLevel} level - The severity level of the log message.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to be logged, following the Pino-like signature (e.g., `(obj, msg, ...)` or `(msg, ...)`).
   * @returns {Promise<void>}
   */
  private async _log(
    level: LogLevel,
    ...args: (LogFormatArg | LogMetadata | JsonValue)[]
  ): Promise<void> {
    if (level === 'silent') {
      return;
    }

    // Guard clause: audit logs bypass standard level filtering
    const isAudit = level === 'audit';

    // Type-guarded access to weights
    if (!isAudit) {
      const weightedLevel = level as LogLevelWithWeight;
      const weightedThisLevel = this.level as LogLevelWithWeight;

      if (
        LOG_LEVEL_WEIGHTS[weightedLevel] < LOG_LEVEL_WEIGHTS[weightedThisLevel]
      ) {
        return;
      }
    }

    // Build the base log entry with context and bindings
    const context = this.dependencies.contextManager.getFilteredContext(level);
    const logEntry: LogEntry = {
      ...context,
      ...this.bindings,
      level,
      timestamp: new Date().toISOString(),
      service: this.name,
      message: '', // Will be set below
    };

    // Parse arguments following Pino-like signature
    let message: string;
    let metadata: LogMetadata = {};

    if (args.length === 0) {
      message = '';
    } else if (
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0])
    ) {
      // First argument is metadata object: (metadata, message, ...formatArgs)
      metadata = args[0] as LogMetadata;
      message = (args[1] as string) || '';
      const formatArgs = args.slice(2);

      if (message && formatArgs.length > 0) {
        message = util.format(message, ...formatArgs);
      }
    } else {
      // First argument is message: (message, ...formatArgs)
      message = (args[0] as string) || '';
      const formatArgs = args.slice(1);

      if (message && formatArgs.length > 0) {
        message = util.format(message, ...formatArgs);
      }
    }

    // Ensure message is never undefined
    logEntry.message = message || '';

    // Merge metadata into log entry
    Object.assign(logEntry, metadata);

    // 1. Apply custom serializers (e.g., for Error objects)
    const finalEntry = await this.dependencies.serializerRegistry.process(
      logEntry,
      this as ILogger
    );

    // 2. Apply masking to the entire, serialized entry.
    const maskedEntry = this.dependencies.maskingEngine.process(finalEntry);

    // Dispatch to transports
    await Promise.all(
      this.transports.map((transport) => {
        if (transport.isLevelEnabled(level)) {
          // The type assertion is safe here because the masking engine preserves the structure.
          return transport.log(maskedEntry as LogEntry);
        }
        return Promise.resolve();
      })
    );
  }

  /**
   * Logs a message at the 'info' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  info(...args: (LogFormatArg | LogMetadata | JsonValue)[]): Promise<void> {
    return this._log('info', ...args);
  }

  /**
   * Logs a message at the 'warn' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  warn(...args: (LogFormatArg | LogMetadata | JsonValue)[]): Promise<void> {
    return this._log('warn', ...args);
  }

  /**
   * Logs a message at the 'error' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  error(...args: (LogFormatArg | LogMetadata | JsonValue)[]): Promise<void> {
    return this._log('error', ...args);
  }

  /**
   * Logs a message at the 'debug' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  debug(...args: (LogFormatArg | LogMetadata | JsonValue)[]): Promise<void> {
    return this._log('debug', ...args);
  }

  /**
   * Logs a message at the 'trace' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  trace(...args: (LogFormatArg | LogMetadata | JsonValue)[]): Promise<void> {
    return this._log('trace', ...args);
  }

  /**
   * Logs a message at the 'audit' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  audit(...args: (LogFormatArg | LogMetadata | JsonValue)[]): Promise<void> {
    return this._log('audit', ...args);
  }

  /**
   * Logs a message at the 'fatal' level.
   * @param {...(LogFormatArg | LogMetadata | JsonValue)[]} args - The arguments to log.
   */
  fatal(...args: (LogFormatArg | LogMetadata | JsonValue)[]): Promise<void> {
    return this._log('fatal', ...args);
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
   * and adds the specified bindings.
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
    return this.child({ retention: rules } as any);
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
