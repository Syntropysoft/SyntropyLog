import { SyntropyLog } from '../SyntropyLog';
import { SyntropyLogConfig } from '../config';
import { Logger, LoggerDependencies } from './Logger';
import { ILogger } from './ILogger';
import { IContextManager } from '../context/IContextManager';
import { MaskingEngine } from '../masking/MaskingEngine';
import { SerializationManager } from '../serialization/SerializationManager';
import { Transport } from './transports/Transport';
import { ConsoleTransport } from './transports/ConsoleTransport';
import { LogLevel } from './levels';
import { SanitizationEngine } from '../sanitization/SanitizationEngine';
import { JsonValue } from '../types';

/** Transport or descriptor with optional env filter for conditional enabling. */
type TransportEntry =
  | Transport
  | { transport: Transport; env?: string | string[] };

/** Pure: same entries + currentEnv → same result; no I/O or mutation. */
function resolveTransportsForEnv(
  entries: TransportEntry[],
  currentEnv: string
): Transport[] {
  const result: Transport[] = [];
  for (const entry of entries) {
    if (entry instanceof Transport) {
      result.push(entry);
    } else if (entry && typeof entry === 'object' && 'transport' in entry) {
      const envList =
        entry.env == null
          ? null
          : Array.isArray(entry.env)
            ? entry.env
            : [entry.env];
      if (envList === null || envList.includes(currentEnv)) {
        result.push(entry.transport);
      }
    } else if (entry && typeof entry === 'object') {
      result.push(entry as Transport);
    }
  }
  return result;
}

// Pure function: Resolve transports based on configuration
export const resolveTransports = (
  config: SyntropyLogConfig
): {
  transports: Record<string, Transport[]>;
  transportPool: Map<string, Transport>;
} => {
  const currentEnv = config.logger?.environment ?? 'development';

  const hasTransportList =
    config.logger?.transportList &&
    Object.keys(config.logger.transportList).length > 0;
  const hasEnv =
    config.logger?.env && Object.keys(config.logger.env).length > 0;

  if (
    hasTransportList &&
    hasEnv &&
    config.logger?.transportList &&
    config.logger?.env
  ) {
    const pool = new Map<string, Transport>(
      Object.entries(config.logger.transportList)
    );
    const defaultNames = config.logger.env[currentEnv] ?? [];
    const defaultTransports = defaultNames
      .map((name) => pool.get(name))
      .filter((t): t is Transport => t != null);
    return {
      transports: { default: defaultTransports },
      transportPool: pool,
    };
  } else if (config.logger?.transports) {
    const raw = config.logger.transports;
    const pool = new Map<string, Transport>();

    const collectTransport = (entry: TransportEntry): Transport => {
      const t: Transport =
        entry instanceof Transport
          ? entry
          : entry && typeof entry === 'object' && 'transport' in entry
            ? (entry as { transport: Transport }).transport
            : (entry as Transport);
      const name =
        t.name ??
        (t as { constructor?: { name?: string } }).constructor?.name ??
        `transport-${pool.size}`;
      pool.set(name, t);
      return t;
    };

    let transports: Record<string, Transport[]>;

    if (Array.isArray(raw)) {
      raw.forEach(collectTransport);
      transports = {
        default: resolveTransportsForEnv(raw, currentEnv),
      };
    } else {
      const record = raw as Record<string, TransportEntry[]>;
      transports = {} as Record<string, Transport[]>;
      for (const [key, arr] of Object.entries(record)) {
        arr.forEach(collectTransport);
        transports[key] = resolveTransportsForEnv(arr, currentEnv);
      }
    }
    return { transports, transportPool: pool };
  } else {
    const sanitizationEngine = new SanitizationEngine();
    const defaultTransport = new ConsoleTransport({
      sanitizationEngine,
      name: 'console',
    });
    return {
      transports: { default: [defaultTransport] },
      transportPool: new Map([['console', defaultTransport]]),
    };
  }
};

// Pure function: Create stable cache key
export const createCacheKey = (
  name: string,
  bindings?: Record<string, JsonValue>
): string => {
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
};

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
  /** @private A mapping of category names to their respective transports (default set per env). */
  private readonly transports: Record<string, Transport[]>;
  /** @private Pool of all configured transports by name, for override/add/remove per call. */
  private readonly transportPool: Map<string, Transport>;
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
  /** @private Maximum size of the logger pool to prevent memory leaks. */
  private readonly MAX_POOL_SIZE = 1000;

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

    const resolved = resolveTransports(config);
    this.transports = resolved.transports;
    this.transportPool = resolved.transportPool;

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
      regexTimeoutMs: config.masking?.regexTimeoutMs,
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
    const cacheKey = createCacheKey(name, bindings);

    if (this.loggerPool.has(cacheKey)) {
      // LRU Strategy: Move accessed item to the end of the Map (most recently used)
      const cachedLogger = this.loggerPool.get(cacheKey) as ILogger;
      this.loggerPool.delete(cacheKey);
      this.loggerPool.set(cacheKey, cachedLogger);
      return cachedLogger;
    }

    const loggerName = name === 'default' ? this.serviceName : name;

    const dependencies: LoggerDependencies = {
      contextManager: this.contextManager,
      serializationManager: this.serializationManager,
      maskingEngine: this.maskingEngine,
      syntropyLogInstance: this.syntropyLogInstance,
      transportPool: this.transportPool,
    };

    // Retrieve transports for this specific logger name, or fall back to 'default'
    const transports = this.transports[name] ?? this.transports.default;

    const logger = new Logger(loggerName, transports, dependencies, {
      bindings,
    });
    logger.level = this.globalLogLevel;

    // Enforce Max Pool Size (LRU eviction for oldest items)
    if (this.loggerPool.size >= this.MAX_POOL_SIZE) {
      const oldestKey = this.loggerPool.keys().next().value;
      if (oldestKey !== undefined) {
        this.loggerPool.delete(oldestKey);
      }
    }

    this.loggerPool.set(cacheKey, logger);
    return logger;
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
