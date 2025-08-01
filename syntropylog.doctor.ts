/**
* SYNTROPYLOG DOCTOR RULE MANIFEST
* This file configures the diagnostic rules for the `syntropylog doctor` command.
* You can import the built-in rules, add your own, or even filter out core rules.
*/

import type { DiagnosticRule } from 'syntropylog/doctor';

import { coreRules } from 'syntropylog/doctor';

export default [
// Spread in all core rules provided by the library.
...coreRules,

// Example: Filtering out a core rule you don't need.
// ...coreRules.filter(rule => rule.id !== 'suspicious-timeouts'),

// Example: Adding your own custom rules.
// {
//   id: 'my-corp-rule-001',
//   description: 'Ensures all Redis instances have a timeout.',
//   check: (config) => { /* ... your logic ... */ return []; }
// },
];