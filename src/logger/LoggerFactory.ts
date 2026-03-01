import { SyntropyLog } from '../SyntropyLog';
import { SyntropyLogConfig } from '../config';
import { Logger, LoggerDependencies } from './Logger';
import { ILogger } from './ILogger';
import { IContextManager } from '../context/IContextManager';
import { MaskingEngine } from '../masking/MaskingEngine';
import { SerializationManager } from '../serialization/SerializationManager';
import { SerializationComplexity } from '../serialization/types';
import { Transport } from './transports/Transport';
import { ConsoleTransport } from './transports/ConsoleTransport';
import { LogLevel } from './levels';
import { SanitizationEngine } from '../sanitization/SanitizationEngine';
import { JsonValue } from '../types';

/**
 * @class LoggerFactory
 * @description Manages the lifecycle and configuration of all logging components.
 * An instance of this factory is created by `syntropyLog.init()` and acts as the central
 * orchestrator for creating and managing logger instances and their dependencies.
 */
export class LoggerFactory {
  /** @private The manager for handling asynchronous contexts. */
  private readonly contextManager: IContextManager;
  /** @private The main framework instance, used as a mediator. */
  private readonly syntropyLogInstance: SyntropyLog;
  /** @private A mapping of category names to their respective transports. */
  private readonly transports: Record<string, Transport[]>;
  /** @private The global minimum log level for all created loggers. */
  private readonly globalLogLevel: LogLevel;
  /** @private The global service name, used as a default for loggers. */
  private readonly serviceName: string;
  /** @private The engine responsible for serializing complex objects. */
  private readonly serializationManager: SerializationManager;
  /** @private The engine responsible for masking sensitive data. */
  private readonly maskingEngine: MaskingEngine;

  /** @private A pool to cache logger instances by name for performance. */
  private readonly loggerPool: Map<string, ILogger> = new Map();

  /**
   * @constructor
   * @param {SyntropyLogConfig} config - The global configuration object.
   * @param {IContextManager} contextManager - The shared context manager instance.
   * @param {SyntropyLog} syntropyLogInstance - The main framework instance for mediation.
   * @description Initializes all core logging engines and orchestrates transport setup.
   * It follows a key principle for transport configuration:
   * - **If `config.logger.transports` is provided:** The factory trusts the user's
   *   configuration completely and uses the provided transports as-is. It is the user's
   *   responsibility to configure them correctly (e.g., adding sanitization).
   * - **If no transports are provided:** The factory creates a single, production-safe
   *   `ConsoleTransport` by default, which includes a built-in `SanitizationEngine`.
   */
  constructor(
    config: SyntropyLogConfig,
    contextManager: IContextManager,
    syntropyLogInstance: SyntropyLog
  ) {
    this.contextManager = contextManager;
    this.syntropyLogInstance = syntropyLogInstance;

    // Configure the context manager by passing the entire context config object.
    if (config.context) {
      this.contextManager.configure(config.context);
    }

    // Configure the HTTP manager if http instances are provided
    if (config.http?.instances) {
      // This block is not provided in the original file, so it's commented out.
      // If it were uncommented, it would likely involve configuring the HTTP manager
      // with the provided instances.
    }

    // If the user provides a specific list of transports, we use them.
    // They can be a single array (default) or a record of categories.
    if (config.logger?.transports) {
      if (Array.isArray(config.logger.transports)) {
        this.transports = { default: config.logger.transports };
      } else {
        this.transports = config.logger.transports as Record<
          string,
          Transport[]
        >;
      }
    } else {
      // If no transports are provided, we create a safe, default production transport.
      // This transport includes a default sanitization engine.
      const sanitizationEngine = new SanitizationEngine();
      this.transports = {
        default: [new ConsoleTransport({ sanitizationEngine })],
      };
    }
    this.globalLogLevel = config.logger?.level ?? 'info';
    this.serviceName = config.logger?.serviceName ?? 'unknown-service';

    this.serializationManager = new SerializationManager({
      timeoutMs: config.logger?.serializerTimeoutMs,
      sanitizeSensitiveData: config.masking?.enableDefaultRules !== false,
    });
    this.maskingEngine = new MaskingEngine({
      rules: config.masking?.rules,
      maskChar: config.masking?.maskChar,
      preserveLength: config.masking?.preserveLength,
      enableDefaultRules: config.masking?.enableDefaultRules !== false,
    });
  }

