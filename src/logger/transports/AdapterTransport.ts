/**
 * @file src/logger/transports/AdapterTransport.ts
 * @description A generic transport that delegates log output to an external adapter.
 */
import { LogEntry } from '../../types';
import { Transport, TransportOptions } from './Transport';
import { ILogTransportAdapter } from './adapter.types';

/**
 * @interface AdapterTransportOptions
 * @description Configuration options for the AdapterTransport.
 */
export interface AdapterTransportOptions extends TransportOptions {
  /**
   * The external adapter implementation.
   */
  adapter: ILogTransportAdapter;
}

/**
 * @class AdapterTransport
 * @description A flexible transport that leverages external adapters for log persistence.
 * This adheres to the Open/Closed Principle by allowing new persistence methods
 * without modifying the core transport logic.
 * @extends {Transport}
 */
export class AdapterTransport extends Transport {
  private readonly adapter: ILogTransportAdapter;

  /**
   * @constructor
   * @param {AdapterTransportOptions} options - The configuration options including the adapter.
   */
  constructor(options: AdapterTransportOptions) {
    if (!options.adapter) {
      throw new Error(
        'AdapterTransport requires a valid adapter implementation.'
      );
    }
    super(options);
    this.adapter = options.adapter;
  }

  /**
   * Delegates the log entry to the configured adapter.
   * @param {LogEntry} entry - The log entry to process.
   * @returns {Promise<void>}
   */
  public async log(entry: LogEntry): Promise<void> {
    // Guard clause: ensure level is enabled for this transport
    if (!this.isLevelEnabled(entry.level)) {
      return;
    }

    const finalObject = this.formatter ? this.formatter.format(entry) : entry;

    // The type assertion is safe as the adapter is expected to handle the formatted entry
    await this.adapter.log(finalObject as LogEntry);
  }

  /**
   * Flushes any buffered logs in the adapter if the method exists.
   * @returns {Promise<void>}
   */
  public override async flush(): Promise<void> {
    if (typeof this.adapter.flush === 'function') {
      await this.adapter.flush();
    }
  }

  /**
   * Shuts down the adapter gracefully if the method exists.
   * @returns {Promise<void>}
   */
  public async shutdown(): Promise<void> {
    if (typeof this.adapter.shutdown === 'function') {
      await this.adapter.shutdown();
    }
  }
}
