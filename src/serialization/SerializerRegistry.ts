/**
 * FILE: src/serialization/SerializerRegistry.ts
 * DESCRIPTION: Manages and safely applies custom log object serializers.
 */

import { ILogger } from '../logger/ILogger';

// A map where the key is the field name to look for in a log object,
// and the value is the function that will transform it.
type SerializerMap = Record<string, (value: any) => string>;

/**
 * Defines the configuration for the SerializerRegistry.
 */
export interface SerializerRegistryOptions {
  /** A map of custom serializer functions provided by the user. */
  serializers?: SerializerMap;
  /** The maximum time in milliseconds a serializer can run before being timed out. */
  timeoutMs?: number;
}

/**
 * Manages and applies custom serializer functions to log metadata.
 * It ensures that serializers are executed safely, with timeouts and error handling,
 * to prevent them from destabilizing the logging pipeline.
 */
export class SerializerRegistry {
  private readonly serializers: SerializerMap;
  private readonly timeoutMs: number;

  constructor(options?: SerializerRegistryOptions) {
    this.serializers = options?.serializers || {};
    this.timeoutMs = options?.timeoutMs || 50; // Default to a 50ms timeout

    // Add a default, built-in serializer for Error objects.
    if (!this.serializers['err']) {
      this.serializers['err'] = (err: any): string => {
        if (!(err instanceof Error)) {
          return JSON.stringify(err);
        }
        return JSON.stringify(
          {
            ...err,
            name: err.name,
            message: err.message,
            stack: err.stack,
          },
          null,
          2
        );
      };
    }
  }

  /**
   * Processes a metadata object, applying any matching serializers.
   * @param meta The metadata object from a log call.
   * @param logger A logger instance to report errors from the serialization process itself.
   * @returns A new metadata object with serialized values.
   */
  public async process(
    meta: Record<string, any>,
    logger: ILogger
  ): Promise<Record<string, any>> {
    const processedMeta = { ...meta };

    for (const key in processedMeta) {
      if (Object.prototype.hasOwnProperty.call(this.serializers, key)) {
        const serializerFn = this.serializers[key];
        const valueToSerialize = processedMeta[key];

        try {
          // Execute the serializer within the secure executor
          const serializedValue = await this.secureExecute(
            serializerFn,
            valueToSerialize
          );
          processedMeta[key] = serializedValue;
        } catch (error) {
          logger.warn(
            `Custom serializer for key "${key}" failed or timed out.`,
            { error: error instanceof Error ? error.message : String(error) }
          );
          processedMeta[key] =
            `[SERIALIZER_ERROR: Failed to process key '${key}']`;
        }
      }
    }

    return processedMeta;
  }

  /**
   * Safely executes a serializer function with a timeout.
   * @param serializerFn The serializer function to execute.
   * @param value The value to pass to the function.
   * @returns A promise that resolves with the serialized string.
   * @throws If the serializer throws an error or times out.
   */
  private secureExecute(
    serializerFn: (value: any) => string,
    value: any
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`Serializer function timed out after ${this.timeoutMs}ms.`)
        );
      }, this.timeoutMs);

      try {
        // We use Promise.resolve() to handle both sync and async serializers.
        Promise.resolve(serializerFn(value))
          .then((result) => {
            clearTimeout(timer);
            resolve(result);
          })
          .catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }
}
