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

/**
 * Cache entry for a rendered list item.
 *
 * Each entry contains:
 * - nodes: The DOM nodes rendered for this item (may be multiple for fragments)
 * - dispose: Cleanup function for the item's template and reactive bindings
 * - itemSignal: Signal holding the current item data (updated on reconciliation)
 */
interface CacheEntry<T> {
  nodes: Node[];
  dispose: () => void;
  itemSignal: Signal<T>;
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
 * Plugin that handles each() descriptors in templates.
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
 * Bind an each() descriptor to a marker position in the DOM.
 *
 * ## Architecture
 *
 * The list is rendered between two comment markers: `startMarker` and `marker` (end).
 * This allows efficient bulk removal via `parent.replaceChildren(startMarker, marker)`.
 *
 * ```
 * <!-- startMarker -->
 * <li>Item 1</li>
 * <li>Item 2</li>
 * <!-- marker (end) -->
 * ```
 *
 * ## Data Structures
 *
 * - `oldKeys`: Array of keys in current DOM order. Used for O(1) index lookup during reconciliation.
 * - `cache`: Map from key → CacheEntry. Used for O(1) entry lookup by key.
 *
 * ## Reconciliation Algorithm
 *
 * Uses a two-pointer algorithm (similar to Lit, Vue, ivi) that handles common
 * cases efficiently in O(n) time:
 *
 * 1. **Head-to-head match**: Same key at start of both lists → update in place
 * 2. **Tail-to-tail match**: Same key at end of both lists → update in place
 * 3. **Cross match (head↔tail)**: Keys swapped between ends → move DOM nodes
 * 4. **Fallback**: Build maps and handle insertions/deletions/moves
 *
 * The algorithm minimizes DOM operations by reusing existing nodes when keys match.
 */
function bindEach<T>(
  desc: EachDescriptor<T>,
  marker: Comment,
  disposers: (() => void)[],
): void {
  const { __list__, __keyFn__, __renderFn__ } = desc;
  const parent = marker.parentNode!;

  // Insert a start marker before the end marker.
  // This creates a "range" that we can efficiently clear with replaceChildren.
  const startMarker = document.createComment("");
  parent.insertBefore(startMarker, marker);

  // Normalize list access: handles signals, getters, and plain arrays
  const getList = (): T[] => {
    if (typeof __list__ === "function" && !isSignal(__list__)) {
      return (__list__ as () => T[])();
    }
    return isSignal(__list__) ? (__list__.value as T[]) : (__list__ as T[]);
  };

  // Wrap in computed for reactivity - this will trigger reconcile() when list changes
  const listComputed = computed(getList);

  // ==========================================================================
  // STATE
  // ==========================================================================

  // Ordered array of keys representing current DOM order.
  // Used for position lookups during reconciliation.
  let oldKeys: unknown[] = [];

  // Map from key → CacheEntry for O(1) entry lookup.
  // This is the source of truth for rendered items.
  const cache = new Map<unknown, CacheEntry<T>>();

  // ==========================================================================
  // ENTRY MANAGEMENT HELPERS
  // ==========================================================================

  /**
   * Create a new entry for an item and insert its DOM nodes before `ref`.
   *
   * @param item - The data item to render
   * @param key - Unique key for this item
   * @param index - Current index in the list (passed to renderFn)
   * @param ref - DOM node to insert before
   * @returns The newly created cache entry
   */
  const createEntry = (
    item: T,
    key: unknown,
    index: number,
    ref: Node,
  ): CacheEntry<T> => {
    // Create a signal to hold the item data.
    // When the same key appears with new data, we update this signal
    // instead of re-rendering, enabling surgical DOM updates.
    const itemSignal = signal(item);
    const readonlySignal = new ReadonlySignal(itemSignal);

    const nodes: Node[] = [];
    const itemDisposers: (() => void)[] = [];

    // Render the template and collect nodes
    const template = __renderFn__(readonlySignal, index);
    const { fragment, dispose } = template.render();
    itemDisposers.push(dispose);

    // Store references to the rendered nodes (before fragment is emptied)
    nodes.push(...fragment.childNodes);

    // Insert at the correct position in one operation
    parent.insertBefore(fragment, ref);

    const entry: CacheEntry<T> = {
      nodes,
      dispose: () => itemDisposers.forEach((d) => d()),
      itemSignal,
    };
    cache.set(key, entry);
    return entry;
  };

  /**
   * Update an existing entry with new item data.
   * The entry's itemSignal is updated, triggering reactive updates in the template.
   *
   * @param item - The new data for this item
   * @param key - Key to look up in cache
   * @returns The updated entry, or null if not found
   */
  const updateEntry = (item: T, key: unknown): CacheEntry<T> | null => {
    const cached = cache.get(key);
    if (cached) {
      // Update the signal - this triggers reactive bindings in the template
      // without re-rendering the entire item
      cached.itemSignal.value = item;
      return cached;
    }
    return null;
  };

  /**
   * Remove an entry: dispose its resources and remove DOM nodes.
   *
   * @param key - Key of the entry to remove
   */
  const removeEntry = (key: unknown): void => {
    const entry = cache.get(key);
    if (entry) {
      entry.dispose();
      for (const node of entry.nodes) {
        (node as ChildNode).remove();
      }
      cache.delete(key);
    }
  };

  /**
   * Move an entry's DOM nodes before a reference node.
   * Used when reordering items without re-rendering.
   *
   * @param entry - The entry whose nodes to move
   * @param ref - DOM node to insert before (or null for end)
   */
  const moveEntryBefore = (entry: CacheEntry<T>, ref: Node | null): void => {
    for (const node of entry.nodes) {
      parent.insertBefore(node, ref);
    }
  };

  /**
   * Get the first DOM node for an entry by key.
   * Falls back to marker if entry not found or has no nodes.
   */
  const getFirstNode = (key: unknown): Node => {
    return cache.get(key)?.nodes[0] ?? marker;
  };

  /**
   * Get the DOM node immediately after an entry's last node.
   * Used for inserting after an entry.
   */
  const getNodeAfter = (key: unknown): Node => {
    const entry = cache.get(key);
    if (!entry || entry.nodes.length === 0) return marker;
    const lastNode = entry.nodes[entry.nodes.length - 1]!;
    return lastNode.nextSibling ?? marker;
  };

  // ==========================================================================
  // RECONCILIATION
  // ==========================================================================

  /**
   * Reconcile the DOM with the new list of items.
   *
   * This is the core algorithm that efficiently updates the DOM when the list changes.
   * It uses a two-pointer approach that handles common patterns optimally:
   *
   * - Append/prepend: O(k) where k is number of new items
   * - Remove from end/start: O(k) where k is number of removed items
   * - Swap two items: O(1) DOM moves
   * - Reverse: O(n/2) DOM moves
   * - Arbitrary shuffle: O(n) with map-based fallback
   */
  const reconcile = () => {
    const items = listComputed.value;
    const newLen = items.length;
    const oldLen = oldKeys.length;

    // ========================================================================
    // FAST PATH: Empty list
    // ========================================================================
    if (newLen === 0) {
      if (oldLen > 0) {
        // Clear all items efficiently using replaceChildren
        parent.replaceChildren(startMarker, marker);
        for (const entry of cache.values()) {
          entry.dispose();
        }
        cache.clear();
        oldKeys = [];
      }
      return;
    }

    // ========================================================================
    // FAST PATH: First render (no previous items)
    // ========================================================================
    if (oldLen === 0) {
      const newKeys: unknown[] = [];
      let hasDuplicateWarning = false;
      const seenKeys = new Set<unknown>();

      for (let i = 0; i < newLen; i++) {
        const item = items[i]!;
        const key = __keyFn__(item, i);

        // Skip duplicate keys with a warning
        if (seenKeys.has(key)) {
          if (!hasDuplicateWarning) {
            console.warn(`[each] Duplicate key: ${String(key)}. Skipping.`);
            hasDuplicateWarning = true;
          }
          continue;
        }
        seenKeys.add(key);

        // Create entry and insert before marker (appends to list)
        createEntry(item, key, i, marker);
        newKeys.push(key);
      }
      oldKeys = newKeys;
      return;
    }

    // ========================================================================
    // BUILD NEW KEYS ARRAY
    // ========================================================================
    // Pre-compute all keys and detect duplicates upfront.
    // Duplicate keys are marked as undefined and skipped during reconciliation.

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
        newKeys[i] = undefined; // Mark for skipping
      } else {
        seenKeys.add(key);
        newKeys[i] = key;
      }
    }

