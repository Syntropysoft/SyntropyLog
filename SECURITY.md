# Security Policy

## Environment Variables

This package reads **only** the following environment variables. **None are used for credentials, secrets, or data exfiltration.**

| Variable | Purpose |
| -------- | ------- |
| `NO_COLOR` | [Standard convention](https://no-color.org/) to disable ANSI colors in console output (e.g. CI, pipes). Checked only to decide whether to use colored output. |
| `SYNTROPYLOG_NATIVE_DISABLE` | When set to `1`, disables the optional native addon so the library runs in pure JS (e.g. debugging, environments where the addon is not built). |

No other environment variables are read. No API keys, tokens, or secrets are ever read from the environment by this package.

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
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
