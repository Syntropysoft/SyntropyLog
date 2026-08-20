import { describe, it, expect, vi } from 'vitest';
import { SerializationManager } from '../../src/serialization/SerializationManager';

/**
 * `serializeDualNative` — the branch that serves a transport listed in
 * `masking.exemptTransports`, where one native pass must yield BOTH renderings.
 *
 * Every early return in it is a fail-safe with the same direction: when the addon cannot
 * produce the pair, no raw line comes back, and the Logger (which only treats a transport
 * as exempt while `serializedNativeRaw` is defined) hands the exempt sink the masked line
 * instead. Over-mask, never leak.
 *
 * The rest of the suite never reaches this code: with no addon installed `getNativeAddon()`
 * returns null and the whole branch is skipped. Here the addon is faked so the fail-safes
 * are actually exercised rather than assumed.
 */

const MASKED_LINE = '{"level":"info","message":"ok","cuit":"2*********9"}';
const RAW_LINE = '{"level":"info","message":"ok","cuit":"20-12345678-9"}';
const NATIVE_ERROR = '[SYNTROPYLOG_NATIVE_ERROR] rule set rejected';

type FakeAddon = Record<string, unknown>;

/** An addon that supports everything; override one member to break a specific path. */
function fullAddon(overrides: FakeAddon = {}): FakeAddon {
  return {
    configureNative: vi.fn().mockReturnValue(true),
    fastSerialize: vi.fn().mockReturnValue(MASKED_LINE),
    fastSerializeFromJson: vi.fn().mockReturnValue(MASKED_LINE),
    fastSerializeFromJsonDual: vi
      .fn()
      .mockReturnValue({ masked: MASKED_LINE, raw: RAW_LINE }),
    ...overrides,
  };
}

function withAddon(addon: FakeAddon) {
  const onSerializationFallback = vi.fn();
  const m = new SerializationManager({ onSerializationFallback });
  // Stubbing the resolver covers both call sites: serializeDirect's native branch and the
  // serialize() pipeline it falls through to — which is what makes the degraded line masked.
  (m as any).getNativeAddon = vi.fn().mockReturnValue(addon);
  (m as any).nativeChecked = true;
  return { m, onSerializationFallback };
}

describe('SerializationManager — dual native output for exempt transports', () => {
  it('returns the masked and raw renderings from a single native pass', () => {
    const addon = fullAddon();
    const { m } = withAddon(addon);
    const ts = 1700000000000;

    const result = m.serializeDirect(
      'info',
      'ok',
      ts,
      'svc',
      { cuit: '20-12345678-9' },
      true
    );

    expect(result.serializedNative).toBe(MASKED_LINE);
    expect(result.serializedNativeRaw).toBe(RAW_LINE);
    expect(result.serializer).toBe('native');
    expect(addon.fastSerializeFromJsonDual).toHaveBeenCalledWith(
      'info',
      'ok',
      ts,
      'svc',
      '{"cuit":"20-12345678-9"}'
    );
    // The single-output entry point must not also run: one pass, not two.
    expect(addon.fastSerializeFromJson).not.toHaveBeenCalled();
  });

  it('never asks for the raw rendering when no transport is exempt', () => {
    const addon = fullAddon();
    const { m } = withAddon(addon);

    const result = m.serializeDirect('info', 'ok', 1, 'svc', { cuit: 'x' });

    expect(addon.fastSerializeFromJsonDual).not.toHaveBeenCalled();
    expect(addon.fastSerializeFromJson).toHaveBeenCalled();
    expect(result.serializedNative).toBe(MASKED_LINE);
    expect(result.serializedNativeRaw).toBeUndefined();
  });

  it('yields no raw line when the addon predates the dual entry point', () => {
    // A consumer on an older prebuilt binary: the function simply is not there.
    const addon = fullAddon({ fastSerializeFromJsonDual: undefined });
    const { m } = withAddon(addon);

    const result = m.serializeDirect(
      'info',
      'ok',
      1,
      'svc',
      { cuit: 'x' },
      true
    );

    expect(result.serializedNativeRaw).toBeUndefined();
    expect(result.serializedNative).toBe(MASKED_LINE);
    expect(result.success).toBe(true);
  });

  it('yields no raw line when the metadata cannot be stringified', () => {
    const circular: Record<string, unknown> = { cuit: '20-12345678-9' };
    circular.self = circular;
    const addon = fullAddon();
    const { m } = withAddon(addon);

    const result = m.serializeDirect('info', 'ok', 1, 'svc', circular, true);

    // It bails before calling into Rust: a circular payload never reaches the addon.
    expect(addon.fastSerializeFromJsonDual).not.toHaveBeenCalled();
    expect(result.serializedNativeRaw).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it('discards the pair when the masked rendering came back as a native error', () => {
    const addon = fullAddon({
      fastSerializeFromJsonDual: vi
        .fn()
        .mockReturnValue({ masked: NATIVE_ERROR, raw: RAW_LINE }),
    });
    const { m } = withAddon(addon);

    const result = m.serializeDirect('info', 'ok', 1, 'svc', {}, true);

    expect(result.serializedNative).not.toContain('SYNTROPYLOG_NATIVE_ERROR');
    expect(result.serializedNativeRaw).toBeUndefined();
  });

  it('discards the pair when the RAW rendering came back as a native error', () => {
    // The masked half looks fine here — shipping the raw half regardless would send an
    // error marker to the audit sink in place of the entry it is supposed to preserve.
    const addon = fullAddon({
      fastSerializeFromJsonDual: vi
        .fn()
        .mockReturnValue({ masked: MASKED_LINE, raw: NATIVE_ERROR }),
    });
    const { m } = withAddon(addon);

    const result = m.serializeDirect('info', 'ok', 1, 'svc', {}, true);

    expect(result.serializedNativeRaw).toBeUndefined();
    expect(result.serializedNative).toBe(MASKED_LINE);
  });

  it('reports a throw from the dual entry point and still serves a masked line', () => {
    const boom = new Error('native crash');
    const addon = fullAddon({
      fastSerializeFromJsonDual: vi.fn().mockImplementation(() => {
        throw boom;
      }),
    });
    const { m, onSerializationFallback } = withAddon(addon);

    const result = m.serializeDirect('info', 'ok', 1, 'svc', {}, true);

    expect(onSerializationFallback).toHaveBeenCalledWith(boom);
    expect(result.serializedNativeRaw).toBeUndefined();
    expect(result.success).toBe(true);
  });
});
