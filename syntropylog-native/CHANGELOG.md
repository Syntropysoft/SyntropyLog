# syntropylog-native

## 0.1.1

### Patch Changes

- Remove `execSync('which ldd')` from index.js; use `resolveLddPathWithoutShell()` (PATH + fs.existsSync only). Fixes Socket.dev medium (shell) and low (fs) alerts in published package.
