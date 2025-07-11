/*
=============================================================================
ARCHIVO 4: src/cli/templates.ts (NUEVO - PLANTILLAS DE CÓDIGO)
-----------------------------------------------------------------------------
DESCRIPTION (en-US):
This file centralizes the content for the generated manifest files. It
provides different template strings based on the chosen language and module system.
=============================================================================
*/
export function getDoctorManifestTemplate(
  lang: 'ts' | 'js',
  moduleSystem: 'esm' | 'cjs'
): string {
  const tsType = `import type { DiagnosticRule } from 'syntropylog/doctor';\n\n`;
  const esmImport = `import { coreRules } from 'syntropylog/doctor';`;
  const cjsImport = `const { coreRules } = require('syntropylog/doctor');`;
  const esmExport = `export default`;
  const cjsExport = `module.exports =`;
  const header = `
/**
* SYNTROPYLOG DOCTOR RULE MANIFEST
* This file configures the diagnostic rules for the \`syntropylog doctor\` command.
* You can import the built-in rules, add your own, or even filter out core rules.
*/`;
  const body = `[
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
];`;

  if (lang === 'ts') {
    return `${header.trim()}\n\n${tsType}${esmImport}\n\n${esmExport} ${body}`;
  }
  return moduleSystem === 'esm'
    ? `${header.trim()}\n\n${esmImport}\n\n${esmExport} ${body}`
    : `${header.trim()}\n\n${cjsImport}\n\n${cjsExport} ${body}`;
}

export function getAuditPlanTemplate(
  lang: 'ts' | 'js',
  moduleSystem: 'esm' | 'cjs'
): string {
  const tsType = `import type { DiagnosticRule } from 'syntropylog/doctor';\n\n`;
  const esmImportCore = `import { coreRules } from 'syntropylog/doctor';`;
  const cjsImportCore = `const { coreRules } = require('syntropylog/doctor');`;

  const esmExampleImport = `// import { productionRules } from './my-checks/production.js';`;
  const cjsExampleImport = `// const { productionRules } = require('./my-checks/production.js');`;

  const esmExport = `export default`;
  const cjsExport = `module.exports =`;

  const header = `
/**
* SYNTROPYLOG AUDIT PLAN
* --------------------
* This file defines the audit plan for your project's configurations.
* The \`syntropylog audit\` command will execute each job defined in this array.
*/`;

  const body = `[
{
  name: 'Production Config Audit',
  configFile: './config/production.yaml',
  // For production, we want all core rules plus our custom hardening rules.
  rules: [
      ...coreRules,
      // ...productionRules 
  ],
},
{
  name: 'Staging Config Audit',
  configFile: './config/staging.yaml',
  // For staging, we might want to be less strict.
  rules: coreRules.filter(rule => rule.id !== 'prod-log-level'),
},
];`;

  if (lang === 'ts') {
    return `${header.trim()}\n\n${tsType}${esmImportCore}\n${esmExampleImport}\n\n${esmExport} ${body}`;
  }
  return moduleSystem === 'esm'
    ? `${header.trim()}\n\n${esmImportCore}\n${esmExampleImport}\n\n${esmExport} ${body}`
    : `${header.trim()}\n\n${cjsImportCore}\n${cjsExampleImport}\n\n${cjsExport} ${body}`;
}
