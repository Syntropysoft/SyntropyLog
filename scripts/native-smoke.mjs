/**
 * E2E smoke for the optional native addon, run INSIDE a consumer install
 * (CI: an Alpine container installing the freshly packed tarballs — see the
 * `alpine-smoke` job in .github/workflows/build-native.yml).
 *
 *   EXPECT_NATIVE=true   the platform binary must load: getStats() reports
 *                        nativeAddonActive and no serialization fallback fires.
 *   EXPECT_NATIVE=false  the addon is absent (--omit=optional): the JS pipeline
 *                        must serve the same contract, and the load failure must
 *                        be REPORTED through onSerializationFallback, not silent.
 *
 * Both scenarios log the same PII entry and assert the emitted JSON: password
 * fully redacted, email never in cleartext. This is the failsafe guarantee as
 * an executed test against the packed artifact, not a README claim.
 */
import assert from 'node:assert/strict';
import { syntropyLog } from 'syntropylog';

const expectNative = process.env.EXPECT_NATIVE === 'true';

const fallbackReasons = [];
const lines = [];
const realLog = console.log;
// The default ConsoleTransport emits one JSON string per entry via console.log.
console.log = (...args) => {
  lines.push(args.join(' '));
};

let stats;
try {
  await syntropyLog.init({
    logger: { serviceName: 'native-smoke', level: 'info' },
    masking: { enableDefaultRules: true },
    onSerializationFallback: (reason) => {
      fallbackReasons.push(String(reason));
    },
  });

  syntropyLog
    .getLogger('smoke')
    .info({ email: 'ada@example.com', password: 'hunter2' }, 'smoke-entry');

  stats = syntropyLog.getStats(); // before shutdown: nativeAddonActive needs READY
  await syntropyLog.shutdown();
} finally {
  console.log = realLog;
}

const entries = lines.flatMap((l) => {
  try {
    return [JSON.parse(l)];
  } catch {
    return [];
  }
});
const entry = entries.find((e) => e.message === 'smoke-entry');
assert.ok(entry, `smoke-entry not found in output:\n${lines.join('\n')}`);

// --- The failsafe contract: PII is masked on BOTH engines ---
assert.notEqual(entry.password, 'hunter2', 'password leaked in cleartext');
assert.equal(
  entry.password,
  '[REDACTED]',
  `password not fully redacted: ${JSON.stringify(entry.password)}`
);
assert.notEqual(entry.email, 'ada@example.com', 'email leaked in cleartext');

// --- Engine selection matches the scenario ---
assert.equal(
  stats.nativeAddonActive,
  expectNative,
  `nativeAddonActive=${stats.nativeAddonActive}, expected ${expectNative}`
);
if (expectNative) {
  assert.deepEqual(
    fallbackReasons,
    [],
    `no fallback expected with a healthy native binary, got: ${fallbackReasons.join(' | ')}`
  );
} else {
  // The absence must be observable (see SerializationManager.getNativeAddon):
  // "native addon not installed (optional dependency); using JS pipeline".
  assert.ok(
    fallbackReasons.some((r) => /not installed/.test(r)),
    `expected a "not installed" fallback report, got: ${fallbackReasons.join(' | ') || '(none)'}`
  );
}

realLog(
  `native-smoke OK (expectNative=${expectNative}, nativeAddonActive=${stats.nativeAddonActive}, ` +
    `email=${JSON.stringify(entry.email)}, password=${JSON.stringify(entry.password)})`
);
