/**
 * FILE: src/logger/transports/PrettyConsoleTransport.ts
 * DESCRIPTION: A transport that formats logs for human readability in a development console, using colors.
 */
import { LogEntry } from '../../types';
import { Transport, TransportOptions } from './Transport';
import { LogLevelName } from '../levels';
import chalk, { type ChalkInstance } from 'chalk'; // Corrected import for chalk v5+

// Define a color map for each log level for easy styling.
// The map excludes 'silent' as it will be handled separately.
const levelColorMap: Record<Exclude<LogLevelName, 'silent'>, ChalkInstance> = {
  fatal: chalk.bgRed.white.bold,
  error: chalk.red.bold,
  warn: chalk.yellow.bold,
  info: chalk.blue.bold,
  debug: chalk.green,
  trace: chalk.gray,
};

/**
 * A transport that writes logs to the console in a human-readable, colorful format.
 * Ideal for use in development environments.
 */
export class PrettyConsoleTransport extends Transport {
  constructor(options?: TransportOptions) {
    super(options);
  }

  /**
   * Logs a structured entry to the console in a pretty format.
   * @param entry The log entry to process.
   */
  public async log(entry: LogEntry): Promise<void> {
    // For 'silent' level, we do nothing.
    if (entry.level === 'silent') {
      return;
    }

    // If a formatter is provided, use it. Otherwise, use the entry as is.
    const finalObject = this.formatter ? this.formatter.format(entry) : entry;
    const { timestamp, level, service, msg, ...rest } = finalObject;

    // Get the color function for the current log level, with a fallback to white.
    const colorizer =
      levelColorMap[level as Exclude<LogLevelName, 'silent'>] || chalk.white;

    // Format the main log line
    const time = chalk.gray(new Date(timestamp).toLocaleTimeString());
    const levelString = colorizer(`[${level.toUpperCase()}]`);
    const serviceString = chalk.cyan(`(${service})`);
    const message = msg;

    let logString = `${time} ${levelString} ${serviceString}: ${message}`;

    // Handle additional metadata, ensuring it's not empty
    const metaKeys = Object.keys(rest);
    if (metaKeys.length > 0) {
      // Use a more subtle color for metadata
      const metaString = chalk.gray(JSON.stringify(rest, null, 2));
      logString += `\n${metaString}`;
    }

    // Use the appropriate console method based on the log level
    const consoleMethod =
      level === 'fatal' || level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : console.log;

    consoleMethod(logString);
  }
}
