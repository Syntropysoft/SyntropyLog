# Security Policy

## Environment Variables

**List of variables this package reads (and only these):**

| Variable | Where | Purpose |
|----------|--------|--------|
| `PATH` | Optional dependency `syntropylog-native` only | Used on Linux to locate the system `ldd` binary (e.g. `/usr/bin/ldd` or in PATH) for musl vs glibc detection when loading the native addon. No credentials or other data are read. |

The main package (`syntropylog`) does not read any environment variables. Environment names (e.g. `development`, `production`) and transport selection come from the config you pass to `init()`, not from `process.env`.

**YAML config:** Optional file-based config uses the **yaml** package ([eemeli/yaml](https://github.com/eemeli/yaml)), which has **no external dependencies** (no argparse or similar). Some tools may still report:

- **URLs:** The package source contains documentation links (e.g. [caniuse.com](https://caniuse.com/js-regexp-lookbehind), [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#using_the_reviver_parameter)). These are comments/docs only; the library does **not** contact any URL at runtime.
- **Behavioral (medium):** Analysis of stringify/serialization code; the vendor states no malicious activity and conservative, typical serialization-library posture.

SyntropyLog uses only **parse** with schema **json** in `loadLoggerConfig`; it does not use stringify or other APIs.

**Passing config directly to `init()` (no YAML file, no `loadLoggerConfig`):**

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

If you never call `loadLoggerConfig()` and never import it, the only remaining use of the `yaml` package in your app would be if another dependency pulls it in; SyntropyLog lists `yaml` as a dependency for optional file-based config.

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
