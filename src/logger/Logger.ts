/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @file src/logger/Logger.ts
 * @description The core implementation of the ILogger interface.
 */
import { format } from 'util';
import type { IContextManager } from '../context/IContextManager';
import type { ILogger } from './ILogger';
import { JsonValue, LogEntry } from '../types';
import { logLevels, LogLevelName } from './levels';
import { Transport } from './transports/Transport';
import { SerializerRegistry } from '../serialization/SerializerRegistry';
import { MaskingEngine } from '../masking/MaskingEngine';

/**
 * @interface LoggerOptions
 * @description Defines the configuration options required to create a Logger instance.
 */
export interface LoggerOptions {
  /** The manager for handling asynchronous contexts. */
  contextManager: IContextManager;
  /** An array of transports to which logs will be dispatched. */
  transports: Transport[];
  /** The minimum log level for this logger instance. Defaults to 'info'. */
  level?: LogLevelName;
  /** The name of the service, included in every log entry. */
  serviceName?: string;
  /** A set of key-value pairs to be included in every log entry from this logger. */
  bindings?: Record<string, JsonValue>;
  /** The engine responsible for serializing complex objects. */
  serializerRegistry: SerializerRegistry;
  /** The engine responsible for masking sensitive data. */
  maskingEngine: MaskingEngine;
}

/**
 * @class Logger
 * @description The core logger implementation. It orchestrates the entire logging
 * pipeline, from argument parsing and level checking to serialization, masking,
 * and dispatching to transports.
 * @implements {ILogger}
 */
export class Logger implements ILogger {
  /** @private The manager for handling asynchronous contexts. */
  private readonly contextManager: IContextManager;
  /** @private An array of transports to which logs will be dispatched. */
  private readonly transports: Transport[];
  /** @private A set of key-value pairs included in every log entry. */
  private readonly bindings: Record<string, JsonValue>;
  /** @private The name of the service, included in every log entry. */
  private readonly serviceName: string;
  /** @private The current minimum log level for this logger instance. */
  private level: LogLevelName;
  /** @private The engine responsible for serializing complex objects. */
  private readonly serializerRegistry: SerializerRegistry;
  /** @private The engine responsible for masking sensitive data. */
  private readonly maskingEngine: MaskingEngine;

  /**
   * @constructor
   * @param {LoggerOptions} opts - The configuration options for the logger.
   */
  constructor(opts: LoggerOptions) {
    this.contextManager = opts.contextManager;
    this.transports = opts.transports;
    this.level = opts.level ?? 'info';
    this.serviceName = opts.serviceName ?? 'any-service';
    this.bindings = opts.bindings || {};
    this.serializerRegistry = opts.serializerRegistry;
    this.maskingEngine = opts.maskingEngine;
  }

