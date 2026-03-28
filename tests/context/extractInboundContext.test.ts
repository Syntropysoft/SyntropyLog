/**
 * FILE: tests/context/extractInboundContext.test.ts
 * DESCRIPTION: Unit tests for the extractInboundContext pure helper.
 */

import { describe, it, expect } from 'vitest';
import { extractInboundContext } from '../../src/context/extractInboundContext';
import type { ContextConfig } from '../../src/types';

const FIELD_CORRELATION = 'correlationId';
const FIELD_TRACE = 'traceId';
const FIELD_TENANT = 'tenantId';
const SOURCE_FRONTEND = 'frontend';
const SOURCE_PARTNER = 'partner';

const baseConfig = (overrides: Partial<ContextConfig> = {}): ContextConfig => ({
  inbound: {
    [SOURCE_FRONTEND]: {
      [FIELD_CORRELATION]: 'X-Correlation-ID',
      [FIELD_TRACE]: 'X-Trace-ID',
    },
    [SOURCE_PARTNER]: {
      [FIELD_CORRELATION]: 'x-request-id',
    },
  },
  ...overrides,
});

describe('extractInboundContext', () => {
  describe('basic extraction', () => {
    it('should extract fields using the inbound map for the given source', () => {
      const headers = {
        'x-correlation-id': 'req-001',
        'x-trace-id': 'trace-xyz',
      };
      const result = extractInboundContext(
        headers,
        SOURCE_FRONTEND,
        baseConfig()
      );
      expect(result[FIELD_CORRELATION]).toBe('req-001');
      expect(result[FIELD_TRACE]).toBe('trace-xyz');
    });

    it('should return empty object when source is not in inbound map', () => {
      const headers = { 'x-correlation-id': 'req-001' };
      const result = extractInboundContext(
        headers,
        'unknown-source',
        baseConfig()
      );
      expect(result).toEqual({});
    });

    it('should return empty object when inbound is not configured', () => {
      const headers = { 'x-correlation-id': 'req-001' };
      const result = extractInboundContext(headers, SOURCE_FRONTEND, {});
      expect(result).toEqual({});
    });

    it('should use different wire names per source', () => {
      const headers = { 'x-request-id': 'req-002' };
      const result = extractInboundContext(
        headers,
        SOURCE_PARTNER,
        baseConfig()
      );
      expect(result[FIELD_CORRELATION]).toBe('req-002');
    });
  });

  describe('Node.js header case normalization', () => {
    it('should find headers regardless of casing declared in config', () => {
      // Developer declares 'X-Correlation-ID' in config
      // Node delivers { 'x-correlation-id': '...' } — all lowercase
      const headers = { 'x-correlation-id': 'req-001' };
      const result = extractInboundContext(
        headers,
        SOURCE_FRONTEND,
        baseConfig()
      );
      expect(result[FIELD_CORRELATION]).toBe('req-001');
    });

    it('should handle already-lowercase wire names in config', () => {
      const config = baseConfig({
        inbound: {
          [SOURCE_FRONTEND]: { [FIELD_CORRELATION]: 'x-correlation-id' },
        },
      });
      const headers = { 'x-correlation-id': 'req-001' };
      const result = extractInboundContext(headers, SOURCE_FRONTEND, config);
      expect(result[FIELD_CORRELATION]).toBe('req-001');
    });
  });

  describe('auto-generation of correlationField', () => {
    it('should auto-generate a UUID for correlationField when header is absent', () => {
      const headers = { 'x-trace-id': 'trace-xyz' }; // no correlation header
      const result = extractInboundContext(
        headers,
        SOURCE_FRONTEND,
        baseConfig()
      );
      expect(result[FIELD_CORRELATION]).toBeDefined();
      expect(result[FIELD_CORRELATION]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should NOT auto-generate for fields other than correlationField', () => {
      const headers = { 'x-correlation-id': 'req-001' }; // no trace header
      const result = extractInboundContext(
        headers,
        SOURCE_FRONTEND,
        baseConfig()
      );
      expect(result[FIELD_TRACE]).toBeUndefined();
    });

    it('should respect a custom correlationField name', () => {
      const config: ContextConfig = {
        correlationField: 'requestId',
        inbound: {
          [SOURCE_FRONTEND]: {
            requestId: 'X-Request-ID',
            [FIELD_TRACE]: 'X-Trace-ID',
          },
        },
      };
      const headers = { 'x-trace-id': 'trace-xyz' }; // no X-Request-ID
      const result = extractInboundContext(headers, SOURCE_FRONTEND, config);
      // requestId should be auto-generated
      expect(result['requestId']).toBeDefined();
      expect(result['requestId']).toHaveLength(36);
      // traceId absent without auto-gen
      expect(result[FIELD_TRACE]).toBe('trace-xyz');
    });

    it('should default correlationField to "correlationId" when not configured', () => {
      const config: ContextConfig = {
        inbound: {
          [SOURCE_FRONTEND]: { [FIELD_CORRELATION]: 'X-Correlation-ID' },
        },
        // correlationField not set — defaults to 'correlationId'
      };
      const headers = {}; // no headers at all
      const result = extractInboundContext(headers, SOURCE_FRONTEND, config);
      expect(result[FIELD_CORRELATION]).toBeDefined();
      expect(result[FIELD_CORRELATION]).toHaveLength(36);
    });
  });

  describe('customHeaders passthrough', () => {
    it('should extract custom headers and store them with lowercased underscore key', () => {
      const config = baseConfig({
        customHeaders: ['X-Tenant-ID', 'X-Feature-Flag'],
      });
      const headers = {
        'x-correlation-id': 'req-001',
        'x-tenant-id': 'acme',
        'x-feature-flag': 'checkout-v2',
      };
      const result = extractInboundContext(headers, SOURCE_FRONTEND, config);
      expect(result['x_tenant_id']).toBe('acme');
      expect(result['x_feature_flag']).toBe('checkout-v2');
    });

    it('should ignore custom headers that are absent from the request', () => {
      const config = baseConfig({ customHeaders: ['X-Tenant-ID'] });
      const headers = { 'x-correlation-id': 'req-001' };
      const result = extractInboundContext(headers, SOURCE_FRONTEND, config);
      expect(result['x_tenant_id']).toBeUndefined();
    });
  });

  describe('array header values', () => {
    it('should take the first value when a header is an array', () => {
      const headers = { 'x-correlation-id': ['req-001', 'req-002'] };
      const result = extractInboundContext(
        headers,
        SOURCE_FRONTEND,
        baseConfig()
      );
      expect(result[FIELD_CORRELATION]).toBe('req-001');
    });
  });

  describe('partial extraction', () => {
    it('should include only the fields present in the request', () => {
      // Only correlation, no trace
      const headers = { 'x-correlation-id': 'req-001' };
      const result = extractInboundContext(
        headers,
        SOURCE_FRONTEND,
        baseConfig()
      );
      expect(result[FIELD_CORRELATION]).toBe('req-001');
      expect(result).not.toHaveProperty(FIELD_TENANT);
    });
  });
});
