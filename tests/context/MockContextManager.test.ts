/**
 * FILE: tests/context/MockContextManager.test.ts
 * DESCRIPTION: Unit tests for the MockContextManager class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockContextManager } from '../../src/context/MockContextManager';

describe('MockContextManager', () => {
  let mgr: MockContextManager;

  beforeEach(() => {
    mgr = new MockContextManager();
  });

  describe('configure', () => {
    it('defaults: x-correlation-id / x-trace-id', () => {
      expect(mgr.getCorrelationIdHeaderName()).toBe('x-correlation-id');
      expect(mgr.getTransactionIdHeaderName()).toBe('x-trace-id');
    });

    it('overrides correlation and transaction header names', () => {
      mgr.configure({
        correlationIdHeader: 'X-Request-ID',
        transactionIdHeader: 'X-Trace-ID',
      });
      expect(mgr.getCorrelationIdHeaderName()).toBe('X-Request-ID');
      expect(mgr.getTransactionIdHeaderName()).toBe('X-Trace-ID');
    });

    it('sets inbound and outbound maps', () => {
      mgr.configure({
        inbound: { frontend: { correlationId: 'X-Correlation-ID' } },
        outbound: { http: { correlationId: 'X-Correlation-ID' } },
      });
      mgr.set('correlationId', 'test-id');
      expect(mgr.getPropagationHeaders('http')).toEqual({
        'X-Correlation-ID': 'test-id',
      });
    });
  });

  describe('run', () => {
    it('restores context after a synchronous callback', async () => {
      mgr.set('key', 'outside');
      await mgr.run(() => {
        mgr.set('key', 'inside');
        expect(mgr.get('key')).toBe('inside');
      });
      expect(mgr.get('key')).toBe('outside');
    });

    it('restores context after an asynchronous callback', async () => {
      mgr.set('key', 'outside');
      await mgr.run(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        mgr.set('key', 'inside_async');
        expect(mgr.get('key')).toBe('inside_async');
      });
      expect(mgr.get('key')).toBe('outside');
    });

    it('restores context when a synchronous callback throws', async () => {
      mgr.set('key', 'original');
      await expect(
        mgr.run(() => {
          mgr.set('key', 'modified');
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
      expect(mgr.get('key')).toBe('original');
    });

    it('restores context when an asynchronous callback throws', async () => {
      mgr.set('key', 'original');
      await expect(
        mgr.run(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('async_boom');
        })
      ).rejects.toThrow('async_boom');
      expect(mgr.get('key')).toBe('original');
    });
  });

  describe('get / set / getAll / clear', () => {
    it('stores and retrieves values', () => {
      mgr.set('key1', 'value1');
      mgr.set('key2', 123);
      expect(mgr.get('key1')).toBe('value1');
      expect(mgr.get('key2')).toBe(123);
    });

    it('getAll returns a copy — mutations do not affect internal store', () => {
      mgr.set('key', 'value');
      mgr.getAll()['key'] = 'mutated';
      expect(mgr.get('key')).toBe('value');
    });

    it('clear empties the store', () => {
      mgr.set('key1', 'value1');
      mgr.clear();
      expect(mgr.getAll()).toEqual({});
    });
  });

  describe('correlationId / transactionId helpers', () => {
    it('getCorrelationId returns the stored value', () => {
      mgr.set('x-correlation-id', 'abc-123');
      expect(mgr.getCorrelationId()).toBe('abc-123');
    });

    it('getTransactionId / setTransactionId round-trip', () => {
      mgr.setTransactionId('txn-001');
      expect(mgr.getTransactionId()).toBe('txn-001');
      mgr.clear();
      expect(mgr.getTransactionId()).toBeUndefined();
    });
  });

  describe('getPropagationHeaders', () => {
    const outbound = {
      http: { correlationId: 'X-Correlation-ID', traceId: 'X-Trace-ID' },
      kafka: { correlationId: 'correlationId' },
    };

    beforeEach(() => mgr.configure({ outbound }));

    it('returns {} when store is empty', () => {
      expect(mgr.getPropagationHeaders('http')).toEqual({});
    });

    it('returns {} for an unknown target', () => {
      mgr.set('correlationId', 'abc');
      expect(mgr.getPropagationHeaders('s3')).toEqual({});
    });

    it('returns {} when default target (http) is not in outbound config', () => {
      mgr.configure({
        outbound: { kafka: { correlationId: 'correlationId' } },
      });
      mgr.set('correlationId', 'abc');
      expect(mgr.getPropagationHeaders()).toEqual({}); // default resolves to 'http', not in map
    });

    it('translates field names to wire names for the given target', () => {
      mgr.set('correlationId', 'id-001');
      mgr.set('traceId', 'trace-xyz');
      expect(mgr.getPropagationHeaders('http')).toEqual({
        'X-Correlation-ID': 'id-001',
        'X-Trace-ID': 'trace-xyz',
      });
    });

    it('omits fields absent from context', () => {
      mgr.set('correlationId', 'id-001'); // traceId not set
      expect(mgr.getPropagationHeaders('http')).toEqual({
        'X-Correlation-ID': 'id-001',
      });
    });

    it('uses http as default target', () => {
      mgr.configure({
        outbound: { http: { correlationId: 'X-Correlation-ID' } },
      });
      mgr.set('correlationId', 'id-default');
      expect(mgr.getPropagationHeaders()).toEqual({
        'X-Correlation-ID': 'id-default',
      });
    });
  });

  describe('getOutboundHeaderName', () => {
    beforeEach(() =>
      mgr.configure({
        outbound: { http: { correlationId: 'X-Correlation-ID' } },
      })
    );

    it('returns wire name for known field/target', () => {
      expect(mgr.getOutboundHeaderName('correlationId', 'http')).toBe(
        'X-Correlation-ID'
      );
    });

    it('defaults to http target', () => {
      expect(mgr.getOutboundHeaderName('correlationId')).toBe(
        'X-Correlation-ID'
      );
    });

    it('returns undefined for unknown field or target', () => {
      expect(
        mgr.getOutboundHeaderName('correlationId', 'kafka')
      ).toBeUndefined();
      expect(mgr.getOutboundHeaderName('nonExistent', 'http')).toBeUndefined();
    });
  });

  describe('getTraceContextHeaders', () => {
    it('returns {} when store is empty', () => {
      expect(mgr.getTraceContextHeaders()).toEqual({});
    });

    it('includes correlation and transaction IDs when set', () => {
      mgr.set('x-correlation-id', 'corr-id');
      mgr.set('transactionId', 'txn-id');
      expect(mgr.getTraceContextHeaders()).toEqual({
        'x-correlation-id': 'corr-id',
        'x-trace-id': 'txn-id',
      });
    });
  });
});
