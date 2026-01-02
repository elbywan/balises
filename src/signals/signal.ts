/**
 * Signal - A reactive value container.
 */

import type { Computed } from "./computed.js";
import {
  context,
  isBatching,
  enqueueBatchAll,
  type Subscriber,
} from "./context.js";

/**
 * Remove an item from an array using swap-and-pop (O(1) removal).
 */
export function removeFromArray<T>(array: T[], item: T): void {
  const i = array.indexOf(item);
  if (i >= 0) {
    array[i] = array[array.length - 1]!;
    array.pop();
  }
}

/**
 * A reactive value container. When the value changes, all dependent
 * computeds are marked dirty and subscribers are notified.
 *
 * Uses Object.is() for equality checks to correctly handle NaN values.
 */
export class Signal<T> {
  #value: T;
  #subs: Subscriber[] = [];
  #targets: Computed<unknown>[] = [];

  constructor(value: T) {
    this.#value = value;
  }

  get value(): T {
    if (context) context.trackSource(this);
    return this.#value;
  }

  set value(v: T) {
    if (Object.is(this.#value, v)) return;
    this.#value = v;

    // Mark all dependent computeds as dirty
    const targets = this.#targets;
    for (let i = 0; i < targets.length; i++) {
      targets[i]!.markDirty();
    }

    // Notify subscribers
    if (this.#subs.length > 0) {
      if (isBatching()) {
        enqueueBatchAll(this.#subs);
      } else {
        // Iterate over growing array to call subscribers added during notification
        for (let i = 0; i < this.#subs.length; i++) this.#subs[i]!();
      }
    }
  }

  subscribe(fn: Subscriber): () => void {
    this.#subs.push(fn);
    return () => removeFromArray(this.#subs, fn);
  }

  /**
   * Update the signal value using an updater function.
   *
   * @param fn - Function that receives current value and returns new value
   *
   * @example
   * const count = signal(0);
   * count.update(n => n + 1); // increment
   */
  update(fn: (current: T) => T): void {
    this.value = fn(this.#value);
  }

  /** @internal */
  get targets(): Computed<unknown>[] {
    return this.#targets;
  }

  /** @internal */
  deleteTarget(target: Computed<unknown>): void {
    removeFromArray(this.#targets, target);
  }
}

/** Create a new signal with the given initial value. */
export const signal = <T>(value: T) => new Signal(value);
