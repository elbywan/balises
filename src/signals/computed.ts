/**
 * Computed - A derived reactive value.
 */

import { removeFromArray } from "./signal.js";
import {
  context,
  setContext,
  isBatching,
  enqueueBatchOne,
  registerDisposer,
  onTrack,
  type Subscriber,
  type TrackableSource,
} from "./context.js";

/**
 * A derived reactive value. Automatically tracks dependencies and
 * recomputes when any dependency changes.
 *
 * Uses Object.is() for equality checks to correctly handle NaN values.
 */
export class Computed<T> {
  #fn: (() => T) | undefined;
  #value: T | undefined;
  #dirty = true;
  #computing = false;
  #subs: Subscriber[] = [];
  #targets: Computed<unknown>[] = [];
  #sources: TrackableSource[] = [];
  #sourceIndex = 0;
  #isSlots: Map<T, TrackableSource> | undefined;

  constructor(fn: () => T) {
    this.#fn = fn;
    this.#recompute();

    // Auto-register disposal in current root scope
    registerDisposer(() => this.dispose());
  }

  get value(): T {
    if (this.#dirty) this.#recompute();
    if (context && context !== this) context.trackSource(this);
    if (onTrack.current) onTrack.current(this);
    return this.#value as T;
  }

  subscribe(fn: Subscriber): () => void {
    this.#subs.push(fn);
    return () => removeFromArray(this.#subs, fn);
  }

  dispose(): void {
    this.#fn = undefined;
    const sources = this.#sources;
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      if (source) source.deleteTarget(this);
    }
    this.#sources = [];
    this.#subs.length = 0;
    this.#isSlots?.clear();
  }

  /**
   * Check if the computed's value equals the given value.
   * Enables O(1) selection updates - only the old and new matching values
   * trigger recomputes, not all dependents.
   *
   * @example
   * ```ts
   * const selected = computed(() => items.find(i => i.active)?.id ?? null);
   *
   * // In each row - only 2 rows recompute when selection changes
   * html`<tr class=${() => selected.is(row.id) ? 'danger' : ''}>...`
   * ```
   */
  is(value: T): boolean {
    if (this.#dirty) this.#recompute();
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

  #notifyIsSlot(key: T): void {
    const slot = this.#isSlots!.get(key);
    if (!slot) return;
    // Copy: markDirty can cause disposal which mutates the array
    const targets = slot.targets.slice();
    for (let i = 0; i < targets.length; i++) targets[i]!.markDirty();
  }

  /**
   * Called by sources when accessed during recompute.
   * @internal
   */
  trackSource(source: TrackableSource): void {
    // Skip tracking if disposed (can happen if dispose() is called during #fn execution)
    if (!this.#fn) return;

    const sources = this.#sources;
    const idx = this.#sourceIndex++;

    if (idx < sources.length) {
      if (sources[idx] === source) {
        // Same source at same position - nothing to do
        return;
      }
      // Different source - unlink old ones from this position
      for (let i = idx; i < sources.length; i++) {
        const s = sources[i];
        if (s) s.deleteTarget(this);
      }
      sources.length = idx;
    }
    // Add new source
    sources.push(source);
    source.targets.push(this);
  }

  /**
   * Mark this computed and all its dependents as dirty.
   * Uses a two-phase approach to avoid cascading issues:
   * 1. Mark all dependents as dirty (no subscriber calls)
   * 2. Notify subscribers after all dirty flags are set
   * @internal
   */
  markDirty(): void {
    if (this.#dirty) return;

    // Phase 1: Mark all dependents as dirty, collect subscribers
    const queue: Computed<unknown>[] = [this];
    const toNotify: Array<{ c: Computed<unknown>; old: unknown }> = [];

    for (let i = 0; i < queue.length; i++) {
      const c = queue[i]!;
      if (c.#dirty) continue;
      c.#dirty = true;

      // Propagate to all targets
      const targets = c.#targets;
      for (let j = 0; j < targets.length; j++) {
        const t = targets[j]!;
        if (!t.#dirty) queue.push(t);
      }

      // Collect computeds with subscribers or .is() slots for later notification
      if ((c.#subs.length || c.#isSlots?.size) && c.#fn) {
        toNotify.push({ c, old: c.#value });
      }
    }

    // Phase 2: Notify subscribers (after all dirty flags are set)
    for (let i = 0; i < toNotify.length; i++) {
      const { c, old } = toNotify[i]!;
      const notify = () => {
        if (c.#fn) {
          c.#recompute();
          if (!Object.is(c.#value, old)) {
            // Notify .is() slots for old and new values
            if (c.#isSlots) {
              c.#notifyIsSlot(old as T);
              c.#notifyIsSlot(c.#value as T);
            }
            const subs = c.#subs;
            for (let j = 0; j < subs.length; j++) subs[j]!();
          }
        }
      };
      void (isBatching() ? enqueueBatchOne(notify) : notify());
    }
  }

  /** @internal */
  get targets(): Computed<unknown>[] {
    return this.#targets;
  }

  /** @internal */
  deleteTarget(target: Computed<unknown>): void {
    removeFromArray(this.#targets, target);
  }

  #recompute(): void {
    if (this.#computing || !this.#fn) return;
    this.#computing = true;

    this.#sourceIndex = 0;
    const prevLen = this.#sources.length;

    const prev = context;
    setContext(this);
    try {
      this.#value = this.#fn();
    } finally {
      setContext(prev);

      // Unlink removed sources
      const newLen = this.#sourceIndex;
      if (newLen < prevLen) {
        const sources = this.#sources;
        for (let i = newLen; i < prevLen; i++) {
          const source = sources[i];
          if (source) {
            source.deleteTarget(this);
          }
        }
        sources.length = newLen;
      }

      this.#dirty = false;
      this.#computing = false;
    }
  }
}

/** Create a new computed from the given function. */
export const computed = <T>(fn: () => T) => new Computed(fn);
