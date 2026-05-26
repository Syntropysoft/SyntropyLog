import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveCorrelationId,
  traceIdFromTraceparent,
  DEFAULT_INCOMING_HEADERS,
  DEFAULT_RESPONSE_HEADERS,
} from '../../src/middleware/correlation';

describe('traceIdFromTraceparent', () => {
  it('extracts the 32-hex trace-id from a well-formed traceparent', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    expect(traceIdFromTraceparent(tp)).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('lowercases the trace-id field', () => {
    const tp = '00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01';
    expect(traceIdFromTraceparent(tp)).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('returns null for the all-zero trace-id (W3C says ignore)', () => {
    const tp = '00-00000000000000000000000000000000-00f067aa0ba902b7-01';
    expect(traceIdFromTraceparent(tp)).toBeNull();
  });

  it('returns null for malformed traceparent strings', () => {
    expect(traceIdFromTraceparent('not-a-traceparent')).toBeNull();
    expect(traceIdFromTraceparent('00-too-short-01')).toBeNull();
    expect(traceIdFromTraceparent('')).toBeNull();
  });

  it('handles array-form header value (Node sometimes provides arrays)', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    expect(traceIdFromTraceparent([tp, 'other'])).toBe(
      '4bf92f3577b34da6a3ce929d0e0e4736'
    );
  });

  it('returns null for non-string inputs', () => {
    expect(traceIdFromTraceparent(undefined)).toBeNull();
    expect(traceIdFromTraceparent([])).toBeNull();
    expect(
      traceIdFromTraceparent(42 as unknown as string | undefined)
    ).toBeNull();
  });
});

describe('resolveCorrelationId — defaults', () => {
  it('uses x-trace-id when present (first in the default order)', () => {
    const id = resolveCorrelationId({
      'x-trace-id': 'trc-from-x-trace-id',
      'x-correlation-id': 'trc-from-x-correlation-id',
    });
    expect(id).toBe('trc-from-x-trace-id');
  });

  it('falls through to x-correlation-id when x-trace-id is absent', () => {
    const id = resolveCorrelationId({
      'x-correlation-id': 'trc-corr',
    });
    expect(id).toBe('trc-corr');
  });

  it('falls through to x-request-id, then request-id', () => {
    expect(resolveCorrelationId({ 'x-request-id': 'trc-xreq' })).toBe(
      'trc-xreq'
    );
    expect(resolveCorrelationId({ 'request-id': 'trc-req' })).toBe('trc-req');
  });

  it('uses W3C traceparent when no explicit header is present', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    expect(resolveCorrelationId({ traceparent: tp })).toBe(
      '4bf92f3577b34da6a3ce929d0e0e4736'
    );
  });

  it('generates a fallback ID when no header matches', () => {
    const id = resolveCorrelationId({});
    expect(id).toMatch(/^trc_\d+_[a-z0-9]+$/);
  });

  it('skips empty / whitespace-only header values', () => {
    const id = resolveCorrelationId({
      'x-trace-id': '   ',
      'x-correlation-id': 'real-value',
    });
    expect(id).toBe('real-value');
  });

  it('returns the first non-empty entry from an array-valued header', () => {
    const id = resolveCorrelationId({
      'x-trace-id': ['', '  ', 'array-value', 'other'],
    });
    expect(id).toBe('array-value');
  });
});

describe('resolveCorrelationId — options', () => {
  it('honors a custom incomingHeaders order', () => {
    const id = resolveCorrelationId(
      {
        'x-trace-id': 'old-default-wins',
        'x-acme-trace': 'custom-wins',
      },
      { incomingHeaders: ['x-acme-trace', 'x-trace-id'] }
    );
    expect(id).toBe('custom-wins');
  });

  it('disables traceparent parsing when parseTraceparent is false', () => {
    const tp = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const id = resolveCorrelationId(
      { traceparent: tp },
      { parseTraceparent: false }
    );
    // Should fall through to the generator
    expect(id).toMatch(/^trc_\d+_[a-z0-9]+$/);
    expect(id).not.toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('uses the custom generator when no header matches', () => {
    const generator = vi.fn(() => 'custom-generated-id');
    const id = resolveCorrelationId({}, { generateCorrelationId: generator });
    expect(id).toBe('custom-generated-id');
    expect(generator).toHaveBeenCalledOnce();
  });

  it('does not call the generator when a header is present', () => {
    const generator = vi.fn(() => 'should-not-run');
    resolveCorrelationId(
      { 'x-trace-id': 'header-value' },
      { generateCorrelationId: generator }
    );
    expect(generator).not.toHaveBeenCalled();
  });
});

describe('default constants', () => {
  it('DEFAULT_INCOMING_HEADERS contains the documented set', () => {
    expect(DEFAULT_INCOMING_HEADERS).toEqual([
      'x-trace-id',
      'x-correlation-id',
      'x-request-id',
      'request-id',
    ]);
  });

  it('DEFAULT_RESPONSE_HEADERS contains the documented set', () => {
    expect(DEFAULT_RESPONSE_HEADERS).toEqual([
      'X-Trace-Id',
      'X-Correlation-ID',
      'X-Request-ID',
    ]);
  });
});
