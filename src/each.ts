/**
 * Keyed list rendering plugin for templates.
 *
 * Provides efficient, keyed list rendering with minimal DOM operations.
 * Supports signals, computeds, getters, and plain arrays.
 *
 * Uses explicit keyFn for keying, render receives ReadonlySignal<T> for DOM reuse.
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

/** Marker symbol for each() descriptors */
const EACH = Symbol("each");

/** Each descriptor - returned by each() */
export interface EachDescriptor<T> {
  readonly [EACH]: true;
  /** @internal List source (array, signal, or getter) */
  __list__: T[] | Reactive<T[]> | (() => T[]);
  /** @internal Key extraction function */
  __keyFn__: (item: T, index: number) => unknown;
  /** @internal Render function for each item */
  __renderFn__: (item: ReadonlySignal<T>, index: number) => Template;
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
 * Uses explicit keyFn for keying. Render function receives a ReadonlySignal<T> wrapping the item.
 * DOM is reused when keys match, and the signal is updated with new item data.
 *
 * @example
 * ```ts
 * // Explicit key, receives ReadonlySignal for DOM reuse
 * each(items, item => item.id, itemSignal => html`<li>${() => itemSignal.value.name}</li>`)
 * ```
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
  const { __list__, __keyFn__, __renderFn__ } = desc;
  const parent = marker.parentNode!;

  // Insert a start marker before the end marker for efficient range deletion
  const startMarker = document.createComment("");
  parent.insertBefore(startMarker, marker);

  // Get current array value
  const getList = (): T[] => {
    if (typeof __list__ === "function" && !isSignal(__list__)) {
      return (__list__ as () => T[])();
    }
    return isSignal(__list__) ? (__list__.value as T[]) : (__list__ as T[]);
  };

  // Wrap in computed for reactivity
  const listComputed = computed(getList);

  // State: parallel arrays for keys and entries (kept in sync)
  let oldKeys: unknown[] = [];
  let oldEntries: CacheEntry<T>[] = [];
  // Cache for O(1) lookup by key
  const cache = new Map<unknown, CacheEntry<T>>();

  /**
   * Create or update an entry for an item.
   * Returns the entry (new or existing).
   */
  const getOrCreateEntry = (
    item: T,
    key: unknown,
    index: number,
  ): CacheEntry<T> => {
    const cached = cache.get(key);

    // Reuse if key exists, update signal
    if (cached) {
      cached.itemSignal!.value = item;
      cached.item = item;
      return cached;
    }
    // Create new entry with signal
    const itemSignal = signal(item);
    const readonlySignal = new ReadonlySignal(itemSignal);
    const nodes: Node[] = [];
    const itemDisposers: (() => void)[] = [];
    insertContent(marker, __renderFn__(readonlySignal, index), nodes, itemDisposers);
    const entry: CacheEntry<T> = {
      nodes,
      dispose: () => itemDisposers.forEach((d) => d()),
      item,
      itemSignal,
    };
    cache.set(key, entry);
    return entry;
  };

  /**
   * Remove an entry and its DOM nodes.
   */
  const removeEntry = (entry: CacheEntry<T>, key: unknown): void => {
    entry.dispose();
    for (const node of entry.nodes) {
      (node as ChildNode).remove();
    }
    cache.delete(key);
  };

  /**
   * Move entry's nodes before a reference node.
   */
  const moveEntryBefore = (entry: CacheEntry<T>, ref: Node | null): void => {
    for (const node of entry.nodes) {
      parent.insertBefore(node, ref);
    }
  };

  /**
   * Get the first DOM node of an entry, or the marker if entry has no nodes.
   */
  const getFirstNode = (entry: CacheEntry<T>): Node => {
    return entry.nodes[0] ?? marker;
  };

