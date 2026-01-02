/**
 * Store - Reactive wrapper for plain objects.
 */

import { Signal } from "./signal.js";

const STORE = Symbol();

/**
 * Create a reactive store from a plain object.
 * Each property becomes a signal, and nested objects are recursively wrapped.
 */
export function store<T extends object>(obj: T): T {
  const signals = new Map<string | symbol, Signal<unknown>>();

  /** Recursively wrap nested objects and arrays */
  const wrap = (value: unknown): unknown => {
    // Fast path for primitives and null
    if (value == null || typeof value !== "object") {
      return value;
    }
    // Already a store
    if (STORE in value) {
      return value;
    }
    // Arrays: map and wrap items
    if (Array.isArray(value)) {
      return value.map(wrap);
    }
    // Plain objects: recursively wrap
    if (Object.getPrototypeOf(value) === Object.prototype) {
      return store(value as Record<string, unknown>);
    }
    // Other objects (Date, Map, etc.) - return as-is
    return value;
  };

  /** Get or create a signal for a property */
  const getSignal = (key: string | symbol, initialValue: unknown) => {
    let sig = signals.get(key);
    if (!sig) {
      sig = new Signal(wrap(initialValue));
      signals.set(key, sig);
    }
    return sig;
  };

  return new Proxy(obj, {
    get(target, key) {
      // Allow symbol access (for STORE check and other internal symbols)
      if (typeof key === "symbol") {
        return target[key as keyof T];
      }
      return getSignal(key, target[key as keyof T]).value;
    },

    set(target, key, value) {
      if (typeof key === "symbol") {
        target[key as keyof T] = value;
        return true;
      }
      const wrapped = wrap(value);
      getSignal(key, target[key as keyof T]).value = wrapped;
      target[key as keyof T] = wrapped as T[keyof T];
      return true;
    },

    has(target, key) {
      return key === STORE || key in target;
    },
  });
}
