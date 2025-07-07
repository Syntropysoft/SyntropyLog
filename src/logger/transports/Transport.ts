import { LogEntry } from '../../types';
import { LogLevelName } from '../levels';
import { LogFormatter } from './formatters/LogFormatter';

/**
 * Options for configuring a transport.
 */
export interface TransportOptions {
  /**
   * The minimum log level this transport will handle.
   * If not specified, the transport will handle all levels.
   */
  level?: LogLevelName;
  /**
   * An optional formatter to transform the log entry before output.
   */
  formatter?: LogFormatter;
}

/**
 * Abstract base class for all transports.
 * A transport is responsible for sending a log entry to a specific destination,
 * such as the console, a file, or a remote service.
 */
export abstract class Transport {
  public readonly level?: LogLevelName;
  protected readonly formatter?: LogFormatter;

  constructor(options?: TransportOptions) {
    this.level = options?.level;
    this.formatter = options?.formatter;
  }

  /**
   * The core method of a transport. It processes and outputs a log entry.
   * This method must be implemented by subclasses.
   * @param entry The log entry to process.
   */
  public abstract log(entry: LogEntry): Promise<void>;

  /**
   * A method to ensure all buffered logs are written.
   * Subclasses should override this if they perform buffering.
   * @returns A promise that resolves when flushing is complete.
   */
  public async flush(): Promise<void> {
    // Default implementation does nothing.
    return Promise.resolve();
  }
}
