import { Logger, LoggerOptions } from './Logger';
import { ILogger } from './ILogger';
import { IContextManager } from '../context/IContextManager';
import { ContextManager } from '../context/ContextManager';
import { LogLevelName } from './levels';
import { Transport } from './transports/Transport';
import { ConsoleTransport } from './transports/ConsoleTransport';
import { BeaconLogConfig } from '../config';
import { SerializerRegistry } from '../serialization/SerializerRegistry';
import { MaskingEngine } from '../masking/MaskingEngine';

/**
 * Manages the lifecycle and configuration of all logging components.
 * An instance of this factory is created by `beaconLog.init()` and acts as the
 * central orchestrator, ensuring all created loggers share the same configuration
 * context (transports, serializers, masking rules, etc.).
 */
export class LoggerFactory {
  private readonly contextManager: IContextManager;
  private readonly transports: Transport[];
  private readonly globalLogLevel: LogLevelName;
  private readonly serviceName: string;
  private readonly serializerRegistry: SerializerRegistry;
  private readonly maskingEngine: MaskingEngine;

  private readonly loggerPool: Map<string, ILogger> = new Map();

  /**
   * Constructs the central logger factory/orchestrator.
   * @param config - The full, validated BeaconLog configuration object from init().
   */
  constructor(config: BeaconLogConfig) {
    // Initialize all shared services from the configuration
    this.contextManager = new ContextManager();
    // This would be the place to configure the ContextManager if needed
    // if (config.context?.correlationIdHeader) {
    //   this.contextManager.configure(config.context.correlationIdHeader);
    // }

    this.transports = config.logger?.transports ?? [new ConsoleTransport()];
    this.globalLogLevel = config.logger?.level ?? 'info';
    this.serviceName = config.logger?.serviceName ?? 'unknown-service';

    // Instantiate the processing engines with the user's configuration
    this.serializerRegistry = new SerializerRegistry({
      serializers: config.logger?.serializers,
      timeoutMs: config.logger?.serializerTimeoutMs,
    });
    this.maskingEngine = new MaskingEngine(config.masking);
  }

  /**
   * Retrieves a singleton logger instance by name.
   * If the logger doesn't exist, it creates a new one, injecting all the
   * shared framework components (context manager, transports, engines).
   * @param name - The name for the logger, typically a module or service name.
   * @returns An ILogger instance.
   */
  public getLogger(name = 'default'): ILogger {
    if (!this.loggerPool.has(name)) {
      const loggerOptions: LoggerOptions = {
        contextManager: this.contextManager,
        transports: this.transports,
        level: this.globalLogLevel,
        serviceName: name === 'default' ? this.serviceName : name,
        // Inject the shared engines into the new logger instance
        serializerRegistry: this.serializerRegistry,
        maskingEngine: this.maskingEngine,
      };

      const logger = new Logger(loggerOptions);
      this.loggerPool.set(name, logger);
    }
    return this.loggerPool.get(name)!;
  }

  /**
   * Gracefully flushes all configured transports to ensure buffered logs are sent.
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