    // ========================================================================
    // TWO-POINTER RECONCILIATION
    // ========================================================================
    //
    // We maintain four pointers:
    //   oldHead/oldTail: Range of unprocessed items in the old list
    //   newHead/newTail: Range of unprocessed items in the new list
    //
    // The algorithm shrinks these ranges from both ends by matching keys.
    // When a match is found, the item is either updated in place or moved.
    //
    // Visual example - reversing [A,B,C] to [C,B,A]:
    //
    //   Step 1: oldHead=A, oldTail=C, newHead=C, newTail=A
    //           A === A? No. C === A? No. A === A? Yes! (cross-match)
    //           → Move A to end, oldHead++, newTail--
    //
    //   Step 2: oldHead=B, oldTail=C, newHead=C, newTail=B
    //           B === C? No. C === B? No. B === B? Yes! (cross-match)
    //           → Move B before A, oldHead++, newTail--
    //
    //   Step 3: oldHead=C, oldTail=C, newHead=C, newTail=C
    //           C === C? Yes! (head match)
    //           → Update in place, done

    let oldHead = 0;
    let oldTail = oldLen - 1;
    let newHead = 0;
    let newTail = newLen - 1;

    // Track which new positions have been processed.
    // Used to know where to insert remaining new items.
    const processed = new Array<boolean>(newLen).fill(false);

