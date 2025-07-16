/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @file src/logger/Logger.ts
 * @description The core implementation of the ILogger interface.
 */
import * as util from 'node:util';
import { Transport } from './transports/Transport';
import { LOG_LEVEL_WEIGHTS } from './levels';
import type { LogEntry, LogLevel, LoggerOptions } from '../types';
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
  private bindings: Record<string, any>;
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
   * @param {...any[]} args - The arguments to be logged, following the Pino-like signature (e.g., `(obj, msg, ...)` or `(msg, ...)`).
   * @returns {Promise<void>}
   */
  private async _log(level: LogLevel, ...args: unknown[]): Promise<void> {
    if (level === 'silent') {
      return;
    }
    // Type-guarded access to weights
    const weightedLevel = level as LogLevelWithWeight;
    const weightedThisLevel = this.level as LogLevelWithWeight;

    if (
      LOG_LEVEL_WEIGHTS[weightedLevel] < LOG_LEVEL_WEIGHTS[weightedThisLevel]
    ) {
      return;
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
    let metadata: Record<string, any> = {};

    if (args.length === 0) {
      message = '';
    } else if (
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0])
    ) {
      // First argument is metadata object: (metadata, message, ...formatArgs)
      metadata = args[0] as Record<string, any>;
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
      this as any
    );

    // 2. Apply masking to the entire, serialized entry.
    const maskedEntry =
      await this.dependencies.maskingEngine.process(finalEntry);

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
   * @param {...any[]} args - The arguments to log.
   */
  info(...args: unknown[]): Promise<void> {
    return this._log('info', ...args);
  }

  /**
   * Logs a message at the 'warn' level.
   * @param {...any[]} args - The arguments to log.
   */
  warn(...args: unknown[]): Promise<void> {
    return this._log('warn', ...args);
  }

  /**
   * Logs a message at the 'error' level.
   * @param {...any[]} args - The arguments to log.
   */
  error(...args: unknown[]): Promise<void> {
    return this._log('error', ...args);
  }

  /**
   * Logs a message at the 'debug' level.
   * @param {...any[]} args - The arguments to log.
   */
  debug(...args: unknown[]): Promise<void> {
    return this._log('debug', ...args);
  }

  /**
   * Logs a message at the 'trace' level.
   * @param {...any[]} args - The arguments to log.
   */
  trace(...args: unknown[]): Promise<void> {
    return this._log('trace', ...args);
  }

  /**
   * Logs a message at the 'fatal' level.
   * @param {...any[]} args - The arguments to log.
   */
  fatal(...args: unknown[]): Promise<void> {
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
   * and adds a set of persistent key-value bindings.
   * @param {Record<string, any>} bindings - Key-value pairs to add to the child logger.
   * @returns {ILogger} A new logger instance with the combined bindings.
   */
  child(bindings: Record<string, any>): ILogger {
    // Determine the child logger name
    const childName = bindings.name
      ? `${this.name}:${bindings.name}`
      : `${this.name}:child-logger`;

    // Call getLogger on the syntropyLog instance to maintain proper hierarchy
    const childLogger = this.dependencies.syntropyLogInstance.getLogger(
      childName,
      bindings
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
   * The provided rules object is deep-cloned to ensure immutability.
   * @param {Record<string, any>} rules - A JSON object containing the retention rules.
   * @returns {ILogger} A new logger instance with the `retention` binding.
   */
  withRetention(rules: Record<string, any>): ILogger {
    const safeRules = JSON.parse(JSON.stringify(rules));
    return this.child({ retention: safeRules });
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
