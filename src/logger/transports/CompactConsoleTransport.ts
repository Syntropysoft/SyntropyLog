/**
 * FILE: src/logger/transports/CompactConsoleTransport.ts
 * DESCRIPTION: A transport that formats logs for a compact, human-readable console output.
 */
import { LogEntry } from '../../types';
import { Transport, TransportOptions } from './Transport';
import { LogLevelName } from '../levels';
import chalk, { type ChalkInstance } from 'chalk';

const levelColorMap: Record<Exclude<LogLevelName, 'silent'>, ChalkInstance> = {
  fatal: chalk.bgRed.white.bold,
  error: chalk.red.bold,
  warn: chalk.yellow.bold,
  info: chalk.cyan.bold, // Changed to cyan for better contrast
  debug: chalk.green,
  trace: chalk.gray,
};

/**
 * A transport that writes logs to the console in a compact, single-line format
 * for metadata, optimized for developer productivity.
 */
export class CompactConsoleTransport extends Transport {
  constructor(options?: TransportOptions) {
    super(options);
  }

  /**
   * Logs a structured entry to the console in a compact, pretty format.
   * @param entry The log entry to process.
   */
  public async log(entry: LogEntry): Promise<void> {
    if (entry.level === 'silent') {
      return;
    }

    const finalObject = this.formatter ? this.formatter.format(entry) : entry;
    const { timestamp, level, service, msg, ...rest } = finalObject;

    const colorizer =
      levelColorMap[level as Exclude<LogLevelName, 'silent'>] || chalk.white;

    const time = chalk.gray(new Date(timestamp).toLocaleTimeString());
    const levelString = colorizer(`[${level.toUpperCase()}]`);
    const serviceString = chalk.blue(`(${service})`);
    const message = msg;

    let logString = `${time} ${levelString} ${serviceString}: ${message}`;

    // Format metadata into a single, compact line
    const metaKeys = Object.keys(rest);
    if (metaKeys.length > 0) {
      const metaString = metaKeys
        .map((key) => {
          const value = rest[key];
          // Simple stringify for objects/arrays in metadata
          const formattedValue =
            typeof value === 'object' && value !== null
              ? JSON.stringify(value)
              : value;
          return `${chalk.dim(key)}=${chalk.gray(formattedValue)}`;
        })
        .join(' ');

      // Append metadata on a new, indented line for clarity
      logString += `\n  └─ ${metaString}`;
    }

    const consoleMethod =
      level === 'fatal' || level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log;

    consoleMethod(logString);
  }
}
