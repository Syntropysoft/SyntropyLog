/**
 * @file syntropylog.doctor.js
 * @description
 * This is a custom "doctor manifest" file. It demonstrates how you can
 * extend the built-in diagnostic rules with your own team-specific or
 * project-specific checks.
 *
 * When you run `syntropylog doctor`, it will automatically find and use this
 * file if it exists in the project root.
 */

// 1. Import the core rules from the framework.
// This allows you to build on top of the standard checks.
const { coreRules } = require('syntropylog/doctor');

// 2. Define your own custom rules.
// A rule is just an object with an ID, a description, and a `check` function.
const myCustomRules = [
  {
    id: 'custom-check-for-http-clients',
    description: 'Ensures that at least one HTTP client is configured.',
    /**
     * The check function receives the configuration and should return an
     * array of findings. If there are no issues, it should return an empty array.
     * @param {import('syntropylog').SyntropyLogConfig} config
     * @returns {import('syntropylog/doctor').CheckResult[]}
     */
    check: (config) => {
      if (!config.http?.instances || config.http.instances.length === 0) {
        return [
          {
            level: 'WARN',
            title: 'No HTTP Clients Configured',
            message:
              'The configuration does not define any instrumented HTTP clients.',
            recommendation:
              'If this service communicates with other APIs, consider adding an HTTP client instance under the "http.instances" key to enable automatic log correlation.',
          },
        ];
      }
      return [];
    },
  },
];

// 3. Export the final array of rules.
// We combine the core rules with our custom ones. You could also filter out
// core rules here if you wanted to disable them permanently for your project.
module.exports = [...coreRules, ...myCustomRules]; 