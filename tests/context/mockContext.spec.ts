import { describe, it, expect, beforeEach } from 'vitest';
import { MockContextManager } from '../../src/context/MockContextManager';

describe('MockContextManager', () => {
  let mockContextManager: MockContextManager;

  beforeEach(() => {
    // Create a fresh instance for each test to ensure isolation
    mockContextManager = new MockContextManager();
  });

  it('should set and get values within a context', () => {
    mockContextManager.run(() => {
      mockContextManager.set('requestId', 'req-123');
      mockContextManager.set('userId', 'user-abc');

      expect(mockContextManager.get('requestId')).toBe('req-123');
      expect(mockContextManager.get('userId')).toBe('user-abc');
    });
  });

  it('should return all context values with getAll', () => {
    mockContextManager.run(() => {
      mockContextManager.set('requestId', 'req-456');
      mockContextManager.set('tenantId', 'tenant-xyz');

      const allContext = mockContextManager.getAll();
      expect(allContext).toEqual({
        requestId: 'req-456',
        tenantId: 'tenant-xyz',
      });
    });
  });

  it('should handle nested contexts correctly', () => {
    mockContextManager.run(() => {
      mockContextManager.set('level', 1);
      mockContextManager.set('shared', 'A');

      expect(mockContextManager.get('level')).toBe(1);

      mockContextManager.run(() => {
        // This inner context should inherit from the parent
        expect(mockContextManager.get('shared')).toBe('A');

        // It can also overwrite values for its own scope
        mockContextManager.set('level', 2);
        expect(mockContextManager.get('level')).toBe(2);
      });

      // Back in the outer context, the original value is restored
      expect(mockContextManager.get('level')).toBe(1);
      expect(mockContextManager.get('shared')).toBe('A');
    });
  });

  it('should handle nested async contexts correctly', async () => {
    await mockContextManager.run(async () => {
      mockContextManager.set('scope', 'outer');
      await new Promise((r) => setTimeout(r, 5));

      await mockContextManager.run(async () => {
        expect(mockContextManager.get('scope')).toBe('outer');
        mockContextManager.set('scope', 'inner');
        await new Promise((r) => setTimeout(r, 5));
        expect(mockContextManager.get('scope')).toBe('inner');
      });

      expect(mockContextManager.get('scope')).toBe('outer');
    });
  });

  it('should be empty outside of a run block', () => {
    // Set a value inside a context to ensure it's not leaking
    mockContextManager.run(() => {
      mockContextManager.set('leaky', false);
    });
    expect(mockContextManager.getAll()).toEqual({});
  });

  it('should clear the store when clear() is called', () => {
    mockContextManager.run(() => {
      mockContextManager.set('persistent', 'value');
      mockContextManager.clear();
      expect(mockContextManager.getAll()).toEqual({});
    });
  });
});