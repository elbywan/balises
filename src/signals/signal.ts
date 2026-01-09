/**
 * Signal - A reactive value container.
 */

import type { Computed } from "./computed.js";
import {
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
 * A reactive value container. When the value changes, all dependent
 * computeds are marked dirty and subscribers are notified.
 *
 * Uses Object.is() for equality checks to correctly handle NaN values.
 */
export class Signal<T> {
  #value: T;
  #subs: Subscriber[] = [];
  #targets: Computed<unknown>[] = [];
  #isSlots: Map<T, TrackableSource> | undefined;

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

    // Notify .is() slots for old and new values (O(1) selection updates)
    if (this.#isSlots) {
      this.#notifyIsSlot(prev);
      this.#notifyIsSlot(v);
    }

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
        // Copy array to avoid issues if subscribers modify the array during iteration
        const subs = [...this.#subs];
        for (let i = 0; i < subs.length; i++) subs[i]!();
      }
    }
  }

  #notifyIsSlot(key: T): void {
    const slot = this.#isSlots!.get(key);
    if (!slot) return;
    // Copy: markDirty can cause disposal which mutates the array
    const targets = slot.targets.slice();
    for (let i = 0; i < targets.length; i++) targets[i]!.markDirty();
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
      if (!this.#isSlots) this.#isSlots = new Map();
      let slot = this.#isSlots.get(value);
      if (!slot) {
        const targets: Computed<unknown>[] = [];
        slot = { targets, deleteTarget: (t) => removeFromArray(targets, t) };
        this.#isSlots.set(value, slot);
      }
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
}
