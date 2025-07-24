/**
 * FILE: tests/testing/MockBrokerAdapter.test.ts
 * DESCRIPTION: Unit tests for MockBrokerAdapter to verify it works correctly.
 * These tests ensure the mock behaves exactly like the real broker adapters.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockBrokerAdapter } from '../../src/testing/MockBrokerAdapter';

describe('MockBrokerAdapter', () => {
  let mockBroker: MockBrokerAdapter;

  beforeEach(() => {
    mockBroker = new MockBrokerAdapter(vi.fn);
  });

  describe('Basic Functionality', () => {
    it('should connect successfully by default', async () => {
      // Act
      await expect(mockBroker.connect()).resolves.not.toThrow();
      
      // Assert
      expect(mockBroker.connect).toHaveBeenCalled();
    });

    it('should disconnect successfully by default', async () => {
      // Act
      await expect(mockBroker.disconnect()).resolves.not.toThrow();
      
      // Assert
      expect(mockBroker.disconnect).toHaveBeenCalled();
    });

    it('should publish message successfully by default', async () => {
      // Arrange
      const topic = 'test-topic';
      const message = { data: 'test message' };

      // Act
      await expect(mockBroker.publish(topic, message)).resolves.not.toThrow();
      
      // Assert
      expect(mockBroker.publish).toHaveBeenCalledWith(topic, message);
    });

    it('should subscribe to topic successfully by default', async () => {
      // Arrange
      const topic = 'test-topic';
      const handler = vi.fn();

      // Act
      await expect(mockBroker.subscribe(topic, handler)).resolves.not.toThrow();
      
      // Assert
      expect(mockBroker.subscribe).toHaveBeenCalledWith(topic, handler);
    });
  });

  describe('Error Simulation', () => {
    it('should simulate connection errors', async () => {
      // Arrange
      mockBroker.setError('connect', new Error('Connection failed'));

      // Act & Assert
      await expect(mockBroker.connect()).rejects.toThrow('Connection failed');
      expect(mockBroker.setError).toHaveBeenCalledWith('connect', expect.any(Error));
    });

    it('should simulate publish errors', async () => {
      // Arrange
      const topic = 'test-topic';
      const message = { data: 'test' };
      mockBroker.setError('publish', new Error('Publish failed'));

      // Act & Assert
      await expect(mockBroker.publish(topic, message)).rejects.toThrow('Publish failed');
      expect(mockBroker.setError).toHaveBeenCalledWith('publish', expect.any(Error));
    });

    it('should simulate subscribe errors', async () => {
      // Arrange
      const topic = 'test-topic';
      const handler = vi.fn();
      mockBroker.setError('subscribe', new Error('Subscribe failed'));

      // Act & Assert
      await expect(mockBroker.subscribe(topic, handler)).rejects.toThrow('Subscribe failed');
      expect(mockBroker.setError).toHaveBeenCalledWith('subscribe', expect.any(Error));
    });

    it('should simulate disconnect errors', async () => {
      // Arrange
      mockBroker.setError('disconnect', new Error('Disconnect failed'));

      // Act & Assert
      await expect(mockBroker.disconnect()).rejects.toThrow('Disconnect failed');
      expect(mockBroker.setError).toHaveBeenCalledWith('disconnect', expect.any(Error));
    });
  });

  describe('Timeout Simulation', () => {
    it('should simulate connection timeout', async () => {
      // Arrange
      mockBroker.setTimeout('connect', 50);

      // Act & Assert
      await expect(mockBroker.connect()).rejects.toThrow('Mock broker timed out after 50ms');
      expect(mockBroker.setTimeout).toHaveBeenCalledWith('connect', 50);
    });

    it('should simulate publish timeout', async () => {
      // Arrange
      const topic = 'test-topic';
      const message = { data: 'test' };
      mockBroker.setTimeout('publish', 30);

      // Act & Assert
      await expect(mockBroker.publish(topic, message)).rejects.toThrow('Mock broker timed out after 30ms');
      expect(mockBroker.setTimeout).toHaveBeenCalledWith('publish', 30);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all configuration', async () => {
      // Arrange
      mockBroker.setError('connect', new Error('Connection failed'));
      mockBroker.setTimeout('publish', 100);

      // Act
      mockBroker.reset();

      // Assert
      expect(mockBroker.reset).toHaveBeenCalled();
      
      // Should work normally after reset
      await expect(mockBroker.connect()).resolves.not.toThrow();
      await expect(mockBroker.publish('topic', {})).resolves.not.toThrow();
    });

    it('should clear error configuration after reset', async () => {
      // Arrange
      mockBroker.setError('connect', new Error('Connection failed'));

      // Act
      mockBroker.reset();

      // Assert
      await expect(mockBroker.connect()).resolves.not.toThrow();
    });

    it('should clear timeout configuration after reset', async () => {
      // Arrange
      mockBroker.setTimeout('publish', 50);

      // Act
      mockBroker.reset();

      // Assert
      await expect(mockBroker.publish('topic', {})).resolves.not.toThrow();
    });
  });

  describe('Spying and Verification', () => {
    it('should track all method calls', async () => {
      // Act
      await mockBroker.connect();
      await mockBroker.publish('topic', { data: 'test' });
      await mockBroker.subscribe('topic', vi.fn());
      await mockBroker.disconnect();

      // Assert
      expect(mockBroker.connect).toHaveBeenCalledTimes(1);
      expect(mockBroker.publish).toHaveBeenCalledTimes(1);
      expect(mockBroker.subscribe).toHaveBeenCalledTimes(1);
      expect(mockBroker.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should track error configuration calls', async () => {
      // Act
      mockBroker.setError('connect', new Error('test'));
      mockBroker.setError('publish', new Error('test'));

      // Assert
      expect(mockBroker.setError).toHaveBeenCalledTimes(2);
    });

    it('should track timeout configuration calls', async () => {
      // Act
      mockBroker.setTimeout('connect', 100);
      mockBroker.setTimeout('publish', 200);

      // Assert
      expect(mockBroker.setTimeout).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty topic', async () => {
      // Act
      await expect(mockBroker.publish('', { data: 'test' })).resolves.not.toThrow();
      await expect(mockBroker.subscribe('', vi.fn())).resolves.not.toThrow();
    });

    it('should handle null/undefined message', async () => {
      // Act
      await expect(mockBroker.publish('topic', null as any)).resolves.not.toThrow();
      await expect(mockBroker.publish('topic', undefined as any)).resolves.not.toThrow();
    });

    it('should handle null/undefined handler', async () => {
      // Act
      await expect(mockBroker.subscribe('topic', null as any)).resolves.not.toThrow();
      await expect(mockBroker.subscribe('topic', undefined as any)).resolves.not.toThrow();
    });
  });
}); 