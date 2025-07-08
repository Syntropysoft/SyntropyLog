/**
 * FILE: src/logger/transports/ClassicConsoleTransport.ts
 * DESCRIPTION: A transport that formats logs in a classic, single-line, text-based format, similar to Log4j.
 */
import { LogEntry } from '../../types';
import { Transport, TransportOptions } from './Transport';
import { LogLevelName } from '../levels';
import { Chalk, type ChalkInstance } from 'chalk';

// Instantiate Chalk directly
const chalk = new Chalk();

// Define a color map for each log level for easy styling.
const levelColorMap: Record<Exclude<LogLevelName, 'silent'>, ChalkInstance> = {
  fatal: chalk.bgRed.white.bold,
  error: chalk.red.bold,
  warn: chalk.yellow.bold,
  info: chalk.green, // Using green for info in this style
  debug: chalk.blue,
  trace: chalk.gray,
};

/**
 * A transport that writes logs to the console in a classic single-line format,
 * reminiscent of traditional Java logging frameworks.
 */
export class ClassicConsoleTransport extends Transport {
  constructor(options?: TransportOptions) {
    super(options);
  }

  /**
   * Formats a date object into a 'YYYY-MM-DD HH:mm:ss' string.
   */
  private formatTimestamp(ts: string): string {
    const date = new Date(ts);
    const YYYY = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const DD = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
  }

  /**
   * Logs a structured entry to the console in a classic, single-line format.
   * @param entry The log entry to process.
   */
  public async log(entry: LogEntry): Promise<void> {
    if (entry.level === 'silent') {
      return;
    }

    const finalObject = this.formatter ? this.formatter.format(entry) : entry;
    const { timestamp, level, service, msg, context, ...rest } = finalObject;

    const colorizer =
      levelColorMap[level as Exclude<LogLevelName, 'silent'>] || chalk.white;

    // 1. Timestamp
    const timeStr = this.formatTimestamp(timestamp);

    // 2. Level (padded to a fixed width for alignment)
    const levelStr = colorizer(level.toUpperCase().padEnd(5));

    // 3. Service Name
    const serviceStr = chalk.magenta(`[${service}]`);

    // 4. Metadata (Context + Rest)
    const allMeta = { ...context, ...rest };
    const metaKeys = Object.keys(allMeta);
    let metaStr = '';
    if (metaKeys.length > 0) {
      metaStr = chalk.dim(
        '[' +
          metaKeys
            .map((key) => `${key}=${JSON.stringify(allMeta[key])}`)
            .join(' ') +
          ']'
      );
    }

    // 5. Message
    const message = msg;

    // Assemble the final string
    const logString = `${timeStr} ${levelStr} ${serviceStr} ${metaStr} :: ${message}`;

    const consoleMethod =
      level === 'fatal' || level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log;

    consoleMethod(logString);
  }
}
