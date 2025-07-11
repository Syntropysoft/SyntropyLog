/**
 * @file src/logger/transports/Transport.ts
 * @description Defines the abstract base class for all log transports.
 */
import { LogEntry } from '../../types';
import { LogLevelName } from '../levels';
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
  level?: LogLevelName;
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
}

/**
 * @class Transport
 * @description Abstract base class for all transports.
 * A transport is responsible for sending a log entry to a specific destination,
 * such as the console, a file, or a remote service.
 */
export abstract class Transport {
  /** The minimum log level this transport will process. */
  public readonly level?: LogLevelName;
  /** The formatter instance to transform log entries. */
  protected readonly formatter?: LogFormatter;
  /** The engine used to sanitize sensitive data. */
  protected readonly sanitizationEngine?: SanitizationEngine;

  /**
   * @constructor
   * @param {TransportOptions} [options] - The configuration options for this transport.
   */
  constructor(options?: TransportOptions) {
    this.level = options?.level;
    this.formatter = options?.formatter;
    this.sanitizationEngine = options?.sanitizationEngine;
  }

  /**
   * The core method of a transport. It processes and outputs a log entry.
   * This method must be implemented by subclasses.
   * @param {LogEntry} entry - The log entry to process.
   * @returns {Promise<void>}
   */
  public abstract log(entry: LogEntry): Promise<void>;

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
