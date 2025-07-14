# SyntropyLog Doctor: Your Configuration Guardian

This example demonstrates `syntropylog doctor`, a powerful command-line interface (CLI) tool for auditing, validating, and securing your SyntropyLog configuration files.

## What is the Doctor and Why Use It?

The "Doctor" is a static analysis tool designed to examine your configuration files (`syntropylog.config.js`, `.yml`, etc.) and detect common problems, bad practices, and security vulnerabilities *before* they reach production.

It's your automated guardian for:
- **Preventing Deployment Errors**: Catches critical mistakes like an empty `transports` array or an incorrect Redis Sentinel configuration.
- **Enforcing Security**: Warns if no data `masking` rules are configured, helping to prevent sensitive data leaks.
- **Ensuring Production Readiness**: Alerts on overly verbose log levels (`debug`, `trace`) in a `production` environment.
- **Maintaining Consistency**: Detects duplicate instance names that can lead to ambiguous behavior.
- **Imposing Team Standards**: It is fully extensible, allowing DevOps or Platform teams to create custom rules to enforce their own configuration policies.

It is designed to be a crucial step in your CI/CD pipeline, acting as an automated quality gate.

## How It Works

The Doctor's process is simple and robust:
1.  **Load**: Finds and loads your configuration file.
2.  **Validate**: Checks that the file structure is compatible with the official SyntropyLog schema.
3.  **Check**: Runs a set of diagnostic rules (both "core" and custom ones) against your configuration.
4.  **Report**: Prints a clear and concise report to the console, detailing each finding, its severity level (ERROR, WARN, INFO), and a recommendation for fixing it.

---

## Usage Modes

### 1. For Developers (in a project environment)

During development, you can easily run the doctor via `npx` or an `npm` script.

1.  Navigate to this directory:
    ```sh
    cd examples/110-diagnostics-doctor
    ```

2.  Install the dependencies (which include `syntropylog`):
    ```sh
    npm install
    ```

3.  Run the check script. We simulate a production environment to trigger all the rules:
    ```sh
    NODE_ENV=production npm run check
    ```
    The `check` script in `package.json` simply runs `syntropylog doctor`.

You will see a detailed report of all the issues found in this example's `syntropylog.config.js` file.

---

## Distribution Strategies for Corporate Environments

The `doctor` is designed for flexible integration into DevOps workflows. Here are two main strategies for its distribution in controlled environments, ensuring security and compliance.

### Strategy A: Standalone Binary (for Environments without Node.js Access)

This strategy is ideal for the most restrictive environments, where not even `Node.js` or `npm` are available on CI/CD machines.

**The real power of the `doctor` is that it can be packaged as a standalone, self-contained binary.** This allows DevOps and security teams to run audits in any environment (including those without `npm` or `Node.js` installed, as is common in financial institutions).

##### Creating the Binary