    // Maps built lazily only when the fast paths don't match.
    // These enable O(1) lookup for arbitrary reorderings.
    let newKeyToIndex: Map<unknown, number> | undefined;
    let oldKeyToIndex: Map<unknown, number> | undefined;

    // ------------------------------------------------------------------------
    // MAIN LOOP: Process items from both ends until ranges overlap
    // ------------------------------------------------------------------------
    while (oldHead <= oldTail && newHead <= newTail) {
      // Skip undefined keys (duplicates in new array)
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

      // Skip undefined keys in old array (marked as moved during fallback)
      if (oldHeadKey === undefined) {
        oldHead++;
        continue;
      }
      if (oldTailKey === undefined) {
        oldTail--;
        continue;
      }

      // ----------------------------------------------------------------------
      // CASE 1: Head-to-head match
      // Old and new lists have same key at the start.
      // No DOM movement needed - just update the item data.
      // ----------------------------------------------------------------------
      if (oldHeadKey === newHeadKey) {
        updateEntry(items[newHead]!, newHeadKey);
        processed[newHead] = true;
        oldHead++;
        newHead++;
      }
      // ----------------------------------------------------------------------
      // CASE 2: Tail-to-tail match
      // Old and new lists have same key at the end.
      // No DOM movement needed - just update the item data.
      // ----------------------------------------------------------------------
      else if (oldTailKey === newTailKey) {
        updateEntry(items[newTail]!, newTailKey);
        processed[newTail] = true;
        oldTail--;
        newTail--;
      }
      // ----------------------------------------------------------------------
      // CASE 3: Cross-match (old head = new tail)
      // Item at start of old list moved to end of new list.
      // Move DOM nodes after the current tail item.
      // ----------------------------------------------------------------------
      else if (oldHeadKey === newTailKey) {
        const entry = updateEntry(items[newTail]!, newTailKey)!;
        processed[newTail] = true;
        moveEntryBefore(entry, getNodeAfter(oldTailKey));
        oldHead++;
        newTail--;
      }
      // ----------------------------------------------------------------------
      // CASE 4: Cross-match (old tail = new head)
      // Item at end of old list moved to start of new list.
      // Move DOM nodes before the current head item.
      // ----------------------------------------------------------------------
      else if (oldTailKey === newHeadKey) {
        const entry = updateEntry(items[newHead]!, newHeadKey)!;
        processed[newHead] = true;
        moveEntryBefore(entry, getFirstNode(oldHeadKey));
        oldTail--;
        newHead++;
      }
      // ----------------------------------------------------------------------
      // CASE 5: No simple match - use map-based fallback
      // This handles arbitrary insertions, deletions, and moves.
      // ----------------------------------------------------------------------
      else {
        // Build maps lazily (only once per reconciliation)
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
            const k = oldKeys[i];
            if (k !== undefined) oldKeyToIndex.set(k, i);
          }
        }

