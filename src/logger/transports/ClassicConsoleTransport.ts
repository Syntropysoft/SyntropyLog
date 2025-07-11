/**
 * @file src/logger/transports/ClassicConsoleTransport.ts
 * @description A transport that formats logs in a classic, single-line, text-based format, similar to Log4j.
 */
import { TransportOptions } from './Transport';
import { LogLevelName } from '../levels';
import { type ChalkInstance } from 'chalk';
import { BaseConsolePrettyTransport } from './BaseConsolePrettyTransport';

/**
 * @class ClassicConsoleTransport
 * A transport that writes logs to the console in a classic single-line format,
 * reminiscent of traditional Java logging frameworks.
 * @extends {BaseConsolePrettyTransport}
 */
export class ClassicConsoleTransport extends BaseConsolePrettyTransport {
  private readonly levelColorMap: Record<
    Exclude<LogLevelName, 'silent'>,
    ChalkInstance
  >;

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
      info: this.chalk.green, // Using green for info in this style
      debug: this.chalk.blue,
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
   * @param {Record<string, any>} logObject - The log object to format.
   * @returns {string} The formatted string.
   */
  protected formatLogString(logObject: Record<string, any>): string {
    const { timestamp, level, service, msg, context, ...rest } = logObject;

    const colorizer =
      this.levelColorMap[level as Exclude<LogLevelName, 'silent'>] ||
      this.chalk.white;

    // 1. Format the timestamp.
    const timeStr = this.formatTimestamp(timestamp);

    // 2. Format the level, padded to a fixed width for alignment.
    const levelStr = colorizer(level.toUpperCase().padEnd(5));

    // 3. Format the service name.
    const serviceStr = this.chalk.magenta(`[${service}]`);

    // 4. Combine context and other metadata and format it.
    const allMeta = { ...context, ...rest };
    const metaKeys = Object.keys(allMeta);
    let metaStr = '';
    if (metaKeys.length > 0) {
      metaStr = this.chalk.dim(
        ' [' +
          metaKeys
            .map((key) => `${key}=${JSON.stringify(allMeta[key])}`)
            .join(' ') +
          ']'
      );
    }

    // 5. The main log message.
    const message = msg;

    // Assemble the final string, ensuring metadata is placed correctly.
    const logString = `${timeStr} ${levelStr} ${serviceStr}${metaStr} :: ${message}`;
    return logString;
  }
}
