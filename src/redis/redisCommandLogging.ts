/**
 * @file src/redis/redisCommandLogging.ts
 * @description Pure functions for building Redis command log payloads.
 * Used by BeaconRedis to keep instrumentation logic testable and SOLID.
 */

import type { JsonValue } from '../internal-types';
import { errorToJsonValue } from '../types';
import type { RedisValue } from '../types';

/** Logging options for a Redis instance (subset used when building log payloads). */
export type RedisLoggingConfig =
  | {
      onSuccess?: 'trace' | 'debug' | 'info';
      onError?: 'warn' | 'error' | 'fatal';
      logCommandValues?: boolean;
      logReturnValue?: boolean;
    }
  | undefined;

const DEFAULT_SUCCESS_LEVEL = 'debug';
const DEFAULT_ERROR_LEVEL = 'error';

/**
 * Returns the log level to use on successful command execution.
 * Guard: undefined config or onSuccess => default.
 * @pure
 */
export function getSuccessLogLevel(
  logging: RedisLoggingConfig
): 'trace' | 'debug' | 'info' {
  if (logging == null || logging.onSuccess == null) {
    return DEFAULT_SUCCESS_LEVEL;
  }
  return logging.onSuccess;
}

/**
 * Returns the log level to use on command failure.
 * Guard: undefined config or onError => default.
 * @pure
 */
export function getErrorLogLevel(
  logging: RedisLoggingConfig
): 'warn' | 'error' | 'fatal' {
  if (logging == null || logging.onError == null) {
    return DEFAULT_ERROR_LEVEL;
  }
  return logging.onError;
}

/**
 * Builds the log payload for a successful Redis command.
 * Guard: only adds params/result when config allows.
 * @pure
 */
export function buildSuccessLogPayload(
  commandName: string,
  instanceName: string,
  durationMs: number,
  params: RedisValue[],
  result: unknown,
  logging: RedisLoggingConfig
): Record<string, JsonValue> {
  const payload: Record<string, JsonValue> = {
    command: commandName,
    instance: instanceName,
    durationMs,
  };
  if (logging?.logCommandValues === true) {
    payload.params = params as JsonValue[];
  }
  if (logging?.logReturnValue === true) {
    payload.result = result as JsonValue;
  }
  return payload;
}

/**
 * Builds the log payload for a failed Redis command.
 * Guard: only adds params when config allows.
 * @pure
 */
export function buildErrorLogPayload(
  commandName: string,
  instanceName: string,
  durationMs: number,
  error: unknown,
  params: RedisValue[],
  logging: RedisLoggingConfig
): Record<string, JsonValue> {
  const payload: Record<string, JsonValue> = {
    command: commandName,
    instance: instanceName,
    durationMs,
    err: errorToJsonValue(error),
  };
  if (logging?.logCommandValues === true) {
    payload.params = params as JsonValue[];
  }
  return payload;
}
