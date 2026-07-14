import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Exercises the REAL addon load path (`require('syntropylog-native')` inside
 * getNativeAddon), unlike the sibling suite which stubs getNativeAddon out.
 * This is what actually happens on a platform where the optionalDependency
 * was skipped (unsupported target, --omit=optional) or the binary is broken:
 * the manager must fall back to the JS pipeline, report WHY through
 * onSerializationFallback, and keep serializing correctly.
 */

// Controls what requiring 'syntropylog-native' does inside the SUT.
const nativeRequire = vi.hoisted(() => ({
  impl: null as null | ((id: string) => unknown),
}));

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: (url: string | URL) => {
      const real = actual.createRequire(url);
      const patched = (id: string) =>
        id === 'syntropylog-native' && nativeRequire.impl
          ? nativeRequire.impl(id)
          : real(id);
      return Object.assign(patched, real) as NodeJS.Require;
    },
  };
});

import { SerializationManager } from '../../src/serialization/SerializationManager';

function moduleNotFound(): never {
  // Shaped like Node's real error for a missing optional dependency.
  const err = new Error("Cannot find module 'syntropylog-native'") as Error & {
    code: string;
  };
  err.code = 'MODULE_NOT_FOUND';
  throw err;
}

describe('SerializationManager — native addon load failure (real require path)', () => {
  beforeEach(() => {
    nativeRequire.impl = null;
  });

  it('addon not installed: reports it via onSerializationFallback and serves the JS pipeline', () => {
    nativeRequire.impl = moduleNotFound;
    const onSerializationFallback = vi.fn();
    const m = new SerializationManager({ onSerializationFallback });

    const ts = 1700000000000;
    const result = m.serializeDirect('info', 'hello', ts, 'svc', { key: 1 });

    expect(m.isNativeAddonInUse()).toBe(false);
    expect(onSerializationFallback).toHaveBeenCalledTimes(1);
    expect(String(onSerializationFallback.mock.calls[0][0])).toMatch(
      /not installed/
    );
    // The JS pipeline still produces a full, correct entry.
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.level).toBe('info');
    expect(data.message).toBe('hello');
    expect(data.service).toBe('svc');
    expect(data.key).toBe(1);
    expect(data.timestamp).toBe(ts);
  });

  it('addon present but unloadable (broken binary): reports the underlying detail', () => {
    // What napi-rs surfaces when the platform binary exists but cannot load.
    nativeRequire.impl = () => {
      throw new Error('Failed to load native binding');
    };
    const onSerializationFallback = vi.fn();
    const m = new SerializationManager({ onSerializationFallback });

    const result = m.serializeDirect('info', 'msg', 123, 'svc', {});

    expect(m.isNativeAddonInUse()).toBe(false);
    const reason = String(onSerializationFallback.mock.calls[0][0]);
    expect(reason).toMatch(/failed to load/);
    expect(reason).toContain('Failed to load native binding');
    expect(result.success).toBe(true);
  });

  it('reports the load failure ONCE (cached), not once per log entry', () => {
    nativeRequire.impl = moduleNotFound;
    const onSerializationFallback = vi.fn();
    const m = new SerializationManager({ onSerializationFallback });

    m.serializeDirect('info', 'one', 1, 'svc', {});
    m.serializeDirect('info', 'two', 2, 'svc', {});
    m.serializeDirect('info', 'three', 3, 'svc', {});

    expect(onSerializationFallback).toHaveBeenCalledTimes(1);
  });

  it('non-Error throw from the loader still degrades cleanly with a stringified reason', () => {
    nativeRequire.impl = () => {
      // eslint-disable-next-line no-throw-literal
      throw 'dlopen failed';
    };
    const onSerializationFallback = vi.fn();
    const m = new SerializationManager({ onSerializationFallback });

    const result = m.serializeDirect('info', 'msg', 123, 'svc', {});

    expect(result.success).toBe(true);
    expect(String(onSerializationFallback.mock.calls[0][0])).toContain(
      'dlopen failed'
    );
  });
});
