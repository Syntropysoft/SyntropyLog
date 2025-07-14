/**
 * @file src/logger/transports/BaseConsolePrettyTransport.ts
 * @description An abstract base class for console transports that provide colored, human-readable output.
 */
import { LogEntry } from '../../types';
import { Transport, TransportOptions } from './Transport';
import { LogLevelName } from '../levels';
import chalk, { Chalk } from 'chalk';

/**
 * @class BaseConsolePrettyTransport
 * @description Provides common functionality for "pretty" console transports,
 * including color handling and console method selection. Subclasses must
 * implement the `formatLogString` method to define the final output format.
 * @extends {Transport}
 */
export abstract class BaseConsolePrettyTransport extends Transport {
  protected readonly chalk: Chalk;

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
    if (entry.level === 'silent') {
      return;
    }

    // Apply the formatter first if it exists.
    const finalObject = this.formatter ? this.formatter.format(entry) : entry;

    // Let the subclass format the final string.
    const logString = this.formatLogString(finalObject);

    // Select the appropriate console method based on the log level.
    const consoleMethod = this.getConsoleMethod(
      finalObject.level as LogLevelName
    );
    consoleMethod(logString);
  }

  /**
   * Subclasses must implement this method to define the final, formatted
   * string that will be logged to the console.
   * @param {Record<string, any>} logObject - The final log object after formatting.
   * @returns {string} The formatted log string.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract formatLogString(logObject: Record<string, any>): string;

  /**
   * Determines which console method to use based on the log level.
   * @param {LogLevelName} level - The log level.
   * @returns {Function} The corresponding console method (e.g., console.log).
   */
  protected getConsoleMethod(
    level: LogLevelName
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): (message?: any, ...optionalParams: any[]) => void {
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
