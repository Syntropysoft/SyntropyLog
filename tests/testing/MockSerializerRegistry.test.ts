/**
 * FILE: tests/testing/MockSerializerRegistry.test.ts
 * DESCRIPTION: Unit tests for MockSerializerRegistry to verify it works correctly.
 * These tests ensure the mock behaves exactly like the real SerializerRegistry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockSerializerRegistry } from '../../src/testing/MockSerializerRegistry';
import { createMockLogger } from '../../src/testing/SyntropyLogMock';

describe('MockSerializerRegistry', () => {
  let mockSerializer: MockSerializerRegistry;
  let mockLogger: any;

  beforeEach(() => {
    mockSerializer = new MockSerializerRegistry(vi.fn);
    mockLogger = createMockLogger();
  });

  describe('Basic Functionality', () => {
    it('should return metadata unchanged by default', async () => {
      // Arrange
      const metadata = {
        userId: 123,
        name: 'John Doe',
        email: 'john@example.com'
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result).toEqual(metadata);
      expect(mockSerializer.process).toHaveBeenCalledWith(metadata, mockLogger);
    });

    it('should apply single serializer correctly', async () => {
      // Arrange
      const customSerializer = (value: unknown) => `CUSTOM_${String(value)}`;
      mockSerializer.setSerializer('userId', customSerializer);

      const metadata = {
        userId: 123,
        name: 'John Doe'
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result.userId).toBe('CUSTOM_123');
      expect(result.name).toBe('John Doe'); // Unchanged
      expect(mockSerializer.setSerializer).toHaveBeenCalledWith('userId', customSerializer);
    });

    it('should apply multiple serializers correctly', async () => {
      // Arrange
      mockSerializer.setSerializer('userId', (value) => `USER_${value}`);
      mockSerializer.setSerializer('email', (value) => `EMAIL_${value}`);

      const metadata = {
        userId: 456,
        email: 'jane@example.com',
        name: 'Jane Doe'
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result.userId).toBe('USER_456');
      expect(result.email).toBe('EMAIL_jane@example.com');
      expect(result.name).toBe('Jane Doe'); // Unchanged
    });

    it('should handle complex object serialization', async () => {
      // Arrange
      const userSerializer = (user: any) => {
        if (!user) return 'null';
        return `User(${user.id}, ${user.name})`;
      };
      mockSerializer.setSerializer('user', userSerializer);

      const metadata = {
        user: { id: 789, name: 'Bob Smith', email: 'bob@example.com' },
        timestamp: '2024-01-01T00:00:00Z'
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result.user).toBe('User(789, Bob Smith)');
      expect(result.timestamp).toBe('2024-01-01T00:00:00Z'); // Unchanged
    });
  });

  describe('Error Handling', () => {
    it('should handle serializer errors gracefully', async () => {
      // Arrange
      const failingSerializer = (value: unknown) => {
        throw new Error('Serializer failed');
      };
      mockSerializer.setSerializer('userId', failingSerializer);

      const metadata = {
        userId: 789,
        name: 'Bob'
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result.userId).toBe('[MOCK_SERIALIZER_ERROR: Failed to process key \'userId\']');
      expect(result.name).toBe('Bob'); // Unchanged
    });

    it('should simulate timeout errors', async () => {
      // Arrange
      mockSerializer.setTimeout(10); // 10ms timeout

      const metadata = { userId: 123 };

      // Act & Assert
      await expect(mockSerializer.process(metadata, mockLogger))
        .rejects.toThrow('Mock serializer timed out after 10ms.');
    });

    it('should handle null and undefined values correctly', async () => {
      // Arrange
      const nullSerializer = (value: unknown) => {
        if (value === null) return 'NULL_VALUE';
        if (value === undefined) return 'UNDEFINED_VALUE';
        return String(value);
      };
      mockSerializer.setSerializer('nullableField', nullSerializer);
      mockSerializer.setSerializer('undefinedField', nullSerializer); // Configurar serializer para ambos campos

      const metadata = {
        nullableField: null,
        undefinedField: undefined,
        normalField: 'normal'
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result.nullableField).toBe('NULL_VALUE');
      expect(result.undefinedField).toBe('UNDEFINED_VALUE');
      expect(result.normalField).toBe('normal'); // Unchanged
    });
  });

  describe('Error Simulation', () => {
    it('should simulate errors for specific keys', async () => {
      // Arrange
      const error = new Error('Test error');
      mockSerializer.setError('userId', error);

      const metadata = {
        userId: 123,
        name: 'John'
      };

      // Act & Assert
      await expect(mockSerializer.process(metadata, mockLogger))
        .rejects.toThrow('Mock error for key \'userId\'');
    });

    it('should not throw error for keys without error simulation', async () => {
      // Arrange
      mockSerializer.setError('userId', new Error('Test error'));

      const metadata = {
        name: 'John', // No userId field
        email: 'john@example.com'
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result).toEqual(metadata);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all configuration', async () => {
      // Arrange
      mockSerializer.setSerializer('userId', (value) => `CUSTOM_${value}`);
      mockSerializer.setError('email', new Error('Test error'));
      mockSerializer.setTimeout(100);

      const metadata = { userId: 123, email: 'test@example.com' };

      // Act
      mockSerializer.reset();
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result).toEqual(metadata); // Back to original values
      expect(mockSerializer.reset).toHaveBeenCalled();
    });

    it('should clear serializers after reset', async () => {
      // Arrange
      mockSerializer.setSerializer('userId', (value) => `CUSTOM_${value}`);
      const metadata = { userId: 123 };

      // Act
      mockSerializer.reset();
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result.userId).toBe(123); // Back to original value
    });
  });

  describe('Spying and Verification', () => {
    it('should track all method calls', async () => {
      // Arrange
      const customSerializer = (value: unknown) => `CUSTOM_${value}`;
      const metadata = { userId: 123 };

      // Act
      mockSerializer.setSerializer('userId', customSerializer);
      await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(mockSerializer.setSerializer).toHaveBeenCalledWith('userId', customSerializer);
      expect(mockSerializer.process).toHaveBeenCalledWith(metadata, mockLogger);
    });

    it('should track error configuration calls', () => {
      // Arrange
      const error = new Error('Test error');

      // Act
      mockSerializer.setError('userId', error);

      // Assert
      expect(mockSerializer.setError).toHaveBeenCalledWith('userId', error);
    });

    it('should track timeout configuration calls', () => {
      // Act
      mockSerializer.setTimeout(50);

      // Assert
      expect(mockSerializer.setTimeout).toHaveBeenCalledWith(50);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty metadata', async () => {
      // Arrange
      const metadata = {};

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result).toEqual({});
    });

    it('should handle metadata with only undefined values', async () => {
      // Arrange
      const metadata = {
        field1: undefined,
        field2: undefined
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result).toEqual(metadata);
    });

    it('should only process fields with configured serializers', async () => {
      // Arrange
      const userSerializer = (user: any) => `User(${user.id})`;
      mockSerializer.setSerializer('user', userSerializer);

      const metadata = {
        user: { id: 123, name: 'John', email: 'john@example.com' },
        order: { id: 'ORD-456', total: 99.99 }, // Sin serializer
        timestamp: '2024-01-01T00:00:00Z' // Sin serializer
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result.user).toBe('User(123)'); // Procesado por serializer
      expect(result.order).toEqual({ id: 'ORD-456', total: 99.99 }); // Sin cambios
      expect(result.timestamp).toBe('2024-01-01T00:00:00Z'); // Sin cambios
    });

    it('should handle nested object serialization', async () => {
      // Arrange
      const nestedSerializer = (obj: any) => {
        if (typeof obj === 'object' && obj !== null) {
          return `Object(${Object.keys(obj).length} keys)`;
        }
        return String(obj);
      };
      mockSerializer.setSerializer('config', nestedSerializer);

      const metadata = {
        config: { apiKey: 'secret', timeout: 5000 },
        name: 'test'
      };

      // Act
      const result = await mockSerializer.process(metadata, mockLogger);

      // Assert
      expect(result.config).toBe('Object(2 keys)');
      expect(result.name).toBe('test'); // Unchanged
    });
  });
}); 