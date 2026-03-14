/**
 * Tests del addon: ping y fastSerializeFromJson (sanitización + enmascarado).
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

// --- configure native (masking config) ---
const config = JSON.stringify({
  sensitiveFields: ['password', 'token'],
  redactPatterns: [],
  maxDepth: 10,
  maxStringLength: 300,
  sanitize: true,
});
native.configureNative(config);

// --- fastSerializeFromJson: metadata como JSON, enmascarado en Rust ---
const level = 'info';
const message = 'test';
const timestamp = Date.now();
const service = 'test-service';
const metadata = { user: { email: 'u@x.com', password: 'secret123' } };
const metadataJson = JSON.stringify(metadata);
const out = native.fastSerializeFromJson(level, message, timestamp, service, metadataJson);
if (out.startsWith('[SYNTROPYLOG_NATIVE_ERROR]')) {
  console.error('fastSerializeFromJson failed:', out);
  process.exit(1);
}
const parsed = JSON.parse(out);
if (parsed.user?.password !== '[REDACTED]') {
  console.error('fastSerializeFromJson: expected user.password "[REDACTED]", got:', parsed.user?.password);
  process.exit(1);
}
console.log('OK fastSerializeFromJson: sensitive field redacted');

console.log('All tests passed.');
