/*
=============================================================================
FILE: src/events/EventEmitter.ts
-----------------------------------------------------------------------------
DESCRIPTION:
Provides a generic, type-safe event emitter class. This class is responsible
for managing event listeners and dispatching events, decoupling this logic
from other components.
=============================================================================
*/

/**
 * A map of event names to their listener function signatures.
 * This is a base type for creating specific event maps.
 */
type EventMap = Record<string, (...args: any[]) => void>;
/**
 * A generic, type-safe event emitter.
 * @template T A map of event names to their listener function signatures.
 */
export class EventEmitter<T extends EventMap> {
  private listeners: { [K in keyof T]?: T[K][] } = {};

  /**
   * Registers a listener for a specific event.
   * @param event The name of the event.
   * @param listener The callback function to execute when the event is emitted.
   */
  public on<K extends keyof T>(event: K, listener: T[K]): void {
    const eventListeners = this.listeners[event] ?? [];
    eventListeners.push(listener);
    this.listeners[event] = eventListeners;
  }

  /**
   * Removes a listener for a specific event.
   * @param event The name of the event.
   * @param listener The callback function that was previously registered.
   */
  public off<K extends keyof T>(event: K, listener: T[K]): void {
    const eventListeners = this.listeners[event];
    if (!eventListeners) {
      return;
    }
    this.listeners[event] = eventListeners.filter((l) => l !== listener);
  }

  /**
   * Emits an event to all registered listeners.
   * @param event The name of the event to emit.
   * @param args The arguments to pass to the listeners.
   */
  public emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
    const eventListeners = this.listeners[event];
    if (!eventListeners) return;

    // Iterate over a copy to avoid issues if a listener unregisters itself.
    [...eventListeners].forEach(listener => {
      listener(...args);
    });
  }
}