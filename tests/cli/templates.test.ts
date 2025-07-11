/**
 * FILE: tests/cli/templates.test.ts
 * DESCRIPTION: Unit tests for the template generation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  getDoctorManifestTemplate,
  getAuditPlanTemplate,
} from '../../src/cli/templates';

describe('CLI Templates', () => {
  describe('getDoctorManifestTemplate', () => {
    it('should generate a TypeScript manifest correctly', () => {
      const template = getDoctorManifestTemplate('ts', 'esm'); // module is ignored for TS
      expect(template).toContain("import type { DiagnosticRule } from 'syntropylog/doctor';");
      expect(template).toContain("import { coreRules } from 'syntropylog/doctor';");
      expect(template).toContain('export default');
      expect(template).toMatchSnapshot();
    });

    it('should generate a JavaScript (ESM) manifest correctly', () => {
      const template = getDoctorManifestTemplate('js', 'esm');
      expect(template).not.toContain('import type');
      expect(template).toContain("import { coreRules } from 'syntropylog/doctor';");
      expect(template).toContain('export default');
      expect(template).toMatchSnapshot();
    });

    it('should generate a JavaScript (CJS) manifest correctly', () => {
      const template = getDoctorManifestTemplate('js', 'cjs');
      expect(template).toContain("const { coreRules } = require('syntropylog/doctor');");
      expect(template).toContain('module.exports =');
      expect(template).toMatchSnapshot();
    });
  });

  describe('getAuditPlanTemplate', () => {
    it('should generate a TypeScript audit plan correctly', () => {
      const template = getAuditPlanTemplate('ts', 'esm');
      expect(template).toMatchSnapshot();
    });

    it('should generate a JavaScript (ESM) audit plan correctly', () => {
      const template = getAuditPlanTemplate('js', 'esm');
      expect(template).toMatchSnapshot();
    });

    it('should generate a JavaScript (CJS) audit plan correctly', () => {
      const template = getAuditPlanTemplate('js', 'cjs');
      expect(template).toMatchSnapshot();
    });
  });
});