  /**
   * @private
   * The core asynchronous logging method that runs the full processing pipeline.
   * It handles argument parsing, level filtering, serialization, masking,
   * and finally dispatches the processed log entry to the appropriate transports.
   * @param {LogLevelName} level - The severity level of the log message.
   * @param {...any[]} args - The arguments to be logged, following the Pino-like signature (e.g., `(obj, msg, ...)` or `(msg, ...)`).
   * @returns {Promise<void>}
   */
  private async _log(level: LogLevelName, ...args: any[]): Promise<void> {
    const loggerLevelValue = logLevels[this.level];
    const messageLevelValue = logLevels[level];

    // Discard the log if the message's level is lower than the logger's level.
    if (messageLevelValue < loggerLevelValue) {
      return;
    }

    let meta: Record<string, any> = {};
    let messageArgs = args;

    // Parse arguments to separate the metadata object from the message and its format arguments.
    if (
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0])
    ) {
      meta = { ...args[0] };
      messageArgs = args.slice(1);
    }

    // --- Processing Pipeline Execution ---
    // 1. Serialization (awaits the result as it can be async)
    const serializedMeta = await this.serializerRegistry.process(meta, this);

    // 2. Masking (runs on the now-serialized data)
    const maskedMeta = this.maskingEngine.process(serializedMeta);
    // --- End of Pipeline ---

    // Extract 'msg' from metadata if it exists, so it doesn't appear twice.
    const metaMessage = (maskedMeta.msg as string) ?? undefined;
    if (metaMessage) delete maskedMeta.msg;

    const formattedMessage =
      messageArgs.length > 0 ? format(...messageArgs) : '';
    const finalMessage = [metaMessage, formattedMessage]
      .filter(Boolean)
      .join(' ');

    const entry: LogEntry = {
      ...this.bindings,
      ...maskedMeta,
      context: this.contextManager.getAll(),
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      msg: finalMessage,
    };

    // Dispatch the final log entry to all transports that are configured
    // to handle this log level.
    const promises = this.transports
      .filter((transport) => {
        if (!transport.level) return true;
        const transportLevelValue = logLevels[transport.level];
        return messageLevelValue >= transportLevelValue;
      })
      .map((transport) => transport.log(entry));

    // Fire and forget the transport promises. Logging should not block the
    // application, and a failing transport should not crash the process.
    Promise.allSettled(promises).catch(() => {
      // This catch is a safeguard, but allSettled should not reject.
      // We intentionally do nothing here.
    });
  }

  /**
   * Logs a message at the 'info' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  public info(...args: any[]): void {
    this._log('info', ...args);
  }

  /**
   * Logs a message at the 'warn' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  public warn(...args: any[]): void {
    this._log('warn', ...args);
  }

  /**
   * Logs a message at the 'error' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  public error(...args: any[]): void {
    this._log('error', ...args);
  }

  /**
   * Logs a message at the 'debug' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  public debug(...args: any[]): void {
    this._log('debug', ...args);
  }

  /**
   * Logs a message at the 'trace' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  public trace(...args: any[]): void {
    this._log('trace', ...args);
  }

  /**
   * Logs a message at the 'fatal' level.
   * @param {object} obj - An object with properties to be included in the log.
   * @param {string} [message] - The log message, with optional format placeholders.
   * @param {...any[]} args - Values to substitute into the message placeholders.
   */
  public fatal(...args: any[]): void {
    this._log('fatal', ...args);
  }

  /**
   * Dynamically updates the minimum log level for this logger instance.
   * Any messages with a severity lower than the new level will be ignored.
   * @param {LogLevelName} level - The new minimum log level.
   */
  public setLevel(level: LogLevelName): void {
    this.level = level;
  }

  /**
   * Creates a new child logger instance that inherits the parent's configuration
   * and adds a set of persistent key-value bindings.
   * @param {Record<string, JsonValue>} bindings - Key-value pairs to add to the child logger.
   * @returns {ILogger} A new logger instance with the combined bindings.
   */
  public child(bindings: Record<string, JsonValue>): ILogger {
    return new Logger({
      ...this,
      bindings: { ...this.bindings, ...bindings },
    });
  }

  /**
   * Creates a new logger instance with a `source` field bound to it.
   * @param {string} source - The name of the source (e.g., 'redis', 'AuthModule').
   * @returns {ILogger} A new logger instance with the `source` binding.
   */
  public withSource(source: string): ILogger {
    return this.child({ source });
  }

  /**
   * Creates a new logger instance with a `retention` field bound to it.
   * The provided rules object is deep-cloned to ensure immutability.
   * @param {Record<string, any>} rules - A JSON object containing the retention rules.
   * @returns {ILogger} A new logger instance with the `retention` binding.
   */
  public withRetention(rules: Record<string, any>): ILogger {
    const safeRules = JSON.parse(JSON.stringify(rules));
    return this.child({ retention: safeRules });
  }

  /**
   * Creates a new logger instance with a `transactionId` field bound to it.
   * @param {string} transactionId - The unique ID of the transaction.
   * @returns {ILogger} A new logger instance with the `transactionId` binding.
   */
  public withTransactionId(transactionId: string): ILogger {
    return this.child({ transactionId });
  }
}
