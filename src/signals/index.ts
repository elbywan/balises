/**
 * Reactive signals with automatic dependency tracking.
 *
 * Uses index-based tracking: computed functions are assumed to access
 * their dependencies in the same order on each run. This enables O(1)
 * dependency checks without complex linked-list structures.
 */

export { Signal, signal } from "./signal.js";
export { Computed, computed } from "./computed.js";
export { effect } from "./effect.js";
export { store } from "./store.js";
export { batch, type Subscriber } from "./context.js";

import { Signal } from "./signal.js";
import { Computed } from "./computed.js";

/** Common interface for reactive values (Signal or Computed). */
export interface Reactive<T> {
  readonly value: T;
  subscribe(fn: () => void): () => void;
}

/** Check if a value is a reactive signal or computed. */
export const isSignal = (value: unknown): value is Reactive<unknown> =>
  value instanceof Signal || value instanceof Computed;
