/**
 * @file This example demonstrates how to create and use a custom serializer.
 * Custom serializers are essential for logging complex objects from external
 * libraries (like ORMs) in a structured, safe, and clean way.
 */

import { syntropyLog } from 'syntropylog';

// --- 1. Define a mock data structure and object ---
// Imagine this is a user object returned by Prisma or another ORM.
// It contains sensitive data (`passwordHash`) and perhaps other metadata
// we don't want in our logs.
interface PrismaUser {
  id: number;
  email: string;
  name: string | null;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  profile: {
    bio: string;
  };
}

const mockUser: PrismaUser = {
  id: 123,
  email: 'alice@example.com',
  name: 'Alice',
  passwordHash: 'a-very-long-and-secret-hash',
  createdAt: new Date(),
  updatedAt: new Date(),
  profile: {
    bio: 'A test user profile.',
  },
};

// --- 2. Define the Custom Serializer Function ---
// This function takes the object and returns a formatted string.
// We can cherry-pick fields, redact sensitive information, and structure the output.
function prismaUserSerializer(user: unknown): string {
  // Type guard to ensure we're processing the correct object type
  if (
    !user ||
    typeof user !== 'object' ||
    !('id' in user) ||
    !('email' in user)
  ) {
    return '[INVALID_USER_OBJECT]';
  }

  const typedUser = user as PrismaUser;

  // Create a "safe" version of the object for logging
  const safeLogObject = {
    id: typedUser.id,
    email: typedUser.email,
    name: typedUser.name,
    // Note: `passwordHash` is intentionally omitted.
  };

  // Return it as a JSON string
  return JSON.stringify(safeLogObject);
}

// --- 3. Initialize SyntropyLog with the Custom Serializer ---
// We register our serializer function under the key `prismaUser`.
syntropyLog.init({
  appName: 'custom-serializer-example',
  serializers: {
    prismaUser: prismaUserSerializer,
  },
});

// --- 4. Use the Logger ---
// Get a logger instance
const logger = syntropyLog.getLogger('user-service');

// Now, when we log an object with the `prismaUser` key, SyntropyLog will
// automatically use our custom serializer function to process the value.
logger.info('User profile updated successfully', {
  prismaUser: mockUser,
  // You can still add other metadata as usual
  operationId: 'update-profile-123',
});

// The output will show the `prismaUser` field with the clean, serialized
// string, not the raw object with the password hash. 