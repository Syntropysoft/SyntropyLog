/**
 * FILE: tests/context/extractInboundContext.test.ts
 * DESCRIPTION: Unit tests for the extractInboundContext pure helper.
 * Pure function — every test is: input → expected output, no setup needed.
 */

import { describe, it, expect } from 'vitest';
import { extractInboundContext } from '../../src/context/extractInboundContext';
import type { ContextConfig } from '../../src/types';

const FIELD_CORRELATION = 'correlationId';
const FIELD_TRACE = 'traceId';
const SOURCE_FRONTEND = 'frontend';
const SOURCE_PARTNER = 'partner';

const BASE_CONFIG: ContextConfig = {
  inbound: {
    [SOURCE_FRONTEND]: {
      [FIELD_CORRELATION]: 'X-Correlation-ID',
      [FIELD_TRACE]: 'X-Trace-ID',
    },
    [SOURCE_PARTNER]: {
      [FIELD_CORRELATION]: 'x-request-id',
    },
  },
};

// Shorthand so tests read as: extract(headers, source) → result
const extract = (
  headers: Record<string, string | string[] | undefined>,
  source: string,
  config: ContextConfig = BASE_CONFIG
) => extractInboundContext(headers, source, config);

describe('extractInboundContext', () => {
  describe('source resolution', () => {
    it('maps wire names to internal field names', () => {
      expect(
        extract(
          { 'x-correlation-id': 'req-001', 'x-trace-id': 'trace-xyz' },
          SOURCE_FRONTEND
        )
      ).toEqual({ [FIELD_CORRELATION]: 'req-001', [FIELD_TRACE]: 'trace-xyz' });
    });

    it('uses per-source wire names (partner maps x-request-id → correlationId)', () => {
      expect(extract({ 'x-request-id': 'req-002' }, SOURCE_PARTNER)).toEqual({
        [FIELD_CORRELATION]: 'req-002',
      });
    });

    it('returns {} for an unknown source', () => {
      expect(extract({ 'x-correlation-id': 'req-001' }, 'unknown')).toEqual({});
    });

    it('returns {} when inbound is not configured', () => {
      expect(
        extract({ 'x-correlation-id': 'req-001' }, SOURCE_FRONTEND, {})
      ).toEqual({});
    });
  });

  describe('absent fields', () => {
    it('omits fields whose headers are absent — no defaults, no generation', () => {
      expect(extract({ 'x-trace-id': 'trace-xyz' }, SOURCE_FRONTEND)).toEqual({
        [FIELD_TRACE]: 'trace-xyz',
      });
    });
  });

  describe('header case normalization', () => {
    it('normalizes config casing — X-Correlation-ID in config matches x-correlation-id from Node', () => {
      expect(
        extract({ 'x-correlation-id': 'req-001' }, SOURCE_FRONTEND)[
          FIELD_CORRELATION
        ]
      ).toBe('req-001');
    });
  });

  describe('array header values', () => {
    it('takes the first element when a header arrives as an array', () => {
      expect(
        extract(
          { 'x-correlation-id': ['req-001', 'req-002'] },
          SOURCE_FRONTEND
        )[FIELD_CORRELATION]
      ).toBe('req-001');
    });
  });

  describe('customHeaders passthrough', () => {
    it('stores custom headers with lowercased underscore key', () => {
      const config: ContextConfig = {
        ...BASE_CONFIG,
        customHeaders: ['X-Tenant-ID', 'X-Feature-Flag'],
      };
      expect(
        extract(
          { 'x-tenant-id': 'acme', 'x-feature-flag': 'checkout-v2' },
          SOURCE_FRONTEND,
          config
        )
      ).toMatchObject({ x_tenant_id: 'acme', x_feature_flag: 'checkout-v2' });
    });

    it('omits absent custom headers', () => {
      const config: ContextConfig = {
        ...BASE_CONFIG,
        customHeaders: ['X-Tenant-ID'],
      };
      expect(extract({}, SOURCE_FRONTEND, config)).not.toHaveProperty(
        'x_tenant_id'
      );
    });
  });
});
