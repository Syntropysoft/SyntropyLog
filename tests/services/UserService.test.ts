/**
 * FILE: tests/services/UserService.test.ts
 * DESCRIPTION: Unit tests for UserService, demonstrating the use of BeaconRedisMock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService, User } from '../../src/services/UserService';
import { BeaconRedisMock } from '../../src/testing/BeaconRedisMock';

describe('UserService', () => {
  let userService: UserService;
  let mockRedis: BeaconRedisMock;

  beforeEach(() => {
    // Create a new mock for each test to ensure isolation
    mockRedis = new BeaconRedisMock(vi.fn);
    userService = new UserService(mockRedis);
  });

  it('should return a user from cache if it exists (cache hit)', async () => {
    const userId = '123';
    const cachedUser: User = {
      id: userId,
      name: 'Cached Jane Doe',
      email: 'jane.doe@cache.com',
    };
    const cacheKey = `user:${userId}`;

    // Configure the mock to return the cached user
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedUser));

    const result = await userService.getUserById(userId);

    expect(result).toEqual(cachedUser);
    expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
    // Ensure set was NOT called because it was a cache hit
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('should fetch a user from DB and cache it if not in cache (cache miss)', async () => {
    const userId = '456';
    const dbUser: User = {
      id: userId,
      name: 'John Doe',
      email: 'john.doe@example.com',
    };
    const cacheKey = `user:${userId}`;

    // Configure the mock for a cache miss
    mockRedis.get.mockResolvedValue(null);

    const result = await userService.getUserById(userId);

    expect(result).toEqual(dbUser);
    expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
    expect(mockRedis.set).toHaveBeenCalledWith(
      cacheKey,
      JSON.stringify(dbUser),
      3600 // The TTL defined in the service
    );
  });
});