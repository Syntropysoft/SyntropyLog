/**
 * FILE: src/utils/createFailingClient.ts
 * DESCRIPTION: Factory functions for creating "failing" clients.
 * These clients are used as placeholders when the initialization of a real
 * client fails. Instead of the application crashing when getting the
 * client, it will fail in a controlled manner with a clear message upon
 * attempting to use it.
 */

import { IBeaconRedis } from '../redis/IBeaconRedis';
import { ILogger } from '../logger';

/**
 * Creates a generic proxy object that rejects any method call.
 * @param logger The logger to use for reporting the failed attempt.
 * @param errorMessage The error message to throw when a method is called.
 * @param [specialHandlers={}] A map of property names to custom handlers that should not fail.
 * @returns A proxy that will throw an error on property access.
 */
function createFailingProxy(
  logger: ILogger,
  errorMessage: string,
  specialHandlers: Record<string, () => any> = {}
) {
  return new Proxy({}, {
    get(target, prop: string) {
      if (prop in specialHandlers) {
        return specialHandlers[prop];
      }
      // For any other property, return a function that logs and then rejects a promise.
      // This covers method calls like .get(), .post(), .set(), etc.
      return (...args: any[]) => {
        logger.debug(
          `Intento de uso de la propiedad '${prop}' en un cliente fallido.`,
          { errorMessage, arguments: args }
        );
        return Promise.reject(new Error(errorMessage));
      };
    }
  });
}

/**
 * Creates a failing placeholder for an `IBeaconRedis` client.
 * @param instanceName The name of the Redis instance that failed to initialize.
 * @param logger The logger instance.
 * @returns An `IBeaconRedis` compliant object that will fail on every command.
 */
export function createFailingRedisClient(instanceName: string, logger: ILogger): IBeaconRedis {
  const errorMessage = `The Redis client "${instanceName}" could not be initialized. Check the configuration and startup logs.`;
  const specialHandlers = {
    getInstanceName: () => instanceName,
    // Methods that do not return promises, like `multi`, might need special handling,
    // but for most cases, throwing an error is sufficient.
    multi: () => {
      logger.debug(`Attempted to use method 'multi()' on a failing Redis client.`, { errorMessage });
      throw new Error(errorMessage);
    }
  };
  return createFailingProxy(logger, errorMessage, specialHandlers) as IBeaconRedis;
}

/**
 * Creates a failing placeholder for an HTTP client.
 * @param instanceName The name of the HTTP client instance that failed.
 * @param type The type of the HTTP client (e.g., 'axios', 'fetch').
 * @param logger The logger instance.
 * @returns A client object that will fail on every method call.
 */
export function createFailingHttpClient(
  instanceName: string,
  type: string,
  logger: ILogger
): any {
  const errorMessage = `The HTTP client "${instanceName}" (type: ${type}) could not be initialized. Check the configuration and startup logs.`;
  return createFailingProxy(logger, errorMessage);
}