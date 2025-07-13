# Example 110: Diagnostics with the Doctor

This example demonstrates how to use the `syntropylog doctor` command-line tool to audit and validate your configuration.

## The Goal

As configurations grow, it's easy to make mistakes:
- Forgetting a required field.
- Using a log level that's too verbose for production.
- Introducing duplicate client names.
- Forgetting to add security features like data masking.

The "doctor" is a command-line tool that runs a series of diagnostic rules against your configuration file to catch these common problems before they cause issues in production. It's designed to be run in CI/CD pipelines to enforce best practices.

## Key Files in This Example

1.  **`package.json`**:
    - Defines a simple `"check": "syntropylog doctor"` script.

2.  **`syntropylog.config.js`**:
    - An example configuration file that **intentionally contains several errors and bad practices**. This is the file the doctor will inspect.

3.  **`syntropylog.doctor.js`**:
    - A **custom doctor manifest**. This file shows how you can add your own project-specific rules to the doctor's built-in checks. In this case, we add a rule that warns if no HTTP clients are configured.

## How to Run the Doctor

1.  Navigate to this directory:
    ```sh
    cd examples/110-diagnostics-doctor
    ```

2.  Install dependencies:
    ```sh
    npm install
    ```

3.  Run the check script. To simulate a production environment and trigger the log level warning, we'll set `NODE_ENV=production`.
    ```sh
    NODE_ENV=production npm run check
    ```

You will see a formatted report in your console listing all the findings from both the core rules and our custom rule. It will identify all the problems we intentionally placed in the configuration file, with clear recommendations on how to fix them. 