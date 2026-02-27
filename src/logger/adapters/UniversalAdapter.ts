/**
 * @file UniversalAdapter.ts
 * @description Agnostic adapter that delegates persistence to an injected executor function.
 */

import { ILogTransportAdapter } from '../transports/adapter.types';

export type UniversalExecutor = (data: any) => Promise<void> | void;

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
   * Receives formatted data and passes it to the executor.
   */
  public async log(data: any): Promise<void> {
    try {
      await this.executor(data);
    } catch (error) {
      // In a "Silent Observer" way, we log but don't break the app
      console.error(`UniversalAdapter execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
