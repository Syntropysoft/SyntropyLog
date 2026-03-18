# Security Policy

## Environment Variables

**List of variables this package reads (and only these):**

| Variable | Where | Purpose |
|----------|--------|--------|
| `PATH` | Optional dependency `syntropylog-native` only | Used on Linux to locate the system `ldd` binary (e.g. `/usr/bin/ldd` or in PATH) for musl vs glibc detection when loading the native addon. No credentials or other data are read. |

The main package (`syntropylog`) does not read any environment variables. Environment names (e.g. `development`, `production`) and transport selection come from the config you pass to `init()`, not from `process.env`.

- **Module `fs`:** The main package has no file-based config. The optional **syntropylog-native** addon uses `fs` in `index.js` only: `existsSync` for the `.node` binary and, on Linux, `readFileSync(lddPath, 'utf8')` for musl detection (paths from `__dirname` or `resolveLddPathWithoutShell()`; no user-controlled paths). See “Environment Variables” above for `PATH`.

- **Native addon ESM (`index.mjs`):** The ESM entry uses `createRequire(import.meta.url)` and a **static** path `require('./index.js')` to load the CJS bundle. No dynamic paths or user input; the same process then loads the platform-specific `.node` binary as documented.

**Config:** Pass options to `init()`; the package does not load config from files.

```typescript
import { syntropyLog } from 'syntropylog';

syntropyLog.on('ready', () => { /* ... */ });
syntropyLog.on('error', (err) => { /* ... */ });
syntropyLog.init({
  logger: { level: 'info', serviceName: 'my-app' },
  masking: { enableDefaultRules: true },
  // ... any other options from the README
});
```

- **Colors:** To respect [NO_COLOR](https://no-color.org/), pass `disableColors: true` (or `disableColors: process.env.NO_COLOR != null && process.env.NO_COLOR !== '' && process.env.NO_COLOR !== '0'`) when creating console transports (e.g. `new CompactConsoleTransport({ disableColors: true })`). The library does not read `NO_COLOR`; you pass the value in.
- **Native addon:** To run in pure JS (no native addon), set `logger.disableNativeAddon: true` in `syntropyLog.init({ logger: { disableNativeAddon: true, ... } })`.

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.12.x  | :white_check_mark: |
| 0.9.x   | :white_check_mark: |
| < 0.9.0 | :x:                |

## Reporting a Vulnerability

We take the security of SyntropyLog seriously. If you believe you have found a security vulnerability, please report it to us as described below.

**Please do not report security vulnerabilities through public GitHub issues.**

### How to Report

Please send an email to [gabriel.alejandro.gomez@gmail.com] with the subject "SyntropyLog Security Vulnerability".

In your email, please include:

- A description of the vulnerability.
- Steps to reproduce the issue.
- Any relevant code snippets or proof-of-concept code.

### Response Timeline

We will acknowledge receipt of your report within 48 hours and will provide an estimated timeline for addressing the issue. We will keep you informed of our progress.

### Disclosure Policy

We ask that you give us a reasonable amount of time to fix the issue before making it public. We will coordinate with you on the public disclosure of the vulnerability.
