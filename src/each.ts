/**
 * Keyed list rendering plugin for templates.
 *
 * @example
 * ```ts
 * import { html as baseHtml, signal } from "balises";
 * import eachPlugin, { each } from "balises/each";
 *
 * const html = baseHtml.with(eachPlugin);
 * const items = signal([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
 *
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

const EACH = Symbol("each");

/** Each descriptor returned by each() */
export interface EachDescriptor<T> {
  readonly [EACH]: true;
  /** @internal */ __list__: T[] | Reactive<T[]> | (() => T[]);
  /** @internal */ __keyFn__: (item: T, index: number) => unknown;
  /** @internal */ __renderFn__: (
    item: ReadonlySignal<T>,
    index: number,
  ) => Template;
}

interface CacheEntry<T> {
  nodes: Node[];
  dispose: () => void;
  itemSignal: Signal<T>;
}

/**
 * Create a keyed list descriptor for efficient list rendering.
 *
 * @param list - Array, signal, or getter returning the list
 * @param keyFn - Extract unique key from each item
 * @param renderFn - Render function receiving ReadonlySignal<T> for reactive updates
 */
export function each<T>(
  list: T[] | Reactive<T[]> | (() => T[]),
  keyFn: (item: T, index: number) => unknown,
  renderFn: (item: ReadonlySignal<T>, index: number) => Template,
): EachDescriptor<T> {
  return {
    [EACH]: true,
    __list__: list,
    __keyFn__: keyFn,
    __renderFn__: renderFn,
  };
}

/** Plugin that handles each() descriptors in templates. */
const eachPlugin: InterpolationPlugin = (value) => {
  if (!(value && typeof value === "object" && EACH in value)) return null;
  return (marker, disposers) =>
    bindEach(value as EachDescriptor<unknown>, marker, disposers);
};

export default eachPlugin;

/**
 * Bind an each() descriptor to a marker position in the DOM.
 *
 * Architecture:
 * - List renders between startMarker and marker (end)
 * - `oldKeys[]` tracks current DOM order
 * - `cache` Map provides O(1) entry lookup by key
 *
 * Two-pointer reconciliation algorithm handles common cases in O(n):
 * 1. Head-to-head match → update in place
 * 2. Tail-to-tail match → update in place
 * 3. Cross match (head↔tail) → move DOM nodes
 * 4. Fallback → use maps for arbitrary reorderings
 */
