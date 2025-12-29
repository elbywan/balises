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
    if (this.#value === v) return;
    this.#value = v;

    // Mark all dependent computeds as dirty
    const targets = this.#targets;
    for (let i = 0; i < targets.length; i++) {
      targets[i]!.markDirty();
    }

    // Notify subscribers
    if (this.#subs.length) {
      if (isBatching()) {
        enqueueBatchAll(this.#subs);
      } else {
        for (let i = 0; i < this.#subs.length; i++) this.#subs[i]!();
      }
    }
  }

  subscribe(fn: Subscriber): () => void {
    this.#subs.push(fn);
    return () => removeFromArray(this.#subs, fn);
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
