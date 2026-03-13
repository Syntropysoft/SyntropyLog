/**
 * @file UniversalAdapter.ts
 * @description Agnostic adapter that delegates persistence to an injected executor function.
 */

import { ILogTransportAdapter } from '../transports/adapter.types';

export type UniversalExecutor = (data: unknown) => Promise<void> | void;

export interface UniversalAdapterOptions {
  /** The function that will actually persist the data (e.g. result of an ORM call) */
  executor: UniversalExecutor;
}

/**
 * UniversalAdapter implements ILogTransportAdapter.
 * It is completely agnostic of the storage backend.
 */
export class UniversalAdapter implements ILogTransportAdapter {
  private readonly executor: UniversalExecutor;

  constructor(options: UniversalAdapterOptions) {
    if (typeof options.executor !== 'function') {
      throw new Error('UniversalAdapter requires an executor function.');
    }
    this.executor = options.executor;
  }

  /**
   * Recibe el entry y lo pasa al executor. Fire-and-forget (no devuelve Promise) para no encolar en el GC.
   * Si recibe un string (ruta nativa), lo parsea para que el executor reciba siempre un objeto.
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
          console.error(
            `UniversalAdapter execution failed: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      }
    } catch (error) {
      console.error(
        `UniversalAdapter execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
