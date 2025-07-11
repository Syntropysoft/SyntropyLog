/**
 * @file src/logger/transports/SpyTransport.ts
 * @description A transport designed for testing purposes.
 */
import { LogEntry } from '../../types';
import { Transport, TransportOptions } from './Transport';

/**
 * @class SpyTransport
 * A transport designed for testing. It captures log entries in memory,
 * allowing you to make assertions on what has been logged.
 * @extends {Transport}
 */
export class SpyTransport extends Transport {
  private entries: LogEntry[] = [];

  /**
   * @constructor
   * @param {TransportOptions} [options] - Options for the transport, such as level.
   */
  constructor(options?: TransportOptions) {
    super(options);
  }

  /**
   * Stores the log entry in an in-memory array.
   * @param {LogEntry} entry - The log entry to capture.
   * @returns {Promise<void>}
   */
  public async log(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
  }

  /**
   * Returns all log entries captured by this transport.
   * @returns {LogEntry[]} A copy of all captured log entries.
   */
  public getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Finds log entries where the properties match the given predicate.
   * Note: This performs a shallow comparison on the entry's properties.
   * @param {Partial<LogEntry>} predicate - An object with properties to match against log entries.
   * @returns {LogEntry[]} An array of matching log entries.
   */
  public findEntries(predicate: Partial<LogEntry>): LogEntry[] {
    return this.entries.filter((entry) => {
      return Object.keys(predicate).every((key) => {
        const k = key as keyof LogEntry;
        return predicate[k] === entry[k];
      });
    });
  }

  /**
   * Clears all captured log entries. Call this in your test setup
   * (e.g., `beforeEach`) to ensure test isolation.
   * @returns {void}
   */
  public clear(): void {
    this.entries = [];
  }
}