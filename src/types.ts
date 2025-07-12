/**
 * Represents any value that can be safely serialized to JSON.
 * This is a recursive type used to ensure type safety for log metadata.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

import { LogLevelName } from './logger/levels';

/**
 * Represents a single, structured log entry.
 * This is the canonical object that gets passed to all transports.
 */
export interface LogEntry {
  /** The severity level of the log. */
  level: LogLevelName;
  /** The main log message, formatted from the arguments. */
  msg: string;
  /** The ISO 8601 timestamp of when the log was created. */
  timestamp: string;
  /** The name of the service generating the log. */
  service: string;
  /** Any other properties are treated as structured metadata. */
  [key: string]: unknown;
}
