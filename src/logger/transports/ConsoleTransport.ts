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
   * Accepts either a LogEntry object (formatted and stringified here) or a pre-serialized string (ruta nativa).
   * @param entry - Log entry object or pre-serialized JSON string.
   */
  public log(entry: LogEntry | string): void {
    const logString =
      typeof entry === 'string'
        ? entry
        : (() => {
            if (!this.isLevelEnabled(entry.level)) return '';
            const finalObject = this.formatter
              ? this.formatter.format(entry)
              : entry;
            return JSON.stringify(finalObject);
          })();
    if (logString === '') return;

    const level = typeof entry === 'string' ? 'info' : entry.level;
    switch (level) {
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
