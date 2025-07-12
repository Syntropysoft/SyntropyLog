/**
 * @file src/doctor.ts
 * @description This file serves as the public entry point for the `syntropylog/doctor` module.
 * It exports the building blocks that users will need to create their own custom
 * diagnostic rule manifests and audit plans.
 *
 * @example
 * // in syntropylog.doctor.ts
 * import { coreRules, DiagnosticRule } from 'syntropylog/doctor';
 *
 * const myCustomRules: DiagnosticRule[] = [
 *   ...coreRules,
 *   // ... add custom rules here
 * ];
 *
 * export default myCustomRules;
 */

/**
 * The array of built-in diagnostic rules provided by SyntropyLog.
 * Users can import this array to use as a base for their own rule manifests.
 */
export { coreRules } from './cli/checks';

/**
 * The type definition for a single diagnostic rule and its result.
 * Use these to ensure your custom rules have the correct structure.
 */
export type { DiagnosticRule, CheckResult } from './cli/checks';
