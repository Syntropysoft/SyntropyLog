import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../../src/events/EventEmitter';

// Define a type for our test events to ensure type safety in tests
type TestEvents = {
  simple: () => void;
  withArgs: (a: number, b: string) => void;
  dataEvent: (payload: { id: number; data: string }) => void;
};

describe('EventEmitter', () => {
  it('should register and emit a simple event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('simple', listener);
    emitter.emit('simple');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should emit an event with arguments to the listener', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = vi.fn();

    emitter.on('withArgs', listener);
    emitter.emit('withArgs', 42, 'hello');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(42, 'hello');
  });

  it('should call multiple listeners for the same event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('simple', listener1);
    emitter.on('simple', listener2);
    emitter.emit('simple');

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should remove a specific listener with off()', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('simple', listener1);
    emitter.on('simple', listener2);

    emitter.off('simple', listener1);
    emitter.emit('simple');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should not throw an error when emitting an event with no listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    expect(() => emitter.emit('simple')).not.toThrow();
  });

  it('should not throw an error when trying to remove a listener that does not exist', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = vi.fn();
    expect(() => emitter.off('simple', listener)).not.toThrow();
  });

  it('should handle a listener unregistering itself during an emit cycle', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = vi.fn();

    const listener2 = vi.fn(() => {
      emitter.off('simple', listener2);
    });

    const listener3 = vi.fn();

    emitter.on('simple', listener1);
    emitter.on('simple', listener2);
    emitter.on('simple', listener3);

    emitter.emit('simple');

    // All listeners should be called once, because we iterate over a copy.
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener3).toHaveBeenCalledTimes(1);

    // Now, emit again to confirm listener2 was removed.
    emitter.emit('simple');
    expect(listener1).toHaveBeenCalledTimes(2);
    expect(listener2).toHaveBeenCalledTimes(1); // Not called again
    expect(listener3).toHaveBeenCalledTimes(2);
  });
});