/**
 * FILE: src/logger/transports/formatters/LogFormatter.ts
 * DESCRIPTION: Defines the contract for log entry formatters.
 */

import { LogEntry } from '../../../types';

/**
 * Defines the interface for a log formatter.
 * A formatter is responsible for transforming a standard LogEntry object
 * into a specific structure required by a target destination (e.g., Datadog, ECS).
 */
export interface LogFormatter {
  /**
   * Transforms a LogEntry object into a new object with the desired format.
   * @param entry The standard log entry object.
   * @returns A new object representing the log in the target format.
   */
  format(entry: LogEntry): Record<string, any>;
}
