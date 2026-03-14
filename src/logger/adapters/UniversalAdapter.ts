/**
 * @file UniversalAdapter.ts
 * @description Agnostic adapter that delegates persistence to an injected executor function.
 */

import { ILogTransportAdapter } from '../transports/adapter.types';

export type UniversalExecutor = (data: unknown) => Promise<void> | void;

export interface UniversalAdapterOptions {
  /** The function that will actually persist the data (e.g. result of an ORM call) */
  executor: UniversalExecutor;
  /** Optional: called when executor fails. If not set, errors are logged to console.error. */
  onError?: (error: unknown) => void;
}

/**
 * UniversalAdapter implements ILogTransportAdapter.
 * It is completely agnostic of the storage backend.
 */
export class UniversalAdapter implements ILogTransportAdapter {
  private readonly executor: UniversalExecutor;
  private readonly onError?: (error: unknown) => void;

  constructor(options: UniversalAdapterOptions) {
    if (typeof options.executor !== 'function') {
      throw new Error('UniversalAdapter requires an executor function.');
    }
    this.executor = options.executor;
    this.onError = options.onError;
  }

  /**
   * Receives the entry and passes it to the executor. Fire-and-forget (does not return a Promise) to avoid GC pressure.
   * If it receives a string (native path), parses it so the executor always receives an object.
   */
  public log(entry: unknown): void {
    try {
      const data =
        typeof entry === 'string' ? (JSON.parse(entry) as unknown) : entry;
      const result = this.executor(data);
      // Fire-and-forget: no devolvemos Promise, pero capturamos rechazos para Silent Observer
      if (
        result != null &&
        typeof (result as Promise<unknown>).then === 'function'
      ) {
        (result as Promise<void>).catch((err: unknown) => {
          if (this.onError) this.onError(err);
          else
            console.error(
              `UniversalAdapter execution failed: ${err instanceof Error ? err.message : String(err)}`
            );
        });
      }
    } catch (error) {
      if (this.onError) this.onError(error);
      else
        console.error(
          `UniversalAdapter execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
    }
  }
}