  /**
   * Retrieves a logger instance by name. If the logger does not exist, it is created
   * and cached for subsequent calls.
   * @param {string} [name='default'] - The name of the logger to retrieve.
   * @param {Record<string, JsonValue>} [bindings] - Optional bindings to apply to the logger.
   * @returns {ILogger} The logger instance.
   */
  public getLogger(
    name = 'default',
    bindings?: Record<string, JsonValue>
  ): ILogger {
    // Create a stable cache key that doesn't depend on object reference
    const cacheKey = this.createCacheKey(name, bindings);

    if (this.loggerPool.has(cacheKey)) {
      return this.loggerPool.get(cacheKey) as ILogger;
    }

    const loggerName = name === 'default' ? this.serviceName : name;

    const dependencies: LoggerDependencies = {
      contextManager: this.contextManager,
      serializationManager: this.serializationManager,
      maskingEngine: this.maskingEngine,
      syntropyLogInstance: this.syntropyLogInstance,
    };

    // Retrieve transports for this specific logger name, or fall back to 'default'
    const transports = this.transports[name] ?? this.transports.default;

    const logger = new Logger(loggerName, transports, dependencies, {
      bindings,
    });
    logger.level = this.globalLogLevel;

    this.loggerPool.set(cacheKey, logger);
    return logger;
  }

  /**
   * Creates a stable cache key for logger instances.
   * @private
   */
  private createCacheKey(
    name: string,
    bindings?: Record<string, JsonValue>
  ): string {
    if (!bindings || Object.keys(bindings).length === 0) {
      return name;
    }

    // Sort keys to ensure consistent cache keys regardless of property order
    const sortedBindings = Object.keys(bindings)
      .sort()
      .reduce(
        (result, key) => {
          result[key] = bindings[key];
          return result;
        },
        {} as Record<string, JsonValue>
      );

    try {
      return `${name}:${JSON.stringify(sortedBindings)}`;
    } catch {
      // Fallback for non-serializable objects
      return `${name}:${Object.keys(sortedBindings).sort().join(',')}`;
    }
  }

  /**
   * Calls the `flush` method on all configured transports to ensure buffered
   * logs are written before the application exits.
   */
  public async flushAllTransports(): Promise<void> {
    const allTransports = Object.values(this.transports).flat();
    const uniqueTransports = Array.from(new Set(allTransports));

    const flushPromises = uniqueTransports.map((transport) =>
      transport.flush().catch((err) => {
        console.error(
          `Error flushing transport ${transport.constructor.name}:`,
          err
        );
      })
    );
    await Promise.allSettled(flushPromises);
  }

  /**
   * Shuts down the logger factory and all its transports.
   * This ensures that all buffered logs are written and resources are cleaned up.
   */
  public async shutdown(): Promise<void> {
    try {
      // Flush all transports first
      await this.flushAllTransports();

      // Clear the logger pool
      this.loggerPool.clear();

      // Shutdown all transports if they have a shutdown method
      const allTransports = Object.values(this.transports).flat();
      const uniqueTransports = Array.from(new Set(allTransports));

      const shutdownPromises = uniqueTransports.map((transport) => {
        if (
          typeof (transport as { shutdown?: () => Promise<void> }).shutdown ===
          'function'
        ) {
          return (transport as unknown as { shutdown: () => Promise<void> })
            .shutdown()
            .catch((err: unknown) => {
              console.error(
                `Error shutting down transport ${transport.constructor.name}:`,
                err
              );
            });
        }
        return Promise.resolve();
      });

      await Promise.allSettled(shutdownPromises);
    } catch (error) {
      console.error('Error during LoggerFactory shutdown:', error);
    }
  }
}
