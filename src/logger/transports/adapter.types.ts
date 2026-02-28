/**
 * @file src/logger/transports/adapter.types.ts
 * @description Defines the contract for external log transport adapters.
 */
import { LogEntry } from '../../types';

/**
 * @interface ILogTransportAdapter
 * @description The interface that every external log transport adapter must implement.
 * This allows SyntropyLog to remain decoupled from specific persistence layers.
 */
export interface ILogTransportAdapter {
  /**
   * Sends a log entry to the external destination.
   * @param {LogEntry} entry - The structured log entry.
   * @returns {Promise<void>}
   */
  log(entry: LogEntry): Promise<void>;

  /**
   * Optional method to flush any buffered logs.
   * @returns {Promise<void>}
   */
  flush?(): Promise<void>;

  /**
   * Optional method to gracefully shut down the adapter.
   * @returns {Promise<void>}
   */
  shutdown?(): Promise<void>;
}
