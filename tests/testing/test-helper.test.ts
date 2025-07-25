/**
 * FILE: tests/testing/test-helper.test.ts
 * DESCRIPTION: Unit tests for the test helper utilities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestHelper, createServiceWithMock, TestHelper } from '../../src/testing/test-helper.js';
import { createSyntropyLogMock, resetSyntropyLogMocks } from '../../src/testing/SyntropyLogMock.js';

// Mock the SyntropyLogMock module
vi.mock('../../src/testing/SyntropyLogMock.js', () => ({
  createSyntropyLogMock: vi.fn(),
  resetSyntropyLogMocks: vi.fn(),
}));

// Create unique mock instances
let mockInstanceCounter = 0;
const createUniqueMock = () => {
  mockInstanceCounter++;
  return {
    id: mockInstanceCounter,
    getLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    getRedis: vi.fn(),
    getBroker: vi.fn(),
    getHttp: vi.fn(),
  };
};

describe('Test Helper', () => {
  let testHelper: TestHelper;
  let mockSyntropyLog: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSyntropyLog = createUniqueMock();
    (createSyntropyLogMock as any).mockReturnValue(mockSyntropyLog);
  });

  describe('createTestHelper', () => {
    it('should create a test helper without spy function', () => {
      testHelper = createTestHelper();

      expect(testHelper).toBeDefined();
      expect(testHelper.mockSyntropyLog).toBe(mockSyntropyLog);
      expect(typeof testHelper.beforeEach).toBe('function');
      expect(typeof testHelper.afterEach).toBe('function');
      expect(createSyntropyLogMock).toHaveBeenCalledWith(undefined);
    });

    it('should create a test helper with spy function', () => {
      const spyFn = vi.fn();
      testHelper = createTestHelper(spyFn);

      expect(testHelper).toBeDefined();
      expect(testHelper.mockSyntropyLog).toBe(mockSyntropyLog);
      expect(createSyntropyLogMock).toHaveBeenCalledWith(spyFn);
    });

    it('should call resetSyntropyLogMocks in beforeEach', () => {
      testHelper = createTestHelper();
      
      testHelper.beforeEach();
      
      expect(resetSyntropyLogMocks).toHaveBeenCalledTimes(1);
    });

    it('should have afterEach function that does nothing', () => {
      testHelper = createTestHelper();
      
      // Should not throw
      expect(() => testHelper.afterEach()).not.toThrow();
    });

    it('should return the same mockSyntropyLog instance', () => {
      testHelper = createTestHelper();
      
      expect(testHelper.mockSyntropyLog).toBe(mockSyntropyLog);
      expect(testHelper.mockSyntropyLog).toBe(testHelper.mockSyntropyLog);
    });
  });

  describe('createServiceWithMock', () => {
    class TestService {
      private syntropyLog: any;
      
      constructor(syntropyLog?: any) {
        this.syntropyLog = syntropyLog;
      }
      
      getSyntropyLog() {
        return this.syntropyLog;
      }
      
      doSomething() {
        return 'test';
      }
    }

    it('should create a service instance with mock injected', () => {
      const service = createServiceWithMock(TestService, mockSyntropyLog);

      expect(service).toBeInstanceOf(TestService);
      expect(service.getSyntropyLog()).toBe(mockSyntropyLog);
    });

    it('should create a service instance without mock', () => {
      const service = createServiceWithMock(TestService, undefined);

      expect(service).toBeInstanceOf(TestService);
      expect(service.getSyntropyLog()).toBeUndefined();
    });

    it('should preserve service functionality', () => {
      const service = createServiceWithMock(TestService, mockSyntropyLog);

      expect(service.doSomething()).toBe('test');
    });

    it('should work with different service classes', () => {
      class AnotherService {
        constructor(public syntropyLog?: any) {}
      }

      const service = createServiceWithMock(AnotherService, mockSyntropyLog);

      expect(service).toBeInstanceOf(AnotherService);
      expect(service.syntropyLog).toBe(mockSyntropyLog);
    });
  });

  describe('TestHelper interface', () => {
    it('should have correct interface structure', () => {
      testHelper = createTestHelper();

      expect(testHelper).toHaveProperty('mockSyntropyLog');
      expect(testHelper).toHaveProperty('beforeEach');
      expect(testHelper).toHaveProperty('afterEach');
      
      expect(typeof testHelper.beforeEach).toBe('function');
      expect(typeof testHelper.afterEach).toBe('function');
    });
  });

  describe('Integration scenarios', () => {
    it('should work in a typical test setup', () => {
      const spyFn = vi.fn();
      testHelper = createTestHelper(spyFn);

      // Simulate test setup
      testHelper.beforeEach();
      
      // Use the mock in a service
      class UserService {
        constructor(public syntropyLog: any) {}
        
        createUser() {
          return this.syntropyLog.getLogger('user').info('User created');
        }
      }

      const userService = createServiceWithMock(UserService, testHelper.mockSyntropyLog);
      
      // Should not throw
      expect(() => userService.createUser()).not.toThrow();
      
      // Cleanup
      testHelper.afterEach();
    });

    it('should handle multiple test helpers', () => {
      // Reset the mock to return different instances
      (createSyntropyLogMock as any)
        .mockReturnValueOnce(createUniqueMock())
        .mockReturnValueOnce(createUniqueMock());
      
      const helper1 = createTestHelper();
      const helper2 = createTestHelper();

      expect(helper1.mockSyntropyLog).not.toBe(helper2.mockSyntropyLog);
      expect(helper1.beforeEach).not.toBe(helper2.beforeEach);
    });
  });
}); 