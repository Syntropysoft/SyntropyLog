/**
 * @file src/logger/levels.ts
 * @description Defines the available log levels, their names, and their severity weights.
 */

/**
 * @description A mapping of log level names to their severity weights.
 * Higher numbers indicate higher severity.
 */
export const LOG_LEVEL_WEIGHTS = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
  silent: 0,
} as const;

/**
 * @description An array of the available log level names, derived from the weights object.
 */
export const logLevels = Object.keys(
  LOG_LEVEL_WEIGHTS
) as (keyof typeof LOG_LEVEL_WEIGHTS)[];

/**
 * @description The type representing a valid log level name.
 */
export type LogLevel = keyof typeof LOG_LEVEL_WEIGHTS;