function bindEach<T>(
  desc: EachDescriptor<T>,
  marker: Comment,
  disposers: (() => void)[],
): void {
  const { __list__, __keyFn__, __renderFn__ } = desc;
  const parent = marker.parentNode!;
  const startMarker = document.createComment("");
  parent.insertBefore(startMarker, marker);

  // Normalize list access
  const getList = (): T[] => {
    const list = __list__;
    if (typeof list === "function" && !isSignal(list)) return list();
    return isSignal(list) ? (list.value as T[]) : list;
  };

  const listComputed = computed(getList);
  let oldKeys: unknown[] = [];
  const cache = new Map<unknown, CacheEntry<T>>();

  // --- Entry helpers ---

  const createEntry = (
    item: T,
    key: unknown,
    index: number,
    ref: Node,
  ): CacheEntry<T> => {
    const itemSignal = signal(item);
    const { fragment, dispose } = __renderFn__(
      new ReadonlySignal(itemSignal),
      index,
    ).render();
    const nodes = [...fragment.childNodes];
    parent.insertBefore(fragment, ref);
    const entry: CacheEntry<T> = { nodes, dispose, itemSignal };
    cache.set(key, entry);
    return entry;
  };

  const removeEntry = (key: unknown): void => {
    const entry = cache.get(key);
    if (!entry) return;
    entry.dispose();
    for (const node of entry.nodes) (node as ChildNode).remove();
    cache.delete(key);
  };

  const moveEntry = (entry: CacheEntry<T>, ref: Node | null): void => {
    for (const node of entry.nodes) parent.insertBefore(node, ref);
  };

  const getFirstNode = (key: unknown): Node =>
    cache.get(key)?.nodes[0] ?? marker;

  const getNextSibling = (key: unknown): Node => {
    const nodes = cache.get(key)?.nodes;
    return nodes?.length
      ? (nodes[nodes.length - 1]!.nextSibling ?? marker)
      : marker;
  };

  // --- Reconciliation ---

  const reconcile = () => {
    const items = listComputed.value;
    const newLen = items.length;
    const oldLen = oldKeys.length;

    // Fast path: empty list
    if (newLen === 0) {
      if (oldLen > 0) {
        parent.replaceChildren(startMarker, marker);
        for (const entry of cache.values()) entry.dispose();
        cache.clear();
        oldKeys = [];
      }
      return;
    }

    // Fast path: first render
    if (oldLen === 0) {
      const newKeys: unknown[] = [];
      const seen = new Set<unknown>();
      let warnedDupe = false;
      for (let i = 0; i < newLen; i++) {
        const item = items[i]!;
        const key = __keyFn__(item, i);
        if (seen.has(key)) {
          if (!warnedDupe) {
            console.warn(`[each] Duplicate key: ${String(key)}`);
            warnedDupe = true;
          }
          continue;
        }
        seen.add(key);
        createEntry(item, key, i, marker);
        newKeys.push(key);
      }
      oldKeys = newKeys;
      return;
    }

    // Build new keys array, marking duplicates as undefined
    const newKeys: unknown[] = new Array(newLen);
    const seen = new Set<unknown>();
    let hasDupes = false;

    for (let i = 0; i < newLen; i++) {
      const key = __keyFn__(items[i]!, i);
      if (seen.has(key)) {
        if (!hasDupes) {
          console.warn(`[each] Duplicate key: ${String(key)}`);
          hasDupes = true;
        }
        newKeys[i] = undefined;
      } else {
        seen.add(key);
        newKeys[i] = key;
      }
    }

    // Two-pointer reconciliation
    let oldHead = 0,
      oldTail = oldLen - 1;
    let newHead = 0,
      newTail = newLen - 1;

    // Lazily built maps for fallback path
    let newKeyToIdx: Map<unknown, number> | undefined;
    let oldKeyToIdx: Map<unknown, number> | undefined;

    while (oldHead <= oldTail && newHead <= newTail) {
      // Skip processed/duplicate keys
      if (newKeys[newHead] === undefined) {
        newHead++;
        continue;
      }
      if (newKeys[newTail] === undefined) {
        newTail--;
        continue;
      }

      const oldHeadKey = oldKeys[oldHead];
      const oldTailKey = oldKeys[oldTail];
      const newHeadKey = newKeys[newHead];
      const newTailKey = newKeys[newTail];

      // Skip already-moved old keys
      if (oldHeadKey === undefined) {
        oldHead++;
        continue;
      }
      if (oldTailKey === undefined) {
        oldTail--;
        continue;
      }

      if (oldHeadKey === newHeadKey) {
        // Case 1: Head match - update in place
        cache.get(newHeadKey)!.itemSignal.value = items[newHead]!;
        newKeys[newHead] = undefined; // Mark processed
        oldHead++;
        newHead++;
      } else if (oldTailKey === newTailKey) {
        // Case 2: Tail match - update in place
        cache.get(newTailKey)!.itemSignal.value = items[newTail]!;
        newKeys[newTail] = undefined;
        oldTail--;
        newTail--;
      } else if (oldHeadKey === newTailKey) {
        // Case 3: Old head moved to new tail
        const entry = cache.get(newTailKey)!;
        entry.itemSignal.value = items[newTail]!;
        moveEntry(entry, getNextSibling(oldTailKey));
        newKeys[newTail] = undefined;
        oldHead++;
        newTail--;
      } else if (oldTailKey === newHeadKey) {
        // Case 4: Old tail moved to new head
        const entry = cache.get(newHeadKey)!;
        entry.itemSignal.value = items[newHead]!;
        moveEntry(entry, getFirstNode(oldHeadKey));
        newKeys[newHead] = undefined;
        oldTail--;
        newHead++;
      } else {
        // Case 5: Fallback - build maps for O(1) lookup
        if (!newKeyToIdx) {
          newKeyToIdx = new Map();
          for (let i = newHead; i <= newTail; i++) {
            const k = newKeys[i];
            if (k !== undefined) newKeyToIdx.set(k, i);
          }
        }
        if (!oldKeyToIdx) {
          oldKeyToIdx = new Map();
          for (let i = oldHead; i <= oldTail; i++) {
            const k = oldKeys[i];
            if (k !== undefined) oldKeyToIdx.set(k, i);
          }
        }

        const newIdx = newKeyToIdx.get(oldHeadKey);
        if (newIdx === undefined) {
          // Old head not in new list - remove
          removeEntry(oldHeadKey);
          oldHead++;
        } else {
          const oldIdx = oldKeyToIdx.get(newHeadKey);
          if (oldIdx === undefined) {
            // New head not in old list - insert
            createEntry(
              items[newHead]!,
              newHeadKey!,
              newHead,
              getFirstNode(oldHeadKey),
            );
            newKeys[newHead] = undefined;
            newHead++;
          } else {
            // Move existing item to new head position
            const entry = cache.get(newHeadKey)!;
            entry.itemSignal.value = items[newHead]!;
            moveEntry(entry, getFirstNode(oldHeadKey));
            oldKeys[oldIdx] = undefined; // Mark as moved
            newKeys[newHead] = undefined;
            newHead++;
          }
        }
      }
    }

    // Remove remaining old items
    while (oldHead <= oldTail) {
      const key = oldKeys[oldHead++];
      if (key !== undefined) removeEntry(key);
    }

    // Insert remaining new items
    while (newHead <= newTail) {
      const key = newKeys[newHead];
      if (key !== undefined) {
        // Find next already-processed item to insert before
        let ref: Node = marker;
        for (let i = newHead + 1; i < newLen; i++) {
          const k = __keyFn__(items[i]!, i);
          if (cache.has(k)) {
            ref = getFirstNode(k);
            break;
          }
        }
        createEntry(items[newHead]!, key, newHead, ref);
        newKeys[newHead] = undefined;
      }
      newHead++;
    }

    // Update state: rebuild oldKeys from seen set (preserves insertion order)
    oldKeys = [...seen];
  };

  // Initial render and subscribe
  reconcile();
  const unsub = listComputed.subscribe(reconcile);

  disposers.push(() => {
    unsub();
    listComputed.dispose();
    if (cache.size > 0) {
      parent.replaceChildren(startMarker, marker);
      for (const entry of cache.values()) entry.dispose();
      cache.clear();
    }
    startMarker.remove();
  });
}