  /**
   * Two-pointer reconciliation algorithm.
   * Based on the algorithm used by Lit, Vue, and ivi.
   * Handles common cases (append, prepend, swap, reverse) in O(n) time.
   */
  const reconcile = () => {
    const items = listComputed.value;
    const newLen = items.length;
    const oldLen = oldKeys.length;

    // Fast path: empty list
    if (newLen === 0) {
      if (oldLen > 0) {
        // Clear all - use replaceChildren for bulk DOM removal
        parent.replaceChildren(startMarker, marker);
        for (const entry of oldEntries) {
          entry.dispose();
        }
        cache.clear();
        oldKeys = [];
        oldEntries = [];
      }
      return;
    }

    // Fast path: first render
    if (oldLen === 0) {
      const newKeys: unknown[] = [];
      const newEntries: CacheEntry<T>[] = [];
      let hasDuplicateWarning = false;
      const seenKeys = new Set<unknown>();

      for (let i = 0; i < newLen; i++) {
        const item = items[i]!;
        const key = __keyFn__(item, i);
        if (seenKeys.has(key)) {
          if (!hasDuplicateWarning) {
            console.warn(`[each] Duplicate key: ${String(key)}. Skipping.`);
            hasDuplicateWarning = true;
          }
          continue;
        }
        seenKeys.add(key);
        const entry = getOrCreateEntry(item, key, i);
        newKeys.push(key);
        newEntries.push(entry);
      }
      oldKeys = newKeys;
      oldEntries = newEntries;
      return;
    }

    // Build new keys array and check for duplicates
    const newKeys: unknown[] = new Array(newLen);
    let hasDuplicateWarning = false;
    const seenKeys = new Set<unknown>();

    for (let i = 0; i < newLen; i++) {
      const key = __keyFn__(items[i]!, i);
      if (seenKeys.has(key)) {
        if (!hasDuplicateWarning) {
          console.warn(`[each] Duplicate key: ${String(key)}. Skipping.`);
          hasDuplicateWarning = true;
        }
        // Mark as undefined to skip later
        newKeys[i] = undefined;
      } else {
        seenKeys.add(key);
        newKeys[i] = key;
      }
    }

    // Two-pointer algorithm
    let oldHead = 0;
    let oldTail = oldLen - 1;
    let newHead = 0;
    let newTail = newLen - 1;

    // Result arrays
    const newEntries: (CacheEntry<T> | null)[] = new Array(newLen).fill(null);

    // Maps built lazily only when needed
    let newKeyToIndex: Map<unknown, number> | undefined;
    let oldKeyToIndex: Map<unknown, number> | undefined;

    // Main reconciliation loop
    while (oldHead <= oldTail && newHead <= newTail) {
      // Skip undefined (duplicate) keys in new array
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

      if (oldHeadKey === newHeadKey) {
        // Head matches head - update in place
        newEntries[newHead] = getOrCreateEntry(
          items[newHead]!,
          newHeadKey!,
          newHead,
        );
        oldHead++;
        newHead++;
      } else if (oldTailKey === newTailKey) {
        // Tail matches tail - update in place
        newEntries[newTail] = getOrCreateEntry(
          items[newTail]!,
          newTailKey!,
          newTail,
        );
        oldTail--;
        newTail--;
      } else if (oldHeadKey === newTailKey) {
        // Old head matches new tail - move to end
        const entry = getOrCreateEntry(items[newTail]!, newTailKey!, newTail);
        newEntries[newTail] = entry;
        // Move after current oldTail's nodes
        const afterOldTail =
          oldEntries[oldTail]!.nodes[oldEntries[oldTail]!.nodes.length - 1]
            ?.nextSibling ?? marker;
        moveEntryBefore(entry, afterOldTail);
        oldHead++;
        newTail--;
      } else if (oldTailKey === newHeadKey) {
        // Old tail matches new head - move to beginning
        const entry = getOrCreateEntry(items[newHead]!, newHeadKey!, newHead);
        newEntries[newHead] = entry;
        // Move before current oldHead's nodes
        moveEntryBefore(entry, getFirstNode(oldEntries[oldHead]!));
        oldTail--;
        newHead++;
      } else {
        // No simple match - need to use maps
        if (!newKeyToIndex) {
          newKeyToIndex = new Map();
          for (let i = newHead; i <= newTail; i++) {
            const k = newKeys[i];
            if (k !== undefined) newKeyToIndex.set(k, i);
          }
        }
        if (!oldKeyToIndex) {
          oldKeyToIndex = new Map();
          for (let i = oldHead; i <= oldTail; i++) {
            oldKeyToIndex.set(oldKeys[i], i);
          }
        }

        const newIdx = newKeyToIndex.get(oldHeadKey);
        if (newIdx === undefined) {
          // Old head key not in new list - remove it
          removeEntry(oldEntries[oldHead]!, oldHeadKey!);
          oldHead++;
        } else {
          const oldIdx = oldKeyToIndex.get(newHeadKey);
          if (oldIdx === undefined) {
            // New head key not in old list - create and insert
            const entry = getOrCreateEntry(
              items[newHead]!,
              newHeadKey!,
              newHead,
            );
            newEntries[newHead] = entry;
            moveEntryBefore(entry, getFirstNode(oldEntries[oldHead]!));
            newHead++;
          } else {
            // Both keys exist but in different positions - move old to new position
            const entry = getOrCreateEntry(
              items[newHead]!,
              newHeadKey!,
              newHead,
            );
            newEntries[newHead] = entry;
            moveEntryBefore(entry, getFirstNode(oldEntries[oldHead]!));
            // Mark old position as handled by setting to a sentinel
            oldKeys[oldIdx] = undefined as unknown;
            newHead++;
          }
        }
      }
    }

    // Remove remaining old items
    while (oldHead <= oldTail) {
      const key = oldKeys[oldHead];
      if (key !== undefined) {
        removeEntry(oldEntries[oldHead]!, key);
      }
      oldHead++;
    }

    // Add remaining new items
    while (newHead <= newTail) {
      const key = newKeys[newHead];
      if (key !== undefined) {
        const entry = getOrCreateEntry(items[newHead]!, key, newHead);
        newEntries[newHead] = entry;
        // Insert before the next settled entry or marker
        let insertRef: Node = marker;
        for (let i = newHead + 1; i < newLen; i++) {
          if (newEntries[i]) {
            insertRef = getFirstNode(newEntries[i]!);
            break;
          }
        }
        moveEntryBefore(entry, insertRef);
      }
      newHead++;
    }

    // Build final arrays (filter out nulls from skipped duplicates)
    const finalKeys: unknown[] = [];
    const finalEntries: CacheEntry<T>[] = [];
    for (let i = 0; i < newLen; i++) {
      const entry = newEntries[i];
      if (entry) {
        finalKeys.push(newKeys[i]);
        finalEntries.push(entry);
      }
    }
    oldKeys = finalKeys;
    oldEntries = finalEntries;
  };

  // Initial render and subscribe
  reconcile();
  const unsub = listComputed.subscribe(reconcile);

  disposers.push(() => {
    unsub();
    listComputed.dispose();
    // Bulk DOM removal using replaceChildren
    if (cache.size > 0) {
      parent.replaceChildren(startMarker, marker);
      for (const entry of oldEntries) {
        entry.dispose();
      }
      cache.clear();
    }
    // Remove the markers themselves
    startMarker.remove();
  });
}
