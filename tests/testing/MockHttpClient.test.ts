/**
 * FILE: tests/testing/MockHttpClient.test.ts
 * DESCRIPTION: Unit tests for MockHttpClient to verify it works correctly.
 * These tests ensure the mock behaves exactly like the real HTTP clients.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockHttpClient } from '../../src/testing/MockHttpClient';

describe('MockHttpClient', () => {
  let mockHttpClient: MockHttpClient;

  beforeEach(() => {
    mockHttpClient = new MockHttpClient(vi.fn);
  });

  describe('Basic Functionality', () => {
    it('should make GET request successfully by default', async () => {
      // Arrange
      const url = 'https://api.example.com/users';
      const headers = { 'Authorization': 'Bearer token' };

      // Act
      const result = await mockHttpClient.get(url, headers);

      // Assert
      expect(result).toBeDefined();
      expect(mockHttpClient.get).toHaveBeenCalledWith(url, headers);
    });

    it('should make POST request successfully by default', async () => {
      // Arrange
      const url = 'https://api.example.com/users';
      const data = { name: 'John Doe', email: 'john@example.com' };
      const headers = { 'Content-Type': 'application/json' };

      // Act
      const result = await mockHttpClient.post(url, data, headers);

      // Assert
      expect(result).toBeDefined();
      expect(mockHttpClient.post).toHaveBeenCalledWith(url, data, headers);
    });

    it('should make PUT request successfully by default', async () => {
      // Arrange
      const url = 'https://api.example.com/users/123';
      const data = { name: 'Jane Doe' };
      const headers = { 'Content-Type': 'application/json' };

      // Act
      const result = await mockHttpClient.put(url, data, headers);

      // Assert
      expect(result).toBeDefined();
      expect(mockHttpClient.put).toHaveBeenCalledWith(url, data, headers);
    });

    it('should make DELETE request successfully by default', async () => {
      // Arrange
      const url = 'https://api.example.com/users/123';
      const headers = { 'Authorization': 'Bearer token' };

      // Act
      const result = await mockHttpClient.delete(url, headers);

      // Assert
      expect(result).toBeDefined();
      expect(mockHttpClient.delete).toHaveBeenCalledWith(url, headers);
    });
  });

  describe('Response Configuration', () => {
    it('should return configured response for GET', async () => {
      // Arrange
      const url = 'https://api.example.com/users';
      const expectedResponse = { users: [{ id: 1, name: 'John' }] };
      mockHttpClient.setResponse('get', expectedResponse);

      // Act
      const result = await mockHttpClient.get(url);

      // Assert
      expect(result).toEqual(expectedResponse);
      expect(mockHttpClient.setResponse).toHaveBeenCalledWith('get', expectedResponse);
    });

    it('should return configured response for POST', async () => {
      // Arrange
      const url = 'https://api.example.com/users';
      const data = { name: 'John' };
      const expectedResponse = { id: 1, name: 'John', created: true };
      mockHttpClient.setResponse('post', expectedResponse);

      // Act
      const result = await mockHttpClient.post(url, data);

      // Assert
      expect(result).toEqual(expectedResponse);
      expect(mockHttpClient.setResponse).toHaveBeenCalledWith('post', expectedResponse);
    });

    it('should return configured response for PUT', async () => {
      // Arrange
      const url = 'https://api.example.com/users/1';
      const data = { name: 'Jane' };
      const expectedResponse = { id: 1, name: 'Jane', updated: true };
      mockHttpClient.setResponse('put', expectedResponse);

      // Act
      const result = await mockHttpClient.put(url, data);

      // Assert
      expect(result).toEqual(expectedResponse);
      expect(mockHttpClient.setResponse).toHaveBeenCalledWith('put', expectedResponse);
    });

    it('should return configured response for DELETE', async () => {
      // Arrange
      const url = 'https://api.example.com/users/1';
      const expectedResponse = { deleted: true };
      mockHttpClient.setResponse('delete', expectedResponse);

      // Act
      const result = await mockHttpClient.delete(url);

      // Assert
      expect(result).toEqual(expectedResponse);
      expect(mockHttpClient.setResponse).toHaveBeenCalledWith('delete', expectedResponse);
    });
  });

  describe('Error Simulation', () => {
    it('should simulate GET request errors', async () => {
      // Arrange
      const url = 'https://api.example.com/users';
      const error = new Error('GET request failed');
      mockHttpClient.setError('get', error);

      // Act & Assert
      await expect(mockHttpClient.get(url)).rejects.toThrow('GET request failed');
      expect(mockHttpClient.setError).toHaveBeenCalledWith('get', error);
    });

    it('should simulate POST request errors', async () => {
      // Arrange
      const url = 'https://api.example.com/users';
      const data = { name: 'John' };
      const error = new Error('POST request failed');
      mockHttpClient.setError('post', error);

      // Act & Assert
      await expect(mockHttpClient.post(url, data)).rejects.toThrow('POST request failed');
      expect(mockHttpClient.setError).toHaveBeenCalledWith('post', error);
    });

    it('should simulate PUT request errors', async () => {
      // Arrange
      const url = 'https://api.example.com/users/1';
      const data = { name: 'Jane' };
      const error = new Error('PUT request failed');
      mockHttpClient.setError('put', error);

      // Act & Assert
      await expect(mockHttpClient.put(url, data)).rejects.toThrow('PUT request failed');
      expect(mockHttpClient.setError).toHaveBeenCalledWith('put', error);
    });

    it('should simulate DELETE request errors', async () => {
      // Arrange
      const url = 'https://api.example.com/users/1';
      const error = new Error('DELETE request failed');
      mockHttpClient.setError('delete', error);

      // Act & Assert
      await expect(mockHttpClient.delete(url)).rejects.toThrow('DELETE request failed');
      expect(mockHttpClient.setError).toHaveBeenCalledWith('delete', error);
    });
  });

  describe('Timeout Simulation', () => {
    it('should simulate GET request timeout', async () => {
      // Arrange
      const url = 'https://api.example.com/users';
      mockHttpClient.setTimeout('get', 50);

      // Act & Assert
      await expect(mockHttpClient.get(url)).rejects.toThrow('Mock HTTP client timed out after 50ms');
      expect(mockHttpClient.setTimeout).toHaveBeenCalledWith('get', 50);
    });

    it('should simulate POST request timeout', async () => {
      // Arrange
      const url = 'https://api.example.com/users';
      const data = { name: 'John' };
      mockHttpClient.setTimeout('post', 30);

      // Act & Assert
      await expect(mockHttpClient.post(url, data)).rejects.toThrow('Mock HTTP client timed out after 30ms');
      expect(mockHttpClient.setTimeout).toHaveBeenCalledWith('post', 30);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all configuration', async () => {
      // Arrange
      mockHttpClient.setError('get', new Error('Request failed'));
      mockHttpClient.setResponse('post', { test: 'data' });
      mockHttpClient.setTimeout('put', 100);

      // Act
      mockHttpClient.reset();

      // Assert
      expect(mockHttpClient.reset).toHaveBeenCalled();
      
      // Should work normally after reset
      await expect(mockHttpClient.get('https://api.example.com')).resolves.not.toThrow();
      await expect(mockHttpClient.post('https://api.example.com', {})).resolves.not.toThrow();
    });

    it('should clear error configuration after reset', async () => {
      // Arrange
      mockHttpClient.setError('get', new Error('Request failed'));

      // Act
      mockHttpClient.reset();

      // Assert
      await expect(mockHttpClient.get('https://api.example.com')).resolves.not.toThrow();
    });

    it('should clear response configuration after reset', async () => {
      // Arrange
      mockHttpClient.setResponse('post', { test: 'data' });

      // Act
      mockHttpClient.reset();

      // Assert
      const result = await mockHttpClient.post('https://api.example.com', {});
      expect(result).not.toEqual({ test: 'data' });
    });

    it('should clear timeout configuration after reset', async () => {
      // Arrange
      mockHttpClient.setTimeout('get', 50);

      // Act
      mockHttpClient.reset();

      // Assert
      await expect(mockHttpClient.get('https://api.example.com')).resolves.not.toThrow();
    });
  });

  describe('Spying and Verification', () => {
    it('should track all method calls', async () => {
      // Act
      await mockHttpClient.get('https://api.example.com/users');
      await mockHttpClient.post('https://api.example.com/users', { name: 'John' });
      await mockHttpClient.put('https://api.example.com/users/1', { name: 'Jane' });
      await mockHttpClient.delete('https://api.example.com/users/1');

      // Assert
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.put).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.delete).toHaveBeenCalledTimes(1);
    });

    it('should track response configuration calls', async () => {
      // Act
      mockHttpClient.setResponse('get', { data: 'test' });
      mockHttpClient.setResponse('post', { created: true });

      // Assert
      expect(mockHttpClient.setResponse).toHaveBeenCalledTimes(2);
    });

    it('should track error configuration calls', async () => {
      // Act
      mockHttpClient.setError('get', new Error('test'));
      mockHttpClient.setError('post', new Error('test'));

      // Assert
      expect(mockHttpClient.setError).toHaveBeenCalledTimes(2);
    });

    it('should track timeout configuration calls', async () => {
      // Act
      mockHttpClient.setTimeout('get', 100);
      mockHttpClient.setTimeout('post', 200);

      // Assert
      expect(mockHttpClient.setTimeout).toHaveBeenCalledTimes(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty URL', async () => {
      // Act
      await expect(mockHttpClient.get('')).resolves.not.toThrow();
      await expect(mockHttpClient.post('', {})).resolves.not.toThrow();
    });

    it('should handle null/undefined headers', async () => {
      // Act
      await expect(mockHttpClient.get('https://api.example.com', null as any)).resolves.not.toThrow();
      await expect(mockHttpClient.get('https://api.example.com', undefined as any)).resolves.not.toThrow();
    });

    it('should handle null/undefined data', async () => {
      // Act
      await expect(mockHttpClient.post('https://api.example.com', null as any)).resolves.not.toThrow();
      await expect(mockHttpClient.post('https://api.example.com', undefined as any)).resolves.not.toThrow();
    });
  });
}); 