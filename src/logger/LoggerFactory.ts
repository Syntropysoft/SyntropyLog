import { Logger, LoggerOptions } from './Logger';
import { ILogger } from './ILogger';
import { IContextManager } from '../context/IContextManager';
import { ContextManager } from '../context/ContextManager';
import { LogLevelName } from './levels';
import { Transport } from './transports/Transport';
import { ConsoleTransport } from './transports/ConsoleTransport';
import { SyntropyLogConfig } from '../config';
import { SerializerRegistry } from '../serialization/SerializerRegistry';
import { MaskingEngine } from '../masking/MaskingEngine';
import { SanitizationEngine } from '../sanitization/SanitizationEngine';

/**
 * @class LoggerFactory
 * @description Manages the lifecycle and configuration of all logging components.
 * An instance of this factory is created by `syntropyLog.init()` and acts as the central
 * orchestrator for creating and managing logger instances and their dependencies.
 */
export class LoggerFactory {
  /** @private The manager for handling asynchronous contexts. */
  private readonly contextManager: IContextManager;
  /** @private The array of transports to which logs will be dispatched. */
  private readonly transports: Transport[];
  /** @private The global minimum log level for all created loggers. */
  private readonly globalLogLevel: LogLevelName;
  /** @private The global service name, used as a default for loggers. */
  private readonly serviceName: string;
  /** @private The engine responsible for serializing complex objects. */
  private readonly serializerRegistry: SerializerRegistry;
  /** @private The engine responsible for masking sensitive data. */
  private readonly maskingEngine: MaskingEngine;

  /** @private A pool to cache logger instances by name for performance. */
  private readonly loggerPool: Map<string, ILogger> = new Map();

  /**
   * @constructor
   * @param {SyntropyLogConfig} config - The global configuration object.
   * @description Initializes all core logging engines and orchestrates transport setup.
   * It follows a key principle for transport configuration:
   * - **If `config.logger.transports` is provided:** The factory trusts the user's
   *   configuration completely and uses the provided transports as-is. It is the user's
   *   responsibility to configure them correctly (e.g., adding sanitization).
   * - **If no transports are provided:** The factory creates a single, production-safe
   *   `ConsoleTransport` by default, which includes a built-in `SanitizationEngine`.
   */
  constructor(config: SyntropyLogConfig) {
    this.contextManager = new ContextManager();
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

    // If the user provides a specific list of transports, we use them directly.
    // We trust the user to have configured them correctly (e.g., providing a
    // SanitizationEngine to their production transports).
    if (config.logger?.transports) {
      this.transports = config.logger.transports;
    } else {
      // If no transports are provided, we create a safe, default production transport.
      // This transport includes a default sanitization engine.
      const sanitizationEngine = new SanitizationEngine();
      this.transports = [new ConsoleTransport({ sanitizationEngine })];
    }
    this.globalLogLevel = config.logger?.level ?? 'info';
    this.serviceName = config.logger?.serviceName ?? 'unknown-service';

    this.serializerRegistry = new SerializerRegistry({
      serializers: config.logger?.serializers,
      timeoutMs: config.logger?.serializerTimeoutMs,
    });
    this.maskingEngine = new MaskingEngine(config.masking);
  }

  /**
   * Retrieves a logger instance by name. If the logger does not exist, it is created
   * and cached for subsequent calls.
   * @param {string} [name='default'] - The name of the logger to retrieve.
   * @returns {ILogger} The logger instance.
   */
  public getLogger(name = 'default'): ILogger {
    if (!this.loggerPool.has(name)) {
      const loggerOptions: LoggerOptions = {
        contextManager: this.contextManager,
        transports: this.transports,
        level: this.globalLogLevel,
        serviceName: name === 'default' ? this.serviceName : name,
        serializerRegistry: this.serializerRegistry,
        maskingEngine: this.maskingEngine,
      };

      const logger = new Logger(loggerOptions);
      this.loggerPool.set(name, logger);
    }
    return this.loggerPool.get(name)!;
  }

  /**
   * Returns the context manager instance.
   * @returns {IContextManager} The context manager.
   */
  public getContextManager(): IContextManager {
    return this.contextManager;
  }

  /**
   * Calls the `flush` method on all configured transports to ensure buffered
   * logs are written before the application exits.
   */
  public async flushAllTransports(): Promise<void> {
    const flushPromises = this.transports.map((transport) =>
      transport.flush().catch((err) => {
        console.error(
          `Error flushing transport ${transport.constructor.name}:`,
          err
        );
      })
    );
    await Promise.allSettled(flushPromises);
  }
}
