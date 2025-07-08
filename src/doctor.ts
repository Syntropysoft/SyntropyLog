/*
=============================================================================
ARCHIVO 8: src/doctor.ts (NUEVO - API PÚBLICA)
-----------------------------------------------------------------------------
DESCRIPTION (en-US):
This file serves as the public entry point for `syntropy/doctor`. It exports
the building blocks users will need to create their own custom audit manifests
and rules, such as `coreRules` and the necessary types.
=============================================================================
*/
export { coreRules } from './cli/checks';
export type { DiagnosticRule, CheckResult } from './cli/checks';