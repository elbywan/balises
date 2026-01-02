/**
 * HTML template rendering with reactive bindings.
 *
 * Uses tagged template literals to create reactive DOM:
 * - Text interpolation: ${value} or ${signal}
 * - Attribute binding: class="${signal}" (reactive)
 * - Event binding: @click=${handler}
 * - Property binding: .value=${signal} (sets DOM property, not attribute)
 * - Nested templates: ${html`<span>...</span>`}
 * - Arrays: ${items.map(i => html`<li>${i}</li>`)}
 */

import { computed, isSignal, signal, type Reactive } from "./signals/index.js";
import { HTMLParser, type Attr } from "./parser.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Bind a value to an update function.
 * If reactive, subscribes and returns unsubscribe. Otherwise returns null.
 * Functions are wrapped in computed() for automatic reactivity.
 */
function bind(
  value: unknown,
  update: (v: unknown) => void,
): (() => void) | null | undefined {
  if (typeof value === "function") {
    const c = computed(value as () => unknown);
    update(c.value);
    const unsub = c.subscribe(() => update(c.value));
    return () => {
      unsub();
      c.dispose();
    };
  }
  if (isSignal(value)) {
    update(value.value);
    return value.subscribe(() => update((value as Reactive<unknown>).value));
  }
  update(value);
}

/** A parsed HTML template. Call render() to create live DOM. */
export class Template {
  constructor(
    private strings: TemplateStringsArray,
    private values: unknown[],
  ) {}

  /**
   * Parse template and create live DOM.
   * Returns the fragment and a dispose function to clean up subscriptions.
   */
  render(): { fragment: DocumentFragment; dispose: () => void } {
    const fragment = document.createDocumentFragment();
    const disposers: (() => void)[] = [];
    const stack: (Element | DocumentFragment)[] = [fragment];
    const parser = new HTMLParser();
    const values = this.values;

    const handleAttribute = (el: Element, [name, statics, indexes]: Attr) => {
      const idx0 = indexes[0];

      // Event binding: @click=${handler}
      if (name[0] === "@") {
        if (idx0 !== undefined) {
          const handler = values[idx0] as EventListener;
          el.addEventListener(name.slice(1), handler);
          disposers.push(() => el.removeEventListener(name.slice(1), handler));
        }
        return;
      }

      // Property binding: .value=${data} - sets DOM property directly
      if (name[0] === ".") {
        if (idx0 !== undefined) {
          const unsub = bind(values[idx0], (v) => {
            (el as unknown as Record<string, unknown>)[name.slice(1)] = v;
          });
          if (unsub) disposers.push(unsub);
        }
        return;
      }

      // Static attribute (no dynamic parts)
      if (!indexes.length) {
        const value = statics[0] ?? "";
        el.setAttribute(name, value);
        return;
      }

      // Wrap functions in computed, collect all reactive sources
      const reactives: Reactive<unknown>[] = [];
      for (let i = 0; i < indexes.length; i++) {
        const idx = indexes[i]!;
        const v = values[idx];
        if (typeof v === "function") {
          // Only wrap if not already wrapped
          if (!isSignal(v)) {
            const c = computed(v as () => unknown);
            values[idx] = c;
            reactives.push(c);
            disposers.push(() => c.dispose());
          } else {
            reactives.push(v as Reactive<unknown>);
          }
        } else if (isSignal(v)) {
          reactives.push(v);
        }
      }

      const update = () => {
        if (indexes.length === 1) {
          const val = isSignal(values[idx0!])
            ? (values[idx0!] as Reactive<unknown>).value
            : values[idx0!];
          if (val == null || val === false) el.removeAttribute(name);
          else
            el.setAttribute(
              name,
              statics[0]! + (val === true ? "" : val) + statics[1]!,
            );
        } else {
          let result = statics[0]!;
          for (let i = 0; i < indexes.length; i++) {
            const v = values[indexes[i]!];
            const val = isSignal(v) ? (v as Reactive<unknown>).value : v;
            result += (val ?? "") + statics[i + 1]!;
          }
          el.setAttribute(name, result);
        }
      };

      update();
      for (const s of reactives) disposers.push(s.subscribe(update));
    };

    parser.parseTemplate(this.strings, {
      onText: (text) => {
        stack.at(-1)!.append(text);
      },

      onOpenTag: (tag, attrs, selfClosing) => {
        const parent = stack.at(-1)!;
        const el =
          tag === "svg" ||
          tag === "SVG" ||
          (parent instanceof Element && parent.namespaceURI === SVG_NS)
            ? document.createElementNS(SVG_NS, tag)
            : document.createElement(tag);
        for (const attr of attrs) {
          handleAttribute(el, attr);
        }
        parent.appendChild(el);
        if (!selfClosing) stack.push(el);
      },

      onClose: () => {
        if (stack.length > 1) stack.pop();
      },

      onSlot: (index) => {
        // Marker comment anchors dynamic content
        const marker = document.createComment("");
        stack.at(-1)!.appendChild(marker);
        disposers.push(bindContent(marker, values[index]));
      },
    });

    return { fragment, dispose: () => disposers.forEach((d) => d()) };
  }
}

/** Cached entry for a keyed list item */
interface EachEntry {
  item: unknown;
  nodes: Node[];
  dispose: () => void;
}

/**
 * Bind dynamic content at a marker position.
 * Handles primitives (as text), Templates (rendered), Each (keyed lists), and arrays.
 * null/undefined/boolean render nothing (enables conditional: ${cond && html`...`})
 */
function bindContent(marker: Comment, value: unknown): () => void {
  let nodes: Node[] = [];
  let childDisposers: (() => void)[] = [];

  const clear = () => {
    childDisposers.forEach((d) => d());
    childDisposers = [];
    nodes.forEach((n) => n.parentNode?.removeChild(n));
    nodes = [];
  };

  // Handle each() - keyed list for efficient list rendering
  if (value != null && typeof value === "object" && EACH in value) {
    const cache = new Map<unknown, EachEntry>();
    const { list, keyFn, renderFn, dispose } = value as EachDescriptor<unknown>;
    let warned = 0;

    const updateList = () => {
      const parent = marker.parentNode!;
      const items = list.value;
      const itemsLength = items.length;
      const newKeys = new Set<unknown>();
      const newNodes: Node[] = [];

      for (let i = 0; i < itemsLength; i++) {
        const item = items[i]!;
        const key = keyFn(item, i);

        if (newKeys.has(key)) {
          void (warned++ || console.warn("Duplicate key:", key));
          continue; // Skip duplicate
        }
        newKeys.add(key);

        let entry = cache.get(key);
        if (!entry || entry.item !== item) {
          // First time seeing this key, or item at this key changed → render template
          if (entry) {
            // Dispose old entry for this key
            const entryNodes = entry.nodes;
            for (let j = 0; j < entryNodes.length; j++) {
              entryNodes[j]!.parentNode?.removeChild(entryNodes[j]!);
            }
            entry.dispose();
          }
          const { fragment, dispose } = renderFn(item).render();
          entry = { item, nodes: [...fragment.childNodes], dispose };
          cache.set(key, entry);
        }
        newNodes.push(...entry.nodes);
      }

      // Remove nodes for deleted keys
      for (const [key, entry] of cache) {
        if (!newKeys.has(key)) {
          const entryNodes = entry.nodes;
          for (let j = 0; j < entryNodes.length; j++) {
            entryNodes[j]!.parentNode?.removeChild(entryNodes[j]!);
          }
          entry.dispose();
          cache.delete(key);
        }
      }

      // Reorder/insert nodes in correct order
      let prevNode: Node = marker;
      for (let i = newNodes.length - 1; i >= 0; i--) {
        const node = newNodes[i]!;
        if (node.nextSibling !== prevNode) {
          parent.insertBefore(node, prevNode);
        }
        prevNode = node;
      }

      nodes = newNodes;
    };

    updateList();
    const unsub = list.subscribe(updateList);

    return () => {
      unsub();
      for (const entry of cache.values()) {
        entry.dispose();
      }
      cache.clear();
      nodes.forEach((n) => n.parentNode?.removeChild(n));
      dispose?.();
    };
  }

  const update = (v: unknown) => {
    clear();
    const parent = marker.parentNode!;

    for (const item of Array.isArray(v) ? v : [v]) {
      if (item instanceof Template) {
        const { fragment, dispose } = item.render();
        childDisposers.push(dispose);
        nodes.push(...fragment.childNodes);
        parent.insertBefore(fragment, marker);
      } else if (item != null && typeof item !== "boolean") {
        const node = document.createTextNode(String(item));
        nodes.push(node);
        parent.insertBefore(node, marker);
      }
    }
  };

  const unsub = bind(value, update);
  return () => {
    unsub?.();
    clear();
  };
}

/** Tagged template literal for creating reactive HTML templates */
export const html = (strings: TemplateStringsArray, ...values: unknown[]) =>
  new Template(strings, values);

/** Marker symbol for keyed list objects */
const EACH = Symbol();

/** Keyed list descriptor */
interface EachDescriptor<T> {
  [EACH]: true;
  list: Reactive<T[]>;
  keyFn: (item: T, index: number) => unknown;
  renderFn: (item: T) => Template;
  dispose?: (() => void) | undefined;
}

/** List input type - accepts arrays, reactive arrays, or getter functions */
type ListInput<T> = T[] | Reactive<T[]> | (() => T[]);

/**
 * Efficient keyed list rendering.
 *
 * Caches templates by key, only re-rendering when items are added/removed.
 * For content updates within items, use nested signals:
 *
 * ```ts
 * const items = signal([
 *   { id: 1, name: signal("Alice") },
 *   { id: 2, name: signal("Bob") },
 * ]);
 *
 * // With explicit key (recommended when items may have same reference after re-fetch)
 * html`<ul>${each(items, i => i.id, i => html`<li>${i.name}</li>`)}</ul>`
 *
 * // Without key (uses object reference for objects, index for primitives)
 * html`<ul>${each(items, i => html`<li>${i.name}</li>`)}</ul>`
 *
 * // With getter function (useful with stores)
 * html`<ul>${each(() => state.items, i => html`<li>${i.name}</li>`)}</ul>`
 *
 * // With plain array (static, won't react to changes)
 * html`<ul>${each(["a", "b", "c"], i => html`<li>${i}</li>`)}</ul>`
 * ```
 */
export function each<T>(
  list: ListInput<T>,
  renderFn: (item: T) => Template,
): EachDescriptor<T>;
export function each<T>(
  list: ListInput<T>,
  keyFn: (item: T, index: number) => unknown,
  renderFn: (item: T) => Template,
): EachDescriptor<T>;
export function each<T>(
  list: ListInput<T>,
  keyFnOrRenderFn:
    | ((item: T, index: number) => unknown)
    | ((item: T) => Template),
  renderFn?: (item: T) => Template,
): EachDescriptor<T> {
  // Two-arg form: each(list, renderFn) - use object ref for objects, index for primitives
  const keyFn = renderFn
    ? (keyFnOrRenderFn as (item: T, index: number) => unknown)
    : (item: T, index: number) =>
        item !== null &&
        (typeof item === "object" || typeof item === "function")
          ? item
          : index;

  // Track if we created a computed for a getter function
  let dispose: (() => void) | undefined;
  let reactiveList: Reactive<T[]>;

  if (Array.isArray(list)) {
    reactiveList = signal(list);
  } else if (typeof list === "function") {
    const c = computed(list);
    reactiveList = c;
    dispose = () => c.dispose();
  } else {
    reactiveList = list;
  }

  return {
    [EACH]: true,
    list: reactiveList,
    keyFn,
    renderFn: renderFn ?? (keyFnOrRenderFn as (item: T) => Template),
    dispose,
  };
}
