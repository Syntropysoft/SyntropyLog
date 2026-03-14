import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const native = require('./index.js');

console.log('Testing native addon state persistence...');

// 1. Initial configuration
const config = JSON.stringify({
  sensitiveFields: ['secret_token'],
  redactPatterns: [],
  maxDepth: 10,
  maxStringLength: 300,
  sanitize: true,
});

const configured = native.configureNative(config);
console.log('configureNative result:', configured);

if (!configured) {
  console.error('FAILED: configureNative returned false');
  process.exit(1);
}

// 2. Serialize without passing config (using cached state)
const entry = {
  message: 'Testing state',
  secret_token: '12345',
  other: 'safe'
};

// We pass empty string as second arg because Rust signature still expects it
const out = native.fastSerialize(entry, '');
const parsed = JSON.parse(out);

console.log('Serialized output:', out);

if (parsed.secret_token !== '[REDACTED]') {
  console.error('FAILED: secret_token was NOT redacted using persistent state');
  console.log('Got:', parsed.secret_token);
  process.exit(1);
}

console.log('SUCCESS: Persistent state working!');

// 3. Try another log to be sure
const entry2 = { password: 'should_not_be_redacted_yet' }; // password is NOT in the config above
const out2 = native.fastSerialize(entry2, '');
const parsed2 = JSON.parse(out2);

if (parsed2.password === '[REDACTED]') {
  console.error('FAILED: password was redacted but it should NOT be in this config');
  process.exit(1);
}

console.log('SUCCESS: Addon correctly remembers ONLY the configured fields.');
console.log('Ping test:', native.ping());
