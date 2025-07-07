import { LogEntry } from '../../types';
import { Transport, TransportOptions } from './Transport';

/**
 * A transport designed for testing. It captures log entries in memory,
 * allowing you to make assertions on what has been logged.
 */
export class SpyTransport extends Transport {
  private entries: LogEntry[] = [];

  constructor(options?: TransportOptions) {
    super(options);
  }

  /**
   * Stores the log entry in an in-memory array.
   * @param entry The log entry to capture.
   */
  public async log(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
  }

  /**
   * Returns all log entries captured by this transport.
   */
  public getEntries(): LogEntry[] {
    return this.entries;
  }

  /**
   * Finds log entries where the properties match the given predicate.
   * Note: This performs a shallow comparison on the entry's properties.
   * @param predicate An object with properties to match against log entries.
   * @returns An array of matching log entries.
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
   */
  public clear(): void {
    this.entries = [];
  }
}