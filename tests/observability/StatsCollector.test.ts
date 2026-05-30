import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StatsCollector } from '../../src/observability/StatsCollector';

describe('StatsCollector', () => {
  let stats: StatsCollector;

  beforeEach(() => {
    stats = new StatsCollector();
  });

  describe('initial state', () => {
    it('reports zeroed counters and a null initializedAt before markInitialized', () => {
      const snap = stats.snapshot();
      expect(snap.initializedAt).toBeNull();
      expect(snap.uptimeMs).toBe(0);
      expect(snap.failures).toEqual({
        log: 0,
        transport: 0,
        serializationFallback: 0,
        masking: 0,
        step: {},
      });
    });
  });

  describe('counters', () => {
    it('increments each failure counter independently', () => {
      stats.recordLogFailure();
      stats.recordLogFailure();
      stats.recordTransportError();
      stats.recordSerializationFallback();
      stats.recordSerializationFallback();
      stats.recordSerializationFallback();
      stats.recordMaskingError();

      const snap = stats.snapshot();
      expect(snap.failures.log).toBe(2);
      expect(snap.failures.transport).toBe(1);
      expect(snap.failures.serializationFallback).toBe(3);
      expect(snap.failures.masking).toBe(1);
    });

    it('groups step errors by step name', () => {
      stats.recordStepError('hygiene');
      stats.recordStepError('sanitization');
      stats.recordStepError('hygiene');
      stats.recordStepError('hygiene');

      expect(stats.snapshot().failures.step).toEqual({
        hygiene: 3,
        sanitization: 1,
      });
    });
  });

  describe('markInitialized and uptime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-26T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('stamps initializedAt on first call and is idempotent', () => {
      stats.markInitialized();
      const first = stats.snapshot().initializedAt;
      expect(first).not.toBeNull();

      vi.advanceTimersByTime(5_000);
      stats.markInitialized();
      const second = stats.snapshot().initializedAt;

      expect(second).toBe(first);
    });

    it('reports uptimeMs as wall-clock delta since markInitialized', () => {
      stats.markInitialized();
      vi.advanceTimersByTime(7_500);
      expect(stats.snapshot().uptimeMs).toBe(7_500);
    });

    it('keeps uptimeMs at 0 until markInitialized is called', () => {
      vi.advanceTimersByTime(10_000);
      expect(stats.snapshot().uptimeMs).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears all counters and the init stamp', () => {
      stats.markInitialized();
      stats.recordLogFailure();
      stats.recordTransportError();
      stats.recordStepError('hygiene');

      stats.reset();

      const snap = stats.snapshot();
      expect(snap.initializedAt).toBeNull();
      expect(snap.uptimeMs).toBe(0);
      expect(snap.failures).toEqual({
        log: 0,
        transport: 0,
        serializationFallback: 0,
        masking: 0,
        step: {},
      });
    });
  });

  describe('snapshot isolation', () => {
    it('returns a fresh object on each call — mutations on one do not leak to the next', () => {
      stats.recordLogFailure();
      const first = stats.snapshot();
      stats.recordLogFailure();
      const second = stats.snapshot();

      expect(first.failures.log).toBe(1);
      expect(second.failures.log).toBe(2);
    });

    it('snapshots step map as a plain object, not a Map reference', () => {
      stats.recordStepError('hygiene');
      const snap = stats.snapshot();
      // Should be a record, callers can iterate with Object.entries
      expect(Object.prototype.toString.call(snap.failures.step)).toBe(
        '[object Object]'
      );
      expect(snap.failures.step.hygiene).toBe(1);
    });
  });
});
