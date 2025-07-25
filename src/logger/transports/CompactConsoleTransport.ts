/**
 * @file src/logger/transports/CompactConsoleTransport.ts
 * @description A transport that formats logs for a compact, human-readable console output.
 */
import { LogLevel } from '../levels';
import { TransportOptions } from './Transport';
import chalk from 'chalk';
import { BaseConsolePrettyTransport } from './BaseConsolePrettyTransport';
import { LogEntry } from '../../types';

/**
 * @class CompactConsoleTransport
 * A transport that writes logs to the console in a compact, single-line format
 * for metadata, optimized for developer productivity.
 * @extends {BaseConsolePrettyTransport}
 */
export class CompactConsoleTransport extends BaseConsolePrettyTransport {
  private readonly levelColorMap: Record<Exclude<LogLevel, 'silent'>, any>;

  /**
   * @constructor
   * @param {TransportOptions} [options] - Options for the transport, such as level or a formatter.
   */
  constructor(options?: TransportOptions) {
    super(options);
    this.levelColorMap = {
      fatal: this.chalk.bgRed.white.bold,
      error: this.chalk.red.bold,
      warn: this.chalk.yellow.bold,
      info: this.chalk.cyan.bold, // Using cyan for better contrast in compact view.
      debug: this.chalk.green,
      trace: this.chalk.gray,
    };
  }

  /**
   * Formats the log object into a compact, human-readable string.
   * @param {LogEntry} logObject - The log object to format.
   * @returns {string} The formatted string.
   */
  protected formatLogString(logObject: LogEntry): string {
    const { timestamp, level, service, message, ...rest } = logObject;

    const colorizer =
      this.levelColorMap[level as Exclude<LogLevel, 'silent'>] ||
      this.chalk.white;

    const time = this.chalk.gray(new Date(timestamp).toLocaleTimeString());
    const levelString = colorizer(`[${level.toUpperCase()}]`);
    const serviceString = this.chalk.blue(`(${service})`);
    const messageText = message || '';

    let logString = `${time} ${levelString} ${serviceString}: ${messageText}`;

    // Format metadata into a single, compact line.
    const metaKeys = Object.keys(rest);
    if (metaKeys.length > 0) {
      const metaString = metaKeys
        .map((key) => {
          const value = rest[key];
          // Simple stringify for objects/arrays in metadata.
          const formattedValue =
            typeof value === 'object' && value !== null
              ? JSON.stringify(value)
              : value;
          return `${this.chalk.dim(key)}=${this.chalk.gray(formattedValue)}`;
        })
        .join(' ');

      // Append metadata on a new, indented line for clarity.
      logString += `\n  ${this.chalk.dim('└─')} ${metaString}`;
    }

    return logString;
  }
}
