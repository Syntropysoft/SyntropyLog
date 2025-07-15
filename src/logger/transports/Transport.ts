/**
 * @file src/logger/transports/Transport.ts
 * @description Defines the abstract base class for all log transports.
 */
import { LOG_LEVEL_WEIGHTS, type LogLevel } from '../levels';
import type { LogEntry } from '../../types';
import { SanitizationEngine } from '../../sanitization/SanitizationEngine';
import { LogFormatter } from './formatters/LogFormatter';

/**
 * @interface TransportOptions
 * @description Defines the options for configuring a transport.
 */
export interface TransportOptions {
  /**
   * The minimum log level this transport will handle.
   * If not specified, the transport will handle all levels defined by the logger.
   */
  level?: LogLevel;
  /**
   * An optional formatter to transform the log entry before output.
   */
  formatter?: LogFormatter;
  /**
   * An optional, pre-configured sanitization engine.
   * If provided, the transport will use it to sanitize logs. This is typically
   * used by production-safe transports like `ConsoleTransport`.
   */
  sanitizationEngine?: SanitizationEngine;
  /**
   * An optional name for the transport, useful for debugging.
   */
  name?: string;
}

/**
 * @class Transport
 * @description The abstract base class for all log transports. A transport is
 * responsible for the final output of a log entry, whether it's to the console,
 * a file, or a remote service.
 */
export abstract class Transport {
  public level: LogLevel;
  public name: string;
  /** The formatter instance to transform log entries. */
  protected readonly formatter?: LogFormatter;
  /** The engine used to sanitize sensitive data. */
  protected readonly sanitizationEngine?: SanitizationEngine;

  /**
   * @constructor
   * @param {TransportOptions} [options] - The configuration options for this transport.
   */
  constructor(options: TransportOptions = {}) {
    this.level = options.level ?? 'info';
    this.name = options.name ?? this.constructor.name;
    this.formatter = options?.formatter;
    this.sanitizationEngine = options?.sanitizationEngine;
  }

  /**
   * Determines if the transport should process a log entry based on its log level.
   * @param level - The level of the log entry to check.
   * @returns {boolean} - True if the transport is enabled for this level, false otherwise.
   */
  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_WEIGHTS[level] >= LOG_LEVEL_WEIGHTS[this.level];
  }

  /**
   * The core method that all concrete transports must implement. This method
   * handles the actual sending/writing of the log entry.
   * @param {LogEntry} entry - The final, processed log entry to be outputted.
   * @returns {Promise<void>}
   */
  abstract log(entry: LogEntry): Promise<void>;

  /**
   * A method to ensure all buffered logs are written before the application exits.
   * Subclasses should override this if they perform I/O buffering.
   * @returns {Promise<void>} A promise that resolves when flushing is complete.
   */
  public async flush(): Promise<void> {
    // Default implementation does nothing, assuming no buffering.
    return Promise.resolve();
  }
}
