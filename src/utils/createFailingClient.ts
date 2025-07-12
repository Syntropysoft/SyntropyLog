/**
 * @file src/utils/createFailingClient.ts
 * @description Factory functions for creating "failing" clients.
 * These clients are used as placeholders when the initialization of a real
 * client fails. Instead of the application crashing when getting the
 * client, it will fail in a controlled manner with a clear message upon
 * attempting to use it.
 */

import { IBeaconRedis } from '../redis/IBeaconRedis';
import { ILogger } from '../logger';
import { InstrumentedHttpClient } from '../http/InstrumentedHttpClient';

/**
 * @private
 * Creates a generic proxy object that rejects any method call.
 * @param {ILogger} logger - The logger to use for reporting the failed attempt.
 * @param {string} errorMessage - The error message to throw when a method is called.
 * @param {Record<string, () => any>} [specialHandlers={}] - A map of property names to custom handlers that should not fail.
 * @returns {Proxy} A proxy that will throw an error on property access.
 */
function createFailingProxy(
  logger: ILogger,
  errorMessage: string,
  specialHandlers: Record<string, () => unknown> = {}
) {
  return new Proxy(
    {},
    {
      get(target, prop: string) {
        if (prop in specialHandlers) {
          return specialHandlers[prop];
        }
        // For any other property, return a function that logs and then rejects a promise.
        // This covers method calls like .get(), .post(), .set(), etc.
        return (...args: unknown[]) => {
          logger.warn(
            { errorMessage, arguments: args },
            `Attempted to use property '${prop}' on a failing client.`
          );
          return Promise.reject(new Error(errorMessage));
        };
      },
    }
  );
}

/**
 * Creates a failing placeholder for an `IBeaconRedis` client.
 * @param {string} instanceName - The name of the Redis instance that failed to initialize.
 * @param {Error} initializationError - The original error that caused the initialization to fail.
 * @param {ILogger} logger - The logger instance.
 * @returns {IBeaconRedis} An `IBeaconRedis` compliant object that will fail on every command.
 */
export function createFailingRedisClient(
  instanceName: string,
  initializationError: Error,
  logger: ILogger
): IBeaconRedis {
  const errorMessage = `The Redis client "${instanceName}" could not be initialized. Reason: ${initializationError.message}. Check the configuration and startup logs.`;
  const specialHandlers = {
    getInstanceName: () => instanceName,
    // Methods that do not return promises, like `multi`, might need special handling,
    // but for most cases, throwing an error is sufficient.
    multi: () => {
      logger.warn(
        { errorMessage },
        `Attempted to use method 'multi()' on a failing Redis client.`
      );
      throw new Error(errorMessage);
    },
  };
  return createFailingProxy(
    logger,
    errorMessage,
    specialHandlers
  ) as IBeaconRedis;
}

/**
 * Creates a failing placeholder for an `InstrumentedHttpClient`.
 * @param {string} instanceName - The name of the HTTP client instance that failed.
 * @param {string} type - The type of the HTTP client (e.g., 'AxiosAdapter').
 * @param {ILogger} logger - The logger instance.
 * @returns {InstrumentedHttpClient} A client object that will fail on every method call.
 */
export function createFailingHttpClient(
  instanceName: string,
  type: string,
  logger: ILogger
): InstrumentedHttpClient {
  const errorMessage = `The HTTP client "${instanceName}" (type: ${type}) could not be initialized. Check the configuration and startup logs.`;
  // We cast to InstrumentedHttpClient to satisfy the HttpManager's type requirements.
  // The proxy will intercept any method call, including 'request'.
  return createFailingProxy(logger, errorMessage) as InstrumentedHttpClient;
}
