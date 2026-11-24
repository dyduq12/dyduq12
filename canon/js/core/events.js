/**
 * Minimal decoupled event bus with zero global state.
 */

/**
 * Creates a lightweight pub/sub event bus.
 * @returns {{ on: Function, off: Function, emit: Function }}
 */
export function createEventBus() {
  /** @type {Map<string, Set<(payload?: unknown) => void>>} */
  const listeners = new Map();

  /**
   * Subscribes a handler to an event and returns an unsubscribe function.
   * @param {string} eventName
   * @param {(payload?: unknown) => void} handler
   * @returns {() => void}
   */
  function on(eventName, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler do evento deve ser uma função.');
    }
    let set = listeners.get(eventName);
    if (!set) {
      set = new Set();
      listeners.set(eventName, set);
    }
    set.add(handler);
    return () => off(eventName, handler);
  }

  /**
   * Unsubscribes a handler from an event.
   * @param {string} eventName
   * @param {(payload?: unknown) => void} handler
   */
  function off(eventName, handler) {
    const set = listeners.get(eventName);
    if (!set) {
      return;
    }
    set.delete(handler);
    if (set.size === 0) {
      listeners.delete(eventName);
    }
  }

  /**
   * Emits an event to all registered listeners.
   * @param {string} eventName
   * @param {unknown} [payload]
   */
  function emit(eventName, payload) {
    const set = listeners.get(eventName);
    if (!set) {
      return;
    }
    for (const handler of Array.from(set)) {
      handler(payload);
    }
  }

  return { on, off, emit };
}