You can use tools like [`pkg`](https://github.com/vercel/pkg) to create the executable. First, you would need a small entry file to launch the CLI.

**`build-doctor.js`**
```javascript
#!/usr/bin/env node
// This file is the entry point for the binary
require('syntropylog/cli'); 
```

Then, you could add a script to your `package.json` to build the binaries:
```json
"scripts": {
  "package-doctor": "pkg build-doctor.js --targets node18-linux-x64,node18-macos-x64,node18-win-x64 -o syntropylog-doctor"
}
```

##### Running the Binary

Once built, a DevOps team can simply download the `syntropylog-doctor` binary and run it against any configuration file:

```sh
# Run the doctor against a specific configuration file
./syntropylog-doctor doctor --config /path/to/your/project/syntropylog.config.yml

# The output will be identical to running it via npm
```

### Strategy B: Private, Self-Contained NPM Package (Recommended Method)

This is the **recommended and most secure method** for organizations that use a private NPM registry (like Nexus, JFrog Artifactory, GitHub Packages, etc.).

In a future version, the CLI will be distributed as a dedicated package: **`@syntropylog/cli`**.

The fundamental advantage of this approach is **Zero-Dependency Installation**. The published package is not source code with a list of dependencies to be downloaded from the internet. Instead, we use a bundler to create a **single, self-contained JavaScript file**.

This means:
- **The Attack Surface is Minimal**: There are no transitive dependencies that could hide vulnerabilities. What is audited is what is executed.
- **It Works Offline**: The CI/CD server does not need internet access to install the package, as everything is included.
- **Simple Auditing**: The security team can analyze a single, clean software artifact.

#### Secure Adoption Workflow

The adoption process by a financial institution would follow these three steps:

1.  **Ingestion and Audit**:
    - The organization's security team downloads the official `syntropylog-cli-X.Y.Z.tgz` artifact from the public NPM registry.
    - They perform their security audit process on this single file.

2.  **Publication to the Internal Repository**:
    - Once approved, the `.tgz` artifact is uploaded to the company's private registry (Nexus, Artifactory, etc.).
    - From this moment on, `@syntropylog/cli` is available to all internal teams, served securely from the company's own infrastructure.

3.  **Usage in CI/CD Pipelines**:
    - The CI/CD pipelines can now invoke the `doctor` securely, knowing it is being downloaded from the verified internal registry.
    ```sh
    # This command installs and runs the CLI from the internal Nexus.
    # No external network calls are made.
    npx @syntropylog/cli doctor --config /path/to/project/syntropylog.config.yml
    ```

This approach simplifies version management, aligns with DevSecOps best practices, and integrates natively into corporate development ecosystems.

---

## Extending the Doctor with Custom Rules

The `doctor` is not limited to the built-in checks. You can easily extend it with your own rules by creating a `syntropylog.doctor.js` file in your project root.

This example includes one: `syntropylog.doctor.js`.

**Anatomy of a Custom Rule:**

```javascript
{
  // A unique ID for your rule
  id: 'custom-check-for-http-clients',
  // A description of what the rule does
  description: 'Ensures that at least one HTTP client is configured.',
  /**
   * The logic function. It receives the validated configuration.
   * It returns an array of findings. If there are no issues, it returns [].
   */
  check: (config) => {
    if (!config.http?.instances || config.http.instances.length === 0) {
      return [
        {
          level: 'WARN', // Can be ERROR, WARN, or INFO
          title: 'No HTTP Clients Configured',
          message: 'The configuration does not define any instrumented HTTP clients.',
          recommendation: 'If this service communicates with other APIs, add an HTTP client instance.'
        },
      ];
    }
    return [];
  },
}
```

### Environment-Aware Rules: Adapting the Audit to `development`, `staging`, and `production`

Not all configuration rules are universal. A configuration that is valid and safe for `development` could be a vulnerability in `production`. The `doctor` addresses this by making its rules **environment-aware**.

Each rule's `check` function receives a second argument, a context object containing the current environment (read from `process.env.NODE_ENV`, or `'development'` by default).

This allows you to create incredibly powerful compliance rules.

**Example: Forbidding Credentials in Production**

Imagine you want to allow passwords in `development` but strictly forbid them in `production`. Your rule would look like this:

```javascript
{
  id: 'no-credentials-in-production',
  description: 'Ensures no sensitive credentials are hardcoded in production configurations.',
  /**
   * @param {import('syntropylog').SyntropyLogConfig} config
   * @param {{ env: string }} context - The current environment context.
   * @returns {import('syntropylog/doctor').CheckResult[]}
   */
  check: (config, context) => {
    // This rule ONLY applies to the production environment.
    if (context.env !== 'production') {
      return []; // Do nothing in other environments.
    }

    const findings = [];
    config.redis?.instances?.forEach((instance) => {
      if (instance.password || instance.username) {
        findings.push({
          level: 'ERROR',
          title: 'Credentials in Production Configuration',
          message: `The Redis instance "${instance.instanceName}" contains credentials.`,
          recommendation: 'In production, credentials must be injected at runtime via secure secrets or environment variables, not stored in the configuration file.'
        });
      }
    });
    return findings;
  },
}
```
When running `NODE_ENV=production npm run check`, this rule would fail with an error. When running without `NODE_ENV` (or with `NODE_ENV=development`), the rule would skip the check and pass silently.

In your `syntropylog.doctor.js` file, you simply export an array that combines the core rules with your own:

```javascript
const { coreRules } = require('syntropylog/doctor');
const myCustomRules = [ /* ... your rules here ... */ ];

module.exports = [...coreRules, ...myCustomRules];
```

The `doctor` will automatically load this manifest if it finds it, turning it into an incredibly flexible and powerful auditing tool. 