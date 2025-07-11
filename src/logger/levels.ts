/**
 * @file src/logger/levels.ts
 * @description Defines the standard log levels, their names, and their numeric severity values.
 */

/**
 * @constant logLevels
 * @description Defines the numeric severity of log levels, based on the Pino logging library standard.
 * Higher numbers indicate higher severity.
 */
export const logLevels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  /**
   * 'silent' is a special level used to disable logging. When a logger's level is set
   * to 'silent', no logs will be processed. Its value is set to Infinity to ensure
   * it is always the highest severity, meaning no log message can meet its threshold.
   */
  silent: Infinity,
} as const;

/**
 * @type LogLevelName
 * @description Represents the string name of a log level (e.g., 'info', 'warn', 'error').
 */
export type LogLevelName = keyof typeof logLevels;

/**
 * @type LogLevel
 * @description Represents the numeric value of a log level (e.g., 30, 40, 50).
 */
export type LogLevel = (typeof logLevels)[LogLevelName];