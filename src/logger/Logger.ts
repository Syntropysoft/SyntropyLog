import { format } from 'util';
import type { IContextManager } from '../context/IContextManager';
import type { ILogger } from './ILogger';
import { JsonValue, LogEntry } from '../types';
import { logLevels, LogLevelName } from './levels';
import { Transport } from './transports/Transport';
import { SerializerRegistry } from '../serialization/SerializerRegistry';
import { MaskingEngine } from '../masking/MaskingEngine';

export interface LoggerOptions {
  contextManager: IContextManager;
  transports: Transport[];
  level?: LogLevelName;
  serviceName?: string;
  bindings?: Record<string, JsonValue>;
  // Engines are now required dependencies for the logger
  serializerRegistry: SerializerRegistry;
  maskingEngine: MaskingEngine;
}

export class Logger implements ILogger {
  private readonly contextManager: IContextManager;
  private readonly transports: Transport[];
  private readonly bindings: Record<string, JsonValue>;
  private readonly serviceName: string;
  private level: LogLevelName;
  private readonly serializerRegistry: SerializerRegistry;
  private readonly maskingEngine: MaskingEngine;

  constructor(opts: LoggerOptions) {
    this.contextManager = opts.contextManager;
    this.transports = opts.transports;
    this.level = opts.level ?? 'info';
    this.serviceName = opts.serviceName ?? 'unknown-service';
    this.bindings = opts.bindings || {};
    this.serializerRegistry = opts.serializerRegistry;
    this.maskingEngine = opts.maskingEngine;
  }

  /**
   * The core async logging method that runs the full processing pipeline.
   */
  private async _log(level: LogLevelName, ...args: any[]): Promise<void> {
    const loggerLevelValue = logLevels[this.level];
    const messageLevelValue = logLevels[level];

    if (messageLevelValue < loggerLevelValue) {
      return;
    }

    let meta: Record<string, unknown> = {};
    let messageArgs = args;

    if (
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null &&
      !Array.isArray(args[0])
    ) {
      meta = { ...args[0] };
      messageArgs = args.slice(1);
    }

    // --- Processing Pipeline Execution ---
    // 1. Serialization (awaits the result as it can be async)
    const serializedMeta = await this.serializerRegistry.process(meta, this);

    // 2. Masking (runs on the now-serialized data)
    const maskedMeta = this.maskingEngine.process(serializedMeta);
    // --- End of Pipeline ---

    const metaMessage = (maskedMeta.msg as string) ?? undefined;
    if (metaMessage) delete maskedMeta.msg;

    const formattedMessage =
      messageArgs.length > 0 ? format(...messageArgs) : '';
    const finalMessage = [metaMessage, formattedMessage]
      .filter(Boolean)
      .join(' ');

    const entry: LogEntry = {
      ...this.bindings,
      ...maskedMeta,
      context: this.contextManager.getAll(),
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      msg: finalMessage,
    };

    const promises = this.transports
      .filter((transport) => {
        if (!transport.level) return true;
        const transportLevelValue = logLevels[transport.level];
        return messageLevelValue >= transportLevelValue;
      })
      .map((transport) => transport.log(entry));

    // Fire and forget the transport promises.
    Promise.allSettled(promises).catch(() => {
      /* No-op */
    });
  }

  // Public methods are NOT async. They call _log and immediately return.
  public info(...args: any[]): void {
    this._log('info', ...args);
  }
  public warn(...args: any[]): void {
    this._log('warn', ...args);
  }
  public error(...args: any[]): void {
    this._log('error', ...args);
  }
  public debug(...args: any[]): void {
    this._log('debug', ...args);
  }
  public trace(...args: any[]): void {
    this._log('trace', ...args);
  }
  public fatal(...args: any[]): void {
    this._log('fatal', ...args);
  }

  public setLevel(level: LogLevelName): void {
    this.level = level;
  }

  public child(bindings: Record<string, JsonValue>): ILogger {
    return new Logger({
      ...this,
      bindings: { ...this.bindings, ...bindings },
    });
  }

  public withSource(source: string): ILogger {
    return this.child({ source });
  }

  public withRetention(rules: Record<string, any>): ILogger {
    const safeRules = JSON.parse(JSON.stringify(rules));
    return this.child({ retention: safeRules });
  }

  public withTransactionId(transactionId: string): ILogger {
    return this.child({ transactionId });
  }
}
