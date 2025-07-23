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

// SyntropyLog Mock for testing
export {
  createSyntropyLogMock,
  createMockLogger,
  createMockContextManager,
  createMockHttpManager,
  createMockBrokerManager,
  createMockSerializationManager,
  getMockLogger,
  getMockContextManager,
  getMockHttpManager,
  getMockBrokerManager,
  getMockSerializationManager,
  resetSyntropyLogMocks,
  type MockLogger,
  type MockSyntropyLog,
} from './SyntropyLogMock';

// Test helper for easy setup
export {
  createTestHelper,
  createServiceWithMock,
  type TestHelper,
} from './test-helper';
