/**
 * FILE: src/services/UserService.ts
 * DESCRIPTION: An example service to demonstrate testing with BeaconRedisMock.
 */

import { IBeaconRedis } from '../redis/IBeaconRedis';

// A simple user type for the example
export interface User {
  id: string;
  name: string;
  email: string;
}

// A mock database function to simulate fetching data from a primary source.
async function fetchUserFromDb(userId: string): Promise<User> {
  // In a real app, this would be a database query.
  return { id: userId, name: 'John Doe', email: 'john.doe@example.com' };
}

export class UserService {
  private readonly redis: IBeaconRedis;
  private readonly userCacheTtl = 3600; // 1 hour

  constructor(redisClient: IBeaconRedis) {
    this.redis = redisClient;
  }

  public async getUserById(userId: string): Promise<User | null> {
    const cacheKey = `user:${userId}`;

    const cachedUser = await this.redis.get(cacheKey);
    if (cachedUser) {
      return JSON.parse(cachedUser);
    }

    const user = await fetchUserFromDb(userId);
    await this.redis.set(cacheKey, JSON.stringify(user), this.userCacheTtl);
    return user;
  }
}