        // Check if old head key exists in new list
        const newIdx = newKeyToIndex.get(oldHeadKey);

        if (newIdx === undefined) {
          // Old head key not in new list → REMOVE it
          removeEntry(oldHeadKey);
          oldHead++;
        } else {
          // Old head key still exists. Check if new head key exists in old list.
          const oldIdx = oldKeyToIndex.get(newHeadKey);

          if (oldIdx === undefined) {
            // New head key not in old list → INSERT new item
            createEntry(
              items[newHead]!,
              newHeadKey!,
              newHead,
              getFirstNode(oldHeadKey),
            );
            processed[newHead] = true;
            newHead++;
          } else {
            // Both keys exist but in different positions → MOVE old item
            const entry = updateEntry(items[newHead]!, newHeadKey)!;
            processed[newHead] = true;
            moveEntryBefore(entry, getFirstNode(oldHeadKey));
            // Mark old position as handled to avoid double-processing
            oldKeys[oldIdx] = undefined;
            newHead++;
          }
        }
      }
    }

    // ========================================================================
    // POST-LOOP: Handle remaining items
    // ========================================================================

    // Remove any remaining old items that weren't matched
    while (oldHead <= oldTail) {
      const key = oldKeys[oldHead];
      if (key !== undefined) {
        removeEntry(key);
      }
      oldHead++;
    }

    // Add any remaining new items that weren't matched
    while (newHead <= newTail) {
      const key = newKeys[newHead];
      if (key !== undefined && !processed[newHead]) {
        // Find the next processed item to insert before
        let insertRef: Node = marker;
        for (let i = newHead + 1; i < newLen; i++) {
          if (processed[i] && newKeys[i] !== undefined) {
            insertRef = getFirstNode(newKeys[i]);
            break;
          }
        }
        createEntry(items[newHead]!, key, newHead, insertRef);
        processed[newHead] = true;
      }
      newHead++;
    }

    // ========================================================================
    // UPDATE STATE
    // ========================================================================

    // Update oldKeys for next reconciliation.
    // If no duplicates were found, reuse the array directly (common case).
    // Otherwise, filter out undefined entries (duplicates).
    oldKeys = hasDuplicateWarning
      ? newKeys.filter((k) => k !== undefined)
      : newKeys;
  };

  // ==========================================================================
  // INITIALIZATION & CLEANUP
  // ==========================================================================

  // Perform initial render
  reconcile();

  // Subscribe to list changes
  const unsub = listComputed.subscribe(reconcile);

  // Register cleanup handler
  disposers.push(() => {
    unsub();
    listComputed.dispose();

    // Bulk DOM removal using replaceChildren (more efficient than removing nodes one by one)
    if (cache.size > 0) {
      parent.replaceChildren(startMarker, marker);
      for (const entry of cache.values()) {
        entry.dispose();
      }
      cache.clear();
    }

    // Remove the start marker (end marker is removed by parent template)
    startMarker.remove();
  });
}
