/**
 * @file src/logger/transports/PrettyConsoleTransport.ts
 * @description A transport that formats logs for human readability in a development console, using colors.
 */
import chalk from 'chalk';
import { LogLevel } from '../levels';
import { TransportOptions } from './Transport';
import { BaseConsolePrettyTransport } from './BaseConsolePrettyTransport';
import { LogEntry } from '../../types';

type Colorizer = (s: string) => string;
type LevelColorMap = Record<Exclude<LogLevel, 'silent'>, Colorizer>;

// Pure function: Create color map
export const createLevelColorMap = (c: typeof chalk): LevelColorMap => ({
  fatal: c.bgRed.white.bold,
  error: c.red.bold,
  warn: c.yellow.bold,
  info: c.blue.bold,
  audit: c.white.bold,
  debug: c.green,
  trace: c.gray,
});

// Pure function: Format log entry
export const formatPrettyLog = (
  logObject: LogEntry,
  c: typeof chalk,
  colorMap: LevelColorMap
): string => {
  const { timestamp, level, service, message, ...rest } = logObject;

  const colorizer = colorMap[level as Exclude<LogLevel, 'silent'>] || c.white;

  // Format the main log line
  const time = c.gray(new Date(timestamp).toLocaleTimeString());
  const levelString = colorizer(`[${level.toUpperCase()}]`);
  const serviceString = c.cyan(`(${service})`);
  const messageText = message || '';

  let logString = `${time} ${levelString} ${serviceString}: ${messageText}`;

  // Handle additional metadata, ensuring it's not empty
  const metaKeys = Object.keys(rest);
  if (metaKeys.length > 0) {
    // Use a more subtle color for metadata
    const metaString = c.gray(JSON.stringify(rest, null, 2));
    logString += `\n${metaString}`;
  }

  return logString;
};

/**
 * @class PrettyConsoleTransport
 * @description A transport that writes logs to the console in a human-readable, colorful format.
 * Ideal for use in development environments.
 * @extends {BaseConsolePrettyTransport}
 */
export class PrettyConsoleTransport extends BaseConsolePrettyTransport {
  private readonly levelColorMap: LevelColorMap;

  /**
   * @constructor
   * @param {TransportOptions} [options] - Options for the transport, such as level or a formatter.
   */
  constructor(options?: TransportOptions) {
    super(options);
    this.levelColorMap = createLevelColorMap(this.chalk);
  }

  /**
   * Formats the log object into a pretty, human-readable string.
   * @param {LogEntry} logObject - The log object to format.
   * @returns {string} The formatted string.
   */
  protected formatLogString(logObject: LogEntry): string {
    return formatPrettyLog(logObject, this.chalk, this.levelColorMap);
  }
}
