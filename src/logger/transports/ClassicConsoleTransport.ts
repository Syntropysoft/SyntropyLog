/**
 * @file src/logger/transports/ClassicConsoleTransport.ts
 * @description A transport that formats logs in a classic, single-line, text-based format, similar to Log4j.
 */
import { TransportOptions } from './Transport';
import { LogLevel } from '../levels';
import chalk from 'chalk';
import { BaseConsolePrettyTransport } from './BaseConsolePrettyTransport';
import { LogEntry } from '../../types';

/**
 * @class ClassicConsoleTransport
 * A transport that writes logs to the console in a classic single-line format,
 * reminiscent of traditional Java logging frameworks.
 * @extends {BaseConsolePrettyTransport}
 */
export class ClassicConsoleTransport extends BaseConsolePrettyTransport {
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
      audit: this.chalk.white.bold,
      debug: this.chalk.green,
      trace: this.chalk.gray,
    };
  }

  /**
   * @private
   * Formats a date object into a 'YYYY-MM-DD HH:mm:ss' string.
   * @param {string} ts - The ISO timestamp string to format.
   * @returns {string} The formatted timestamp.
   */
  private formatTimestamp(ts: string): string {
    const date = new Date(ts);
    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${HH}:${min}:${ss}`;
  }

  /**
   * Formats the log object into a classic, single-line string.
   * @param {LogEntry} logObject - The log object to format.
   * @returns {string} The formatted string.
   */
  protected formatLogString(logObject: LogEntry): string {
    const { timestamp, level, service, message, context, ...rest } = logObject;

    const colorizer =
      this.levelColorMap[level as Exclude<LogLevel, 'silent'>] ||
      this.chalk.white;

    // 1. Format the timestamp.
    const timeStr = this.formatTimestamp(timestamp);

    // 2. Format the level, padded to a fixed width for alignment.
    const levelStr = colorizer(level.toUpperCase().padEnd(5));

    // 3. Format the service name.
    const serviceStr = this.chalk.magenta(`[${service}]`);

    // 4. Combine context, other metadata, and message, then format it.
    const allMeta = {
      ...((context as Record<string, unknown>) || {}),
      ...rest,
      message,
    };
    const metaKeys = Object.keys(allMeta);
    let metaStr = '';
    if (metaKeys.length > 0) {
      metaStr = this.chalk.dim(
        ' [' +
          metaKeys
            .map(
              (key) =>
                `${key}=${JSON.stringify((allMeta as Record<string, unknown>)[key])}`
            )
            .join(' ') +
          ']'
      );
    }

    // 5. Assemble the final string.
    const logString = `${timeStr} ${levelStr} ${serviceStr}${metaStr}`;
    return logString;
  }
}
