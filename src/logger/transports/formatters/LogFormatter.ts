/**
 * @file src/logger/transports/formatters/LogFormatter.ts
 * @description Defines the public contract for log entry formatters.
 */

import { LogEntry } from '../../../types';

/**
 * @interface LogFormatter
 * @description Defines the interface for a log formatter.
 * A formatter is responsible for transforming a standard LogEntry object
 * into a specific structure required by a target destination (e.g., Datadog JSON, Elastic Common Schema).
 */
export interface LogFormatter {
  /**
   * Transforms a LogEntry object into a new object with the desired format.
   * @param {LogEntry} entry - The standard log entry object to be transformed.
   * @returns {Record<string, any>} A new object representing the log in the target format.
   */
  format(entry: LogEntry): Record<string, any>;
}
