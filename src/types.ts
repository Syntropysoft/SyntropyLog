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

import type { LogLevel } from './logger/levels';

export type LogEntry = {
  /** The severity level of the log. */
  level: LogLevel;
  /** The main log message, formatted from the arguments. */
  message: string;
  /** The ISO 8601 timestamp of when the log was created. */
  timestamp: string;
  /** Any other properties are treated as structured metadata. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export type LoggerOptions = {
  level?: LogLevel;
  serviceName?: string;
  transports?: any[]; // Will be properly typed in the logger implementation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bindings?: Record<string, any>;
};

// Re-export LogLevel for external use
export type { LogLevel } from './logger/levels';

// ILogger is now defined in its own file: ./logger/ILogger.ts
