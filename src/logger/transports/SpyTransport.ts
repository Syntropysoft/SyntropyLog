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
   * @param {Partial<LogEntry> | ((entry: LogEntry) => boolean)} predicate - An object with properties to match or a function that returns true for matching entries.
   * @returns {LogEntry[]} An array of matching log entries.
   */
  public findEntries(
    predicate: Partial<LogEntry> | ((entry: LogEntry) => boolean)
  ): LogEntry[] {
    if (typeof predicate === 'function') {
      // If the predicate is a function, use it directly with filter.
      return this.entries.filter(predicate);
    }

    // If the predicate is an object, perform a shallow property comparison.
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

  /**
   * Returns the first log entry that was captured.
   * @returns {LogEntry | undefined} The first entry, or undefined if none were captured.
   */
  public getFirstEntry(): LogEntry | undefined {
    return this.entries[0];
  }

  /**
   * Returns the most recent log entry that was captured.
   * @returns {LogEntry | undefined} The last entry, or undefined if none were captured.
   */
  public getLastEntry(): LogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }
}
