/**
 * @file src/logger/transports/ConsoleTransport.ts
 * @description A transport that writes logs to the console as JSON strings.
 */
import { LogEntry } from '../../types';
import { Transport, TransportOptions } from './Transport';

/**
 * @class ConsoleTransport
 * @description A transport that writes logs to the console as a single, serialized JSON string.
 * This format is ideal for log aggregation systems that can parse JSON.
 * @extends {Transport}
 */
export class ConsoleTransport extends Transport {
  /**
   * @constructor
   * @param {TransportOptions} [options] - Options for the transport, including level, formatter, and a sanitization engine.
   */
  constructor(options?: TransportOptions) {
    super(options);
  }

  /**
   * Logs a structured entry to the console as a single JSON string.
   * The entry is first formatted (if a formatter is provided) and then sanitized
   * before being written to the console.
   * @param {LogEntry} entry - The log entry to process.
   * @returns {Promise<void>}
   */
  public async log(entry: LogEntry): Promise<void> {
    if (!this.isLevelEnabled(entry.level)) {
      return;
    }
    const finalObject = this.formatter ? this.formatter.format(entry) : entry;
    const logString = JSON.stringify(finalObject);

    switch (entry.level) {
      case 'fatal':
      case 'error':
        console.error(logString);
        break;
      case 'warn':
        console.warn(logString);
        break;
      default:
        console.log(logString);
        break;
    }
  }
}
