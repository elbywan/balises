/**
 * Signal - A reactive value container.
 */

import type { Computed } from "./computed.js";
import {
  batch,
  context,
  isBatching,
  enqueueBatchAll,
  onTrack,
  type Subscriber,
  type TrackableSource,
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
 * A tracking slot for .is() comparisons.
 * Self-removes from parent map when all targets are gone.
 * @internal
 */
export class IsSlot<T> implements TrackableSource {
  targets: Computed<unknown>[] = [];
  #map: Map<T, IsSlot<T>>;
  #key: T;

  constructor(map: Map<T, IsSlot<T>>, key: T) {
    this.#map = map;
    this.#key = key;
  }

  deleteTarget(target: Computed<unknown>): void {
    removeFromArray(this.targets, target);
    // Self-cleanup when empty
    if (!this.targets.length) {
      this.#map.delete(this.#key);
    }
  }

  /** Notify all targets that they may need to recompute */
  notify(): void {
    // Copy: markDirty can cause disposal which mutates the array
    const copy = this.targets.slice();
    for (let i = 0; i < copy.length; i++) copy[i]!.markDirty();
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
  #isSlots: Map<T, IsSlot<T>> | undefined;

  constructor(value: T) {
    this.#value = value;
  }

  get value(): T {
    if (context) context.trackSource(this);
    if (onTrack.current) onTrack.current(this);
    return this.#value;
  }

  set value(v: T) {
    if (Object.is(this.#value, v)) return;
    const prev = this.#value;
    this.#value = v;

    const targets = this.#targets;
    const isSlots = this.#isSlots;

    // Fast path: no .is() slots, just notify regular targets
    if (!isSlots) {
      for (let i = 0; i < targets.length; i++) {
        targets[i]!.markDirty();
      }
    } else {
      // When .is() slots exist, batch all notifications so markDirty()
      // defers recomputation. This allows the #dirty flag to remain true
      // across multiple markDirty() calls, preventing double recomputation
      // when a computed tracks both .value and .is() on the same signal.
      batch(() => {
        isSlots.get(prev)?.notify();
        isSlots.get(v)?.notify();
        for (let i = 0; i < targets.length; i++) {
          targets[i]!.markDirty();
        }
      });
    }

    // Notify subscribers
    if (this.#subs.length) {
      if (isBatching()) {
        enqueueBatchAll(this.#subs);
      } else {
        // Copy array to avoid issues if subscribers modify the array during iteration
        const subs = this.#subs.slice();
        for (let i = 0; i < subs.length; i++) subs[i]!();
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

  /**
   * Read the signal value without tracking dependencies.
   * Useful in event handlers where you want the current value
   * but don't want to create a reactive dependency.
   *
   * @example
   * const count = signal(0);
   * // In an event handler - no dependency tracking
   * button.onclick = () => console.log(count.peek());
   */
  peek(): T {
    return this.#value;
  }

  /**
   * Check if the signal's value equals the given value.
   * Enables O(1) selection updates - only the old and new matching values
   * trigger recomputes, not all dependents.
   *
   * @example
   * ```ts
   * const selected = signal<number | null>(null);
   *
   * // In each row - only 2 rows recompute when selection changes
   * html`<tr class=${() => selected.is(row.id) ? 'danger' : ''}>...`
   * ```
   */
  is(value: T): boolean {
    if (context) {
      const slots = this.#isSlots ?? (this.#isSlots = new Map());
      let slot = slots.get(value);
      if (!slot) slots.set(value, (slot = new IsSlot(slots, value)));
      context.trackSource(slot);
    }
    return Object.is(this.#value, value);
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

/**
 * A read-only view of a Signal.
 * Provides reactive access without allowing external mutation.
 * Used by `each()` to pass item signals to render functions.
 */
export class ReadonlySignal<T> {
  #signal: Signal<T>;

  /** @internal */
  constructor(signal: Signal<T>) {
    this.#signal = signal;
  }

  get value(): T {
    return this.#signal.value;
  }

  /**
   * Read the signal value without tracking dependencies.
   * Useful in event handlers where you want the current value
   * but don't want to create a reactive dependency.
   */
  peek(): T {
    return this.#signal.peek();
  }

  subscribe(fn: Subscriber): () => void {
    return this.#signal.subscribe(fn);
  }

  /**
   * Check if the signal's value equals the given value.
   * Enables O(1) selection updates.
   */
  is(value: T): boolean {
    return this.#signal.is(value);
  }
}
