/**
 * Defines the numeric severity of log levels.
 * Lower numbers are higher priority.
 */
// Values are based on the Pino logging library standard. Higher is more severe.
export const logLevels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 70,
} as const;

/**
 * Represents the string name of a log level.
 * e.g., 'info', 'warn', 'error'.
 */
export type LogLevelName = keyof typeof logLevels;

/**
 * Represents the numeric value of a log level.
 * e.g., 0, 1, 2.
 */
export type LogLevel = (typeof logLevels)[LogLevelName];