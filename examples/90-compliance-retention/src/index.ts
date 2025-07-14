import { SyntropyLog } from 'syntropylog';

// 1. Get the singleton instance of SyntropyLog.
const syntropy = SyntropyLog.getInstance();

// 2. Initialize SyntropyLog.
// We don't specify a transport, so it will use the default ConsoleTransport.
syntropy.init({
  masking: {
    fields: ['email', 'password', 'address.street'],
    maxDepth: 4,
  },
});

// 3. Create a logger instance.
const logger = syntropy.getLogger('compliance-service');

// 4. Create a sample user object with sensitive data.
const userPayload = {
  userId: 'usr-12345',
  username: 'john.doe',
  email: 'john.doe@example.com',
  password: 'a-very-secret-password',
  address: {
    street: '123 Main St',
    city: 'Anytown',
    zipCode: '12345',
  },
  deeplyNested: {
    level2: {
      level3: {
        level4: {
          level5: {
            password: 'this-password-is-too-deep-to-be-masked',
          },
        },
      },
    },
  },
};

// --- DEMONSTRATION ---

console.log('--- Demonstrating Masking and Retention Policies ---');

const auditEvent = {
  action: 'user_login_failed',
  ip: '192.168.1.100',
  user: userPayload,
};

console.log('\n[1] The ORIGINAL object to be logged:');
console.dir(auditEvent, { depth: null });

console.log('\n[2] The FINAL log entry written to the console by SyntropyLog:');

// 5. Log the object with a descriptive message, plus retention and source tagging.
// The output of this command is the final, processed log entry.
logger
  .withRetention({ category: 'audit', days: 365 * 7 })
  .withSource('security_module')
  .warn(auditEvent, 'Security audit event: User login failed.'); 