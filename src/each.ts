/**
 * Keyed list rendering plugin for templates.
 *
 * Provides efficient, keyed list rendering with minimal DOM operations.
 * Supports signals, computeds, getters, and plain arrays.
 *
 * Two forms:
 * - Two-arg: uses object reference as key, render receives raw item
 * - Three-arg: uses explicit keyFn, render receives ReadonlySignal<T> for DOM reuse
 *
 * @example
 * ```ts
 * import { html as baseHtml, signal } from "balises";
 * import eachPlugin, { each } from "balises/each";
 *
 * const html = baseHtml.with(eachPlugin);
 * const items = signal([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
 *
 * // Three-arg form: DOM reused when keys match
 * html`<ul>
 *   ${each(items, i => i.id, itemSignal => html`<li>${() => itemSignal.value.name}</li>`)}
 * </ul>`.render();
 * ```
 */

import {
  computed,
  isSignal,
  signal,
  ReadonlySignal,
  type Reactive,
} from "./signals/index.js";
import { Signal } from "./signals/signal.js";
import { Template, type InterpolationPlugin } from "./template.js";

/** Marker symbol for each() descriptors */
const EACH = Symbol("each");

/** Type guard for primitives */
const isPrimitive = (v: unknown): v is string | number | boolean | symbol =>
  typeof v !== "object" && typeof v !== "function";

/** Each descriptor - returned by each() */
export interface EachDescriptor<T> {
  readonly [EACH]: true;
  /** @internal List source (array, signal, or getter) */
  __list__: T[] | Reactive<T[]> | (() => T[]);
  /** @internal Key extraction function */
  __keyFn__: (item: T, index: number) => unknown;
  /** @internal Render function for each item (type varies by form) */
  __renderFn__:
    | ((item: T, index: number) => Template)
    | ((item: ReadonlySignal<T>, index: number) => Template);
  /** @internal Whether this is the three-arg (keyed) form */
  __keyed__: boolean;
}

/** Cache entry for list items */
interface CacheEntry<T> {
  nodes: Node[];
  dispose: () => void;
  item: T;
  itemSignal?: Signal<T>;
}

/**
 * Render content and insert nodes before marker.
 * Handles Templates and primitives.
 */
function insertContent(
  marker: Comment,
  value: unknown,
  nodes: Node[],
  disposers: (() => void)[],
): void {
  const parent = marker.parentNode!;

  for (const item of Array.isArray(value) ? value : [value]) {
    if (item instanceof Template) {
      const { fragment, dispose } = item.render();
      disposers.push(dispose);
      nodes.push(...fragment.childNodes);
      parent.insertBefore(fragment, marker);
    } else if (item != null && typeof item !== "boolean") {
      const node = document.createTextNode(String(item));
      nodes.push(node);
      parent.insertBefore(node, marker);
    }
  }
}

/**
 * Create a keyed list descriptor.
 *
 * Two-argument form: uses object reference as key (or index for primitives).
 * Render function receives the raw item. DOM is reused only when object reference matches.
 *
 * Three-argument form: uses explicit keyFn.
 * Render function receives a ReadonlySignal<T> wrapping the item.
 * DOM is reused when keys match, and the signal is updated with new item data.
 *
 * @example
 * ```ts
 * // Two-arg: object reference as key, receives raw item
 * each(items, item => html`<li>${item.name}</li>`)
 *
 * // Three-arg: explicit key, receives ReadonlySignal for DOM reuse
 * each(items, item => item.id, itemSignal => html`<li>${() => itemSignal.value.name}</li>`)
 * ```
 */
export function each<T>(
  list: T[] | Reactive<T[]> | (() => T[]),
  renderFn: (item: T, index: number) => Template,
): EachDescriptor<T>;
export function each<T>(
  list: T[] | Reactive<T[]> | (() => T[]),
  keyFn: (item: T, index: number) => unknown,
  renderFn: (item: ReadonlySignal<T>, index: number) => Template,
): EachDescriptor<T>;
export function each<T>(
  list: T[] | Reactive<T[]> | (() => T[]),
  keyFnOrRenderFn:
    | ((item: T, index: number) => unknown)
    | ((item: T, index: number) => Template),
  maybeRenderFn?: (item: ReadonlySignal<T>, index: number) => Template,
): EachDescriptor<T> {
  const hasExplicitKeyFn = maybeRenderFn !== undefined;
  const keyFn = hasExplicitKeyFn
    ? (keyFnOrRenderFn as (item: T, index: number) => unknown)
    : (item: T, index: number) => (isPrimitive(item) ? index : item);
  const renderFn = hasExplicitKeyFn
    ? maybeRenderFn
    : (keyFnOrRenderFn as (item: T, index: number) => Template);

  return {
    [EACH]: true,
    __list__: list,
    __keyFn__: keyFn,
    __renderFn__: renderFn,
    __keyed__: hasExplicitKeyFn,
  };
}

/**
 * Plugin that handles each() descriptors.
 */
const eachPlugin: InterpolationPlugin = (value) => {
  if (!(value && typeof value === "object" && EACH in value)) return null;

  return (marker, disposers) => {
    const desc = value as EachDescriptor<unknown>;
    bindEach(desc, marker, disposers);
  };
};

export default eachPlugin;

/**
 * Bind an each() descriptor to a marker position.
 */
function bindEach<T>(
  desc: EachDescriptor<T>,
  marker: Comment,
  disposers: (() => void)[],
): void {
  const { __list__, __keyFn__, __renderFn__, __keyed__ } = desc;
  const parent = marker.parentNode!;

  // Get current array value
  const getList = (): T[] => {
    if (typeof __list__ === "function" && !isSignal(__list__)) {
      return (__list__ as () => T[])();
    }
    return isSignal(__list__) ? (__list__.value as T[]) : (__list__ as T[]);
  };

  // Wrap in computed for reactivity
  const listComputed = computed(getList);

  // Cache: key -> { nodes, dispose, item, itemSignal? }
  const cache = new Map<unknown, CacheEntry<T>>();

  // Track previous order for LIS-based reordering
  let prevKeys: unknown[] = [];

  const reconcile = () => {
    const items = listComputed.value;
    const seenKeys = new Set<unknown>();
    const newKeys: unknown[] = [];
    const newEntries: CacheEntry<T>[] = [];
    let hasDuplicateWarning = false;

    // Process items, create/reuse entries
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const key = __keyFn__(item, i);

      // Warn and skip duplicates (only warn once)
      if (seenKeys.has(key)) {
        if (!hasDuplicateWarning) {
          console.warn(`[each] Duplicate key: ${String(key)}. Skipping.`);
          hasDuplicateWarning = true;
        }
        continue;
      }
      seenKeys.add(key);

      const cached = cache.get(key);

      if (__keyed__) {
        // Three-arg form: reuse if key exists, update signal
        if (cached) {
          cached.itemSignal!.value = item;
          cached.item = item;
          newKeys.push(key);
          newEntries.push(cached);
        } else {
          // Create new entry with signal
          const itemSignal = signal(item);
          const readonlySignal = new ReadonlySignal(itemSignal);
          const nodes: Node[] = [];
          const itemDisposers: (() => void)[] = [];
          insertContent(
            marker,
            (
              __renderFn__ as (
                item: ReadonlySignal<T>,
                index: number,
              ) => Template
            )(readonlySignal, i),
            nodes,
            itemDisposers,
          );
          const entry: CacheEntry<T> = {
            nodes,
            dispose: () => itemDisposers.forEach((d) => d()),
            item,
            itemSignal,
          };
          cache.set(key, entry);
          newKeys.push(key);
          newEntries.push(entry);
        }
      } else {
        // Two-arg form: reuse only if same object reference
        if (cached && cached.item === item) {
          newKeys.push(key);
          newEntries.push(cached);
        } else {
          // Dispose old entry if key exists but item changed
          if (cached) {
            cached.dispose();
            for (const node of cached.nodes) {
              (node as ChildNode).remove();
            }
            cache.delete(key);
          }
          // Create new entry
          const nodes: Node[] = [];
          const itemDisposers: (() => void)[] = [];
          insertContent(
            marker,
            (__renderFn__ as (item: T, index: number) => Template)(item, i),
            nodes,
            itemDisposers,
          );
          const entry: CacheEntry<T> = {
            nodes,
            dispose: () => itemDisposers.forEach((d) => d()),
            item,
          };
          cache.set(key, entry);
          newKeys.push(key);
          newEntries.push(entry);
        }
      }
    }

    // Remove stale entries
    for (const [key, entry] of cache) {
      if (!seenKeys.has(key)) {
        entry.dispose();
        for (const node of entry.nodes) {
          (node as ChildNode).remove();
        }
        cache.delete(key);
      }
    }

    // Reorder nodes using LIS optimization
    reorderNodes(newEntries, newKeys, prevKeys, marker, parent);
    prevKeys = newKeys;
  };

  // Initial render and subscribe
  reconcile();
  const unsub = listComputed.subscribe(reconcile);

  disposers.push(() => {
    unsub();
    listComputed.dispose();
    for (const entry of cache.values()) {
      entry.dispose();
      for (const node of entry.nodes) {
        (node as ChildNode).remove();
      }
    }
    cache.clear();
  });
}

/**
 * Reorder nodes to match the new order using LIS optimization.
 *
 * Uses Longest Increasing Subsequence to minimize DOM moves.
 * Only nodes that are NOT part of the LIS need to be moved.
 */
function reorderNodes<T>(
  entries: CacheEntry<T>[],
  newKeys: unknown[],
  prevKeys: unknown[],
  marker: Comment,
  parent: ParentNode,
): void {
  const len = entries.length;
  if (len === 0) return;

  // Skip reordering on first render - nodes are already in correct order
  if (prevKeys.length === 0) return;

  // Build a map of key -> old index
  const prevIndexMap = new Map<unknown, number>();
  for (let i = 0; i < prevKeys.length; i++) {
    prevIndexMap.set(prevKeys[i], i);
  }

  // Build array of old indices for keys that existed before (-1 for new)
  const oldIndices: number[] = [];
  for (let i = 0; i < len; i++) {
    const oldIdx = prevIndexMap.get(newKeys[i]);
    oldIndices.push(oldIdx !== undefined ? oldIdx : -1);
  }

  // Find LIS of old indices (only considering items that existed before)
  const lisIndices = longestIncreasingSubsequence(oldIndices);
  const lisSet = new Set(lisIndices);

  // Move nodes that are NOT in the LIS
  // Process in reverse order, using insertBefore to place nodes
  let insertionPoint: Node | null = marker;

  for (let i = len - 1; i >= 0; i--) {
    const entry = entries[i]!;
    const nodes = entry.nodes;

    if (!lisSet.has(i)) {
      // This item needs to be moved
      for (let j = nodes.length - 1; j >= 0; j--) {
        parent.insertBefore(nodes[j]!, insertionPoint);
      }
    }

    // Update insertion point to the first node of current entry
    if (nodes.length > 0) {
      insertionPoint = nodes[0]!;
    }
  }
}

/**
 * Find the longest increasing subsequence indices.
 * Returns the indices in the input array that form the LIS.
 *
 * Uses binary search for O(n log n) complexity.
 * Items with value -1 (new items) are never part of the LIS.
 */
function longestIncreasingSubsequence(arr: number[]): number[] {
  const len = arr.length;
  if (len === 0) return [];

  // tails[i] = index in arr of smallest tail element for LIS of length i+1
  const tails: number[] = [];
  // predecessor[i] = index in arr of element before arr[i] in the LIS
  const predecessor: number[] = new Array(len).fill(-1);

  for (let i = 0; i < len; i++) {
    const val = arr[i]!;
    // Skip new items (-1)
    if (val === -1) continue;

    // Binary search for position in tails
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[tails[mid]!]! < val) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // lo is the position where val should go
    if (lo > 0) {
      predecessor[i] = tails[lo - 1]!;
    }

    if (lo === tails.length) {
      tails.push(i);
    } else {
      tails[lo] = i;
    }
  }

  // Reconstruct LIS indices
  const result: number[] = [];
  let k = tails.length > 0 ? tails[tails.length - 1]! : -1;
  while (k !== -1) {
    result.push(k);
    k = predecessor[k]!;
  }
  result.reverse();

  return result;
}
