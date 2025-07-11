/**
 * @file src/testing/index.ts
 * @description Public entry point for testing utilities.
 * This allows users to import testing tools without polluting their production bundle.
 *
 * @example
 * import { SyntropyLogTestHarness } from 'syntropylog/testing';
 */

export type { SyntropyLogTestHarness } from './types';
export { MockContextManager } from '../context/MockContextManager';
export { SpyTransport } from '../logger/transports/SpyTransport';