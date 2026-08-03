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
import { registerHydrateHandler, hydrateWalk } from "./hydrate.js";
import { SSR_ROW } from "./ssr-shared.js";
import { EACH } from "./descriptors.js";

export { EACH } from "./descriptors.js";

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
 * Bind an each() descriptor seeded from server-rendered rows (hydration).
 * The adopted entries must already be in the DOM between a start marker
 * and the given marker, in list order.
 * @internal Used by Template.hydrate.
 */
export function bindEachHydrated<T>(
  desc: EachDescriptor<T>,
  marker: Comment,
  disposers: (() => void)[],
  adopted: { key: unknown; entry: CacheEntry<T> }[],
): void {
  bindEach(desc, marker, disposers, adopted);
}

const isRowMarker = (node: Node): boolean =>
  node.nodeType === 8 && (node as Comment).data === SSR_ROW;

/**
 * Hydrate server-rendered each() rows: the region holds the rows
 * separated by `<!--k-->` markers, in list order. Each row's template is
 * hydrated in place, then the entries are adopted by bindEach so
 * subsequent list changes reconcile normally. @internal
 */
function hydrateEach<T>(
  desc: EachDescriptor<T>,
  contentStart: Node | null,
  anchor: Comment,
  disposers: (() => void)[],
): void {
  const rawList = desc.__list__;
  const items = (
    typeof rawList === "function" && !isSignal(rawList)
      ? (rawList as () => T[])()
      : isSignal(rawList)
        ? (rawList as Reactive<T[]>).value
        : (rawList as T[])
  ) as T[];
  const adopted: { key: unknown; entry: CacheEntry<T> }[] = [];
  let node = contentStart;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (node && isRowMarker(node)) node = node.nextSibling;
    const rowNodes: Node[] = [];
    while (node && node !== anchor && !isRowMarker(node)) {
      rowNodes.push(node);
      node = node.nextSibling;
    }
    // Only rows present in the server markup are adopted; items the
    // server did not render (e.g. a list that grew between build and
    // hydration, like restored favorites) are left for the binder to
    // render fresh - an entry with no nodes would never be displayed.
    if (!rowNodes.length) continue;
    const itemSignal = signal(item);
    const rowDisposers: (() => void)[] = [];
    const rowTpl = desc.__renderFn__(new ReadonlySignal(itemSignal), i);
    if (rowNodes[0]) hydrateWalk(rowTpl, rowNodes[0]!, rowDisposers);
    const key = desc.__keyFn__(item, i);
    adopted.push({
      key,
      entry: {
        nodes: rowNodes,
        dispose: () => {
          for (const f of rowDisposers) f();
        },
        itemSignal,
      },
    });
  }
  bindEachHydrated(desc, anchor, disposers, adopted);
}

registerHydrateHandler((value) => {
  if (!(value && typeof value === "object" && EACH in value)) return null;
  return (contentStart, anchor, disposers) => {
    hydrateEach(
      value as EachDescriptor<unknown>,
      contentStart,
      anchor,
      disposers,
    );
    return true;
  };
});

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
 *
 * When `adopted` entries are provided (hydration), the cache and DOM are
 * seeded from server-rendered rows instead of being created fresh.
 */
