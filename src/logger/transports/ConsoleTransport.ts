import { LogEntry } from '../../types';
import { Transport, TransportOptions } from './Transport';


export class ConsoleTransport extends Transport {
  constructor(options?: TransportOptions) {
    super(options);
  }

  /**
   * Logs a structured entry to the console as a JSON string.
   * @param entry The log entry to process.
   */
  public async log(entry: LogEntry): Promise<void> {
    const logString = JSON.stringify(entry);

    switch (entry.level) {
      case 'fatal':
      case 'error':
        console.error(logString);
        break;
      case 'warn':
        console.warn(logString);
        break;
      default:
        console.log(logString);
        break;
    }
  }
}