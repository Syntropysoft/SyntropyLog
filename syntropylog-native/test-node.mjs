/**
 * Tests del addon: ping y fast_serialize (sanitización + enmascarado).
 * Ejecutar después de: pnpm exec napi build --platform --release
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const native = require('.');

// --- ping ---
const pingResult = native.ping();
if (pingResult !== 'pong') {
  console.error('ping: expected "pong", got:', pingResult);
  process.exit(1);
}
console.log('OK ping:', pingResult);

// --- fast_serialize: objeto desde Node (sin JSON.stringify), enmascarado en Rust ---
const entry = {
  level: 'info',
  message: 'test',
  user: { email: 'u@x.com', password: 'secret123' },
};
const config = JSON.stringify({
  sensitiveFields: ['password', 'token'],
  redactPatterns: [],
  maxDepth: 10,
  maxStringLength: 300,
  sanitize: true,
});
const out = native.fastSerialize(entry, config);
const parsed = JSON.parse(out);
if (parsed.user?.password !== '[REDACTED]') {
  console.error('fast_serialize: expected user.password "[REDACTED]", got:', parsed.user?.password);
  process.exit(1);
}
console.log('OK fast_serialize: sensitive field redacted');

console.log('All tests passed.');