function bindEach<T>(
  desc: EachDescriptor<T>,
  marker: Comment,
  disposers: (() => void)[],
  adopted?: { key: unknown; entry: CacheEntry<T> }[],
): void {
  const { __list__, __keyFn__, __renderFn__ } = desc;
  const initialParent = marker.parentNode!;
  const startMarker = document.createComment("");
  if (adopted && adopted.length > 0) {
    // The adopted rows already sit between startMarker and marker: insert
    // the start marker before the first row to match the DOM model.
    initialParent.insertBefore(startMarker, adopted[0]!.entry.nodes[0]!);
  } else {
    initialParent.insertBefore(startMarker, marker);
  }

  // Normalize list access
  const getList = (): T[] => {
    const list = __list__;
    if (typeof list === "function" && !isSignal(list)) return list();
    return isSignal(list) ? (list.value as T[]) : list;
  };

  const listComputed = computed(getList);
  let oldKeys: unknown[] = [];
  const cache = new Map<unknown, CacheEntry<T>>();
  if (adopted) {
    for (const { key, entry } of adopted) {
      cache.set(key, entry);
      oldKeys.push(key);
    }
  }

  // --- Entry helpers ---

  const createEntry = (
    parent: Node,
    item: T,
    key: unknown,
    index: number,
    ref: Node,
    container?: DocumentFragment,
  ): CacheEntry<T> => {
    const itemSignal = signal(item);
    const { fragment, dispose } = __renderFn__(
      new ReadonlySignal(itemSignal),
      index,
    ).render();
    const nodes = [...fragment.childNodes];
    if (container) container.appendChild(fragment);
    else parent.insertBefore(fragment, ref);
    if (!nodes.length) {
      const placeholder = document.createComment("");
      if (container) container.appendChild(placeholder);
      else parent.insertBefore(placeholder, ref);
      nodes.push(placeholder);
    }
    const entry: CacheEntry<T> = { nodes, dispose, itemSignal };
    cache.set(key, entry);
    return entry;
  };

  const removeEntry = (key: unknown): void => {
    const entry = cache.get(key);
    if (!entry) return;
    // Remove from the DOM first: disposers can then skip work that is
    // unnecessary for disconnected nodes (e.g. removeEventListener).
    for (const node of entry.nodes) (node as ChildNode).remove();
    entry.dispose();
    cache.delete(key);
  };

  const moveEntry = (
    parent: Node,
    entry: CacheEntry<T>,
    ref: Node | null,
  ): void => {
    for (const node of entry.nodes) parent.insertBefore(node, ref);
  };

  const getFirstNode = (key: unknown): Node =>
    cache.get(key)?.nodes[0] ?? marker;

  // --- Reconciliation ---

  let pendingReattachCheck = false;

  const reconcile = () => {
    // When marker is detached (e.g., inside a hidden when()/match() branch with cache:true),
    // we can't do DOM operations. Schedule a microtask to retry after re-attachment.
    const parent = marker.parentNode;
    if (!parent) {
      if (!pendingReattachCheck) {
        pendingReattachCheck = true;
        queueMicrotask(() => {
          pendingReattachCheck = false;
          // If re-attached, reconcile now
          if (marker.parentNode) reconcile();
        });
      }
      return;
    }

    const items = listComputed.value;
    const newLen = items.length;
    const oldLen = oldKeys.length;

    // Fast path: empty list
    if (newLen === 0) {
      if (oldLen > 0) {
        // Remove all the DOM between the markers first (single bulk pass),
        // then dispose every entry's subscriptions - removed nodes let
        // binding disposers skip work like removeEventListener.
        const parent = startMarker.parentNode!;
        if (parent.firstChild === startMarker && parent.lastChild === marker) {
          // The region spans the whole parent: replace all children in a
          // single native call, then restore the two markers.
          parent.replaceChildren(startMarker, marker);
        } else {
          // Remove the region's direct children one by one.
          let node = startMarker.nextSibling;
          while (node && node !== marker) {
            const next = node.nextSibling;
            parent.removeChild(node);
            node = next;
          }
        }
        const keys = [...cache.keys()];
        for (let i = 0; i < keys.length; i++) {
          const entry = cache.get(keys[i]!)!;
          entry.dispose();
          cache.delete(keys[i]!);
        }
        oldKeys = [];
      }
      return;
    }

    // Fast path: first render
    if (oldLen === 0) {
      const newKeys: unknown[] = [];
      const seen = new Set<unknown>();
      let warnedDupe = false;
      // Batch all rows into a detached fragment and insert once - much
      // cheaper than 1000 individual live insertBefore calls.
      const container = document.createDocumentFragment();
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
        createEntry(parent, item, key, i, marker, container);
        newKeys.push(key);
      }
      parent.insertBefore(container, marker);
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

    // Fast path: pure append (the old list is a prefix of the new list).
    // Avoids the two-pointer reconciliation + map building entirely.
    if (newLen > oldLen && !hasDupes) {
      let append = true;
      for (let i = 0; i < oldLen; i++) {
        if (newKeys[i] !== oldKeys[i]) {
          append = false;
          break;
        }
        // Keep matched entries' item signals in sync (items may be new
        // objects with the same keys).
        cache.get(oldKeys[i]!)!.itemSignal.value = items[i]!;
      }
      if (append) {
        const container = document.createDocumentFragment();
        for (let i = oldLen; i < newLen; i++) {
          createEntry(parent, items[i]!, newKeys[i]!, i, marker, container);
        }
        parent.insertBefore(container, marker);
        oldKeys = [...seen];
        return;
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
        const tailNodes = cache.get(oldTailKey)!.nodes;
        const ref = tailNodes[tailNodes.length - 1]!.nextSibling ?? marker;
        moveEntry(parent, entry, ref);
        newKeys[newTail] = undefined;
        oldHead++;
        newTail--;
      } else if (oldTailKey === newHeadKey) {
        // Case 4: Old tail moved to new head
        const entry = cache.get(newHeadKey)!;
        entry.itemSignal.value = items[newHead]!;
        moveEntry(parent, entry, getFirstNode(oldHeadKey));
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
              parent,
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
            moveEntry(parent, entry, getFirstNode(oldHeadKey));
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
    // Find reference: first cached item after newTail, or marker
    let insertRef: Node = marker;
    for (let i = newTail + 1; i < newLen; i++) {
      const k = __keyFn__(items[i]!, i);
      if (cache.has(k)) {
        insertRef = getFirstNode(k);
        break;
      }
    }
    // Insert in reverse order so each goes before the previous
    for (let i = newTail; i >= newHead; i--) {
      const key = newKeys[i];
      if (key !== undefined) {
        createEntry(parent, items[i]!, key, i, insertRef);
        insertRef = cache.get(key)!.nodes[0] ?? insertRef;
      }
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
      // Bulk-remove the region's DOM first, then dispose entries.
      const parent = startMarker.parentNode;
      if (parent) {
        if (parent.firstChild === startMarker && parent.lastChild === marker) {
          parent.replaceChildren(startMarker, marker);
        } else {
          let node = startMarker.nextSibling;
          while (node && node !== marker) {
            const next = node.nextSibling;
            parent.removeChild(node);
            node = next;
          }
        }
      }
      for (const key of [...cache.keys()]) {
        const entry = cache.get(key)!;
        entry.dispose();
        cache.delete(key);
      }
    }
    startMarker.remove();
  });
}
