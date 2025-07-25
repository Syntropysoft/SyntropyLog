/**
 * @file src/logger/transports/PrettyConsoleTransport.ts
 * @description A transport that formats logs for human readability in a development console, using colors.
 */
import { LogLevel } from '../levels';
import { TransportOptions } from './Transport';
import chalk from 'chalk';
import { BaseConsolePrettyTransport } from './BaseConsolePrettyTransport';
import { LogEntry } from '../../types';

/**
 * @class PrettyConsoleTransport
 * @description A transport that writes logs to the console in a human-readable, colorful format.
 * Ideal for use in development environments.
 * @extends {BaseConsolePrettyTransport}
 */
export class PrettyConsoleTransport extends BaseConsolePrettyTransport {
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
      info: this.chalk.blue.bold,
      debug: this.chalk.green,
      trace: this.chalk.gray,
    };
  }

  /**
   * Formats the log object into a pretty, human-readable string.
   * @param {LogEntry} logObject - The log object to format.
   * @returns {string} The formatted string.
   */
  protected formatLogString(logObject: LogEntry): string {
    const { timestamp, level, service, message, ...rest } = logObject;

    const colorizer =
      this.levelColorMap[level as Exclude<LogLevel, 'silent'>] ||
      this.chalk.white;

    // Format the main log line
    const time = this.chalk.gray(new Date(timestamp).toLocaleTimeString());
    const levelString = colorizer(`[${level.toUpperCase()}]`);
    const serviceString = this.chalk.cyan(`(${service})`);
    const messageText = message || '';

    let logString = `${time} ${levelString} ${serviceString}: ${messageText}`;

    // Handle additional metadata, ensuring it's not empty
    const metaKeys = Object.keys(rest);
    if (metaKeys.length > 0) {
      // Use a more subtle color for metadata
      const metaString = this.chalk.gray(JSON.stringify(rest, null, 2));
      logString += `\n${metaString}`;
    }

    return logString;
  }
}
