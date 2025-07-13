import { RedisAdapter } from './RedisAdapter';

const REDIS_URL = 'redis://localhost:6379';

export const myRedisBusAdapter = new RedisAdapter(REDIS_URL); 