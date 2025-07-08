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
 * Manages the lifecycle and configuration of all logging components.
 * An instance of this factory is created by `syntropyLog.init()` and acts as the
 * central orchestrator.
 */
export class LoggerFactory {
  private readonly contextManager: IContextManager;
  private readonly transports: Transport[];
  private readonly globalLogLevel: LogLevelName;
  private readonly serviceName: string;
  private readonly serializerRegistry: SerializerRegistry;
  private readonly maskingEngine: MaskingEngine;
  private readonly sanitizationEngine: SanitizationEngine; // Added property

  private readonly loggerPool: Map<string, ILogger> = new Map();

  constructor(config: SyntropyLogConfig) {
    this.contextManager = new ContextManager();
    if (config.context?.correlationIdHeader) {
      this.contextManager.configure(config.context.correlationIdHeader);
    }

    this.transports = config.logger?.transports ?? [new ConsoleTransport()];
    this.globalLogLevel = config.logger?.level ?? 'info';
    this.serviceName = config.logger?.serviceName ?? 'unknown-service';

    this.serializerRegistry = new SerializerRegistry({
      serializers: config.logger?.serializers,
      timeoutMs: config.logger?.serializerTimeoutMs,
    });
    this.maskingEngine = new MaskingEngine(config.masking);
    // Instantiate the new engine
    this.sanitizationEngine = new SanitizationEngine();
  }

  public getLogger(name = 'default'): ILogger {
    if (!this.loggerPool.has(name)) {
      const loggerOptions: LoggerOptions = {
        contextManager: this.contextManager,
        transports: this.transports,
        level: this.globalLogLevel,
        serviceName: name === 'default' ? this.serviceName : name,
        serializerRegistry: this.serializerRegistry,
        maskingEngine: this.maskingEngine,
        sanitizationEngine: this.sanitizationEngine, // Inject the engine
      };

      const logger = new Logger(loggerOptions);
      this.loggerPool.set(name, logger);
    }
    return this.loggerPool.get(name)!;
  }

  public getContextManager(): IContextManager {
    return this.contextManager;
  }

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
