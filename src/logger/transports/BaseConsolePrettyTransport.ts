/**
 * @file src/logger/transports/BaseConsolePrettyTransport.ts
 * @description An abstract base class for console transports that provide colored, human-readable output.
 * Colors use built-in ANSI (no chalk dependency). Disabled when NO_COLOR is set or stdout is not a TTY.
 */
import { LogEntry } from '../../types';
import { LogLevel } from '../levels';
import { Transport, TransportOptions } from './Transport';
import { getOptionalChalk, type ChalkLike } from './optionalChalk';

/**
 * @class BaseConsolePrettyTransport
 * @description Provides common functionality for "pretty" console transports,
 * including color handling and console method selection. Subclasses must
 * implement the `formatLogString` method to define the final output format.
 * @extends {Transport}
 */
export abstract class BaseConsolePrettyTransport extends Transport {
  protected readonly chalk: ChalkLike;

  constructor(options?: TransportOptions) {
    super(options);
    this.chalk = getOptionalChalk();
  }

  /**
   * The core log method. It handles common logic and delegates specific
   * formatting to the subclass. When entry is a pre-serialized string (native path),
   * it is parsed back to a LogEntry so the subclass can apply colors/formatting.
   * The extra parse is acceptable: pretty/colorful transports are for dev/staging
   * where clarity for the developer matters more than a small perf cost.
   * @param entry - Log entry object or pre-serialized JSON string.
   */
  public log(entry: LogEntry | string): void {
    let logObject: LogEntry;
    if (typeof entry === 'string') {
      try {
        const parsed = JSON.parse(entry) as LogEntry;
        if (!parsed.level || !parsed.timestamp) {
          console.log(entry);
          return;
        }
        logObject = parsed;
      } catch {
        console.log(entry);
        return;
      }
    } else {
      logObject = entry;
    }
    if (!this.isLevelEnabled(logObject.level)) {
      return;
    }

    // Apply the formatter first if it exists.
    const finalObject = this.formatter
      ? this.formatter.format(logObject)
      : logObject;

    // Let the subclass format the final string (with colors).
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
