/**
 * FILE: tests/events/EventEmitter.test.ts
 * DESCRIPTION: Unit tests for the EventEmitter class.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from '../../src/events/EventEmitter';

// Define a type map for the events we'll be testing.
type TestEvents = {
  noArgs: () => void;
  withArgs: (num: number, str: string) => void;
  singleListener: (data: { value: boolean }) => void;
};

describe('EventEmitter', () => {
  let emitter: EventEmitter<TestEvents>;

  beforeEach(() => {
    emitter = new EventEmitter<TestEvents>();
  });

  describe('on and emit', () => {
    it('should register and call a listener for an event', () => {
      const listener = vi.fn();
      emitter.on('noArgs', listener);
      emitter.emit('noArgs');
      expect(listener).toHaveBeenCalledOnce();
    });

    it('should call multiple listeners for the same event', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      emitter.on('noArgs', listener1);
      emitter.on('noArgs', listener2);

      emitter.emit('noArgs');

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });

    it('should pass arguments correctly to the listener', () => {
      const listener = vi.fn();
      emitter.on('withArgs', listener);
      emitter.emit('withArgs', 42, 'hello');
      expect(listener).toHaveBeenCalledWith(42, 'hello');
    });

    it('should not call listeners for a different event', () => {
      const listenerNoArgs = vi.fn();
      const listenerWithArgs = vi.fn();
      emitter.on('noArgs', listenerNoArgs);
      emitter.on('withArgs', listenerWithArgs);

      emitter.emit('noArgs');

      expect(listenerNoArgs).toHaveBeenCalledOnce();
      expect(listenerWithArgs).not.toHaveBeenCalled();
    });

    it('should not throw when emitting an event with no listeners', () => {
      expect(() => emitter.emit('noArgs')).not.toThrow();
    });
  });

  describe('off', () => {
    it('should remove a specific listener', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      emitter.on('noArgs', listener1);
      emitter.on('noArgs', listener2);

      emitter.off('noArgs', listener1);
      emitter.emit('noArgs');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledOnce();
    });

    it('should do nothing if the listener to remove does not exist', () => {
      const listener1 = vi.fn();
      const nonExistentListener = vi.fn();
      emitter.on('noArgs', listener1);

      expect(() => emitter.off('noArgs', nonExistentListener)).not.toThrow();

      emitter.emit('noArgs');
      expect(listener1).toHaveBeenCalledOnce();
    });

    it('should do nothing when removing a listener for an event with no listeners', () => {
      const listener = vi.fn();
      expect(() => emitter.off('noArgs', listener)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle a listener that unregisters itself during emit', () => {
      const selfRemovingListener = vi.fn(() => {
        emitter.off('noArgs', selfRemovingListener);
      });
      const otherListener = vi.fn();

      emitter.on('noArgs', selfRemovingListener);
      emitter.on('noArgs', otherListener);

      // First emit, both should be called, and the first one removes itself.
      emitter.emit('noArgs');
      expect(selfRemovingListener).toHaveBeenCalledOnce();
      expect(otherListener).toHaveBeenCalledOnce();

      // Second emit, only the second listener should be called.
      emitter.emit('noArgs');
      expect(selfRemovingListener).toHaveBeenCalledOnce(); // Still once
      expect(otherListener).toHaveBeenCalledTimes(2);
    });
  });
});