/**
 * Keyed list rendering plugin for templates.
 *
 * Provides efficient, keyed list rendering with minimal DOM operations.
 * Supports signals, computeds, getters, and plain arrays.
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
 *   ${each(items, i => i.id, i => html`<li>${i.name}</li>`)}
 * </ul>`.render();
 * ```
 */

import { computed, isSignal, type Reactive } from "./signals/index.js";
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
  /** @internal Render function for each item */
  __renderFn__: (item: T, index: number) => Template;
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
 * Three-argument form: uses explicit keyFn.
 *
 * @example
 * ```ts
 * // Two-arg: object reference as key
 * each(items, item => html`<li>${item.name}</li>`)
 *
 * // Three-arg: explicit key
 * each(items, item => item.id, item => html`<li>${item.name}</li>`)
 * ```
 */
export function each<T>(
  list: T[] | Reactive<T[]> | (() => T[]),
  renderFn: (item: T, index: number) => Template,
): EachDescriptor<T>;
export function each<T>(
  list: T[] | Reactive<T[]> | (() => T[]),
  keyFn: (item: T, index: number) => unknown,
  renderFn: (item: T, index: number) => Template,
): EachDescriptor<T>;
export function each<T>(
  list: T[] | Reactive<T[]> | (() => T[]),
  keyFnOrRenderFn:
    | ((item: T, index: number) => unknown)
    | ((item: T, index: number) => Template),
  maybeRenderFn?: (item: T, index: number) => Template,
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

  // Cache: key -> { nodes, dispose, item }
  const cache = new Map<
    unknown,
    { nodes: Node[]; dispose: () => void; item: T }
  >();
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

  const reconcile = () => {
    const items = listComputed.value;
    const seenKeys = new Set<unknown>();
    const newOrder: { key: unknown; nodes: Node[] }[] = [];
    let hasDuplicateWarning = false;

    // Process items, create/reuse nodes
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
      if (cached && cached.item === item) {
        // Same item reference - reuse nodes
        newOrder.push({ key, nodes: cached.nodes });
      } else {
        // New item or item changed - dispose old and create new
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
        insertContent(marker, __renderFn__(item, i), nodes, itemDisposers);
        const dispose = () => itemDisposers.forEach((d) => d());
        cache.set(key, { nodes, dispose, item });
        newOrder.push({ key, nodes });
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

    // Reorder nodes to match newOrder
    // Walk backwards and insertBefore as needed
    let insertionPoint: Node | null = marker;

    for (let i = newOrder.length - 1; i >= 0; i--) {
      const { nodes } = newOrder[i]!;
      for (let j = nodes.length - 1; j >= 0; j--) {
        const node = nodes[j]!;
        if (node.nextSibling !== insertionPoint) {
          parent.insertBefore(node, insertionPoint);
        }
        insertionPoint = node;
      }
    }
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
