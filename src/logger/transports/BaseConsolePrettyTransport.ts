/**
 * @file src/logger/transports/BaseConsolePrettyTransport.ts
 * @description An abstract base class for console transports that provide colored, human-readable output.
 */
import chalk from 'chalk';
import { LogEntry } from '../../types';
import { LogLevel } from '../levels';
import { Transport, TransportOptions } from './Transport';

/**
 * @class BaseConsolePrettyTransport
 * @description Provides common functionality for "pretty" console transports,
 * including color handling and console method selection. Subclasses must
 * implement the `formatLogString` method to define the final output format.
 * @extends {Transport}
 */
export abstract class BaseConsolePrettyTransport extends Transport {
  protected readonly chalk: chalk.Chalk;

  constructor(options?: TransportOptions) {
    super(options);
    // Chalk v4 is used directly, not instantiated.
    this.chalk = chalk;
  }

  /**
   * The core log method. It handles common logic and delegates specific
   * formatting to the subclass.
   * @param {LogEntry} entry - The log entry to process.
   * @returns {Promise<void>}
   */
  public async log(entry: LogEntry): Promise<void> {
    if (!this.isLevelEnabled(entry.level)) {
      return;
    }

    // Apply the formatter first if it exists.
    const finalObject = this.formatter ? this.formatter.format(entry) : entry;

    // Let the subclass format the final string.
    const logString = this.formatLogString(finalObject as LogEntry);

    // Select the appropriate console method based on the log level.
    const consoleMethod = this.getConsoleMethod(finalObject.level as LogLevel);
    consoleMethod(logString);
  }

  /**
   * Subclasses must implement this method to define the final, formatted
   * string that will be logged to the console.
   * @param {LogEntry} logObject - The final log object after formatting.
   * @returns {string} The formatted log string.
   */
  protected abstract formatLogString(logObject: LogEntry): string;

  /**
   * Determines which console method to use based on the log level.
   * @param {LogLevel} level - The log level.
   * @returns {Function} The corresponding console method (e.g., console.log).
   */
  protected getConsoleMethod(
    level: LogLevel
  ): (message?: unknown, ...optionalParams: unknown[]) => void {
    switch (level) {
      case 'fatal':
      case 'error':
        return console.error;
      case 'warn':
        return console.warn;
      default:
        return console.log;
    }
  }
}
