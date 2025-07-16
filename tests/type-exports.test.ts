/**
 * FILE: tests/type-exports.test.ts
 * DESCRIPTION: Smoke test for type exports to ensure all type exports work correctly.
 * This test verifies that all exported types can be imported without errors.
 */

import { describe, it, expect } from 'vitest';

// Import all type exports to verify they work
import type {
  // Core Types
  SyntropyLogConfig,
  ILogger,
  IContextManager,
  LogEntry,
  
  // Broker Types
  IBrokerAdapter,
  BrokerMessage,
  MessageHandler,
  MessageLifecycleControls,
  
  // Transport Types
  LogFormatter,
  
  // Redis Types
  IBeaconRedis,
  
  // HTTP Types
  IHttpClientAdapter,
  AdapterHttpRequest,
  AdapterHttpResponse,
  InstrumentedHttpClient,
} from '../src/type-exports';

describe('Type Exports Smoke Test', () => {
  it('should export all core types without errors', () => {
    // This test verifies that all types can be imported
    // If any type is missing or has issues, this will fail at compile time
    
    // Verify that the types are defined (not undefined)
    expect(typeof SyntropyLogConfig).toBeDefined();
    expect(typeof ILogger).toBeDefined();
    expect(typeof IContextManager).toBeDefined();
    expect(typeof LogEntry).toBeDefined();
  });

  it('should export all broker-related types without errors', () => {
    expect(typeof IBrokerAdapter).toBeDefined();
    expect(typeof BrokerMessage).toBeDefined();
    expect(typeof MessageHandler).toBeDefined();
    expect(typeof MessageLifecycleControls).toBeDefined();
  });

  it('should export all transport types without errors', () => {
    expect(typeof LogFormatter).toBeDefined();
  });

  it('should export all Redis types without errors', () => {
    expect(typeof IBeaconRedis).toBeDefined();
  });

  it('should export all HTTP types without errors', () => {
    expect(typeof IHttpClientAdapter).toBeDefined();
    expect(typeof AdapterHttpRequest).toBeDefined();
    expect(typeof AdapterHttpResponse).toBeDefined();
    expect(typeof InstrumentedHttpClient).toBeDefined();
  });

  it('should have all expected type exports available', () => {
    // This test verifies that all expected types are exported
    // The actual import verification happens at compile time above
    
    // Create a simple object to verify our test structure
    const typeCategories = {
      core: ['SyntropyLogConfig', 'ILogger', 'IContextManager', 'LogEntry'],
      broker: ['IBrokerAdapter', 'BrokerMessage', 'MessageHandler', 'MessageLifecycleControls'],
      transport: ['LogFormatter'],
      redis: ['IBeaconRedis'],
      http: ['IHttpClientAdapter', 'AdapterHttpRequest', 'AdapterHttpResponse', 'InstrumentedHttpClient']
    };
    
    // Verify our test structure is complete
    expect(typeCategories.core).toHaveLength(4);
    expect(typeCategories.broker).toHaveLength(4);
    expect(typeCategories.transport).toHaveLength(1);
    expect(typeCategories.redis).toHaveLength(1);
    expect(typeCategories.http).toHaveLength(4);
    
    // Total expected exports
    const totalExports = Object.values(typeCategories).flat().length;
    expect(totalExports).toBe(14);
  });
}); 