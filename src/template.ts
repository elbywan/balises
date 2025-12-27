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

import { computed, isSignal, signal, type Reactive } from "./signal.js";
import { HTMLParser } from "./parser.js";

/**
 * Bind a value to an update function.
 * If reactive, subscribes and returns unsubscribe. Otherwise returns null.
 */
function bind(
  value: unknown,
  update: (v: unknown) => void,
): (() => void) | null {
  if (isSignal(value)) {
    update(value.value);
    return value.subscribe(() => update((value as Reactive<unknown>).value));
  }
  update(value);
  return null;
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

    parser.parseTemplate(this.strings, {
      onText: (text) => {
        stack.at(-1)!.appendChild(document.createTextNode(text));
      },

      onElement: (el, selfClosing) => {
        stack.at(-1)!.appendChild(el);
        if (!selfClosing) stack.push(el);
      },

      onClose: () => {
        if (stack.length > 1) stack.pop();
      },

      onAttribute: (el, name, parts) => {
        const prefix = name[0];

        // Event binding: @click=${handler}
        if (prefix === "@") {
          const event = name.slice(1);
          const part = parts[0];
          if (part && typeof part !== "string") {
            const handler = values[part.index] as EventListener;
            el.addEventListener(event, handler);
            disposers.push(() => el.removeEventListener(event, handler));
          }
          return;
        }

        // Property binding: .value=${data} - sets DOM property directly
        if (prefix === ".") {
          const prop = name.slice(1);
          const part = parts[0];
          if (part && typeof part !== "string") {
            const unsub = bind(values[part.index], (v) => {
              (el as unknown as Record<string, unknown>)[prop] = v;
            });
            if (unsub) disposers.push(unsub);
          }
          return;
        }

        // Static attribute (all parts are strings)
        if (parts.every((p) => typeof p === "string")) {
          const value = parts.join("");
          if (value || parts.length === 0) {
            el.setAttribute(name, value);
          }
          return;
        }

        // Dynamic attribute - has at least one interpolated value
        const dynamicParts = parts.filter(
          (p): p is { index: number } => typeof p !== "string",
        );
        const signals = dynamicParts
          .map((p) => values[p.index])
          .filter(isSignal) as Reactive<unknown>[];

        // Single dynamic with no static parts: handle null/false as removal
        const isSingleDynamic =
          parts.length === 1 && typeof parts[0] !== "string";

        const update = () => {
          if (isSingleDynamic) {
            // Boolean/null handling: false/null removes, true sets empty string
            const v = values[dynamicParts[0]!.index];
            const val = isSignal(v) ? (v as Reactive<unknown>).value : v;
            if (val == null || val === false) el.removeAttribute(name);
            else el.setAttribute(name, val === true ? "" : String(val));
          } else {
            // Multi-part: concatenate all parts
            const resolved = parts
              .map((p) => {
                if (typeof p === "string") return p;
                const v = values[p.index];
                const val = isSignal(v) ? (v as Reactive<unknown>).value : v;
                return val == null ? "" : String(val);
              })
              .join("");
            el.setAttribute(name, resolved);
          }
        };

        update();
        signals.forEach((s) => disposers.push(s.subscribe(update)));
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
  if (isEach(value)) {
    const cache = new Map<unknown, EachEntry>();
    const { list, keyFn, renderFn } = value;
    let warnedDuplicate = false;

    const updateList = () => {
      const parent = marker.parentNode!;
      const items = list.value;
      const newKeys = new Set<unknown>();
      const newNodes: Node[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const key = keyFn(item, i);

        if (newKeys.has(key)) {
          if (!warnedDuplicate) {
            warnedDuplicate = true;
            console.warn(
              `[balises] Duplicate key in each(): ${String(key)}. ` +
                `Each item should have a unique key. Consider providing a keyFn.`,
            );
          }
          continue; // Skip duplicate
        }
        newKeys.add(key);

        let entry = cache.get(key);
        if (!entry || entry.item !== item) {
          // First time seeing this key, or item at this key changed → render template
          if (entry) {
            // Dispose old entry for this key
            entry.nodes.forEach((n) => n.parentNode?.removeChild(n));
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
          entry.nodes.forEach((n) => n.parentNode?.removeChild(n));
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
}

/** Type guard for Each descriptor */
const isEach = (v: unknown): v is EachDescriptor<unknown> =>
  v != null && typeof v === "object" && EACH in v;

/** List input type - accepts arrays, reactive arrays, or getter functions */
type ListInput<T> = T[] | Reactive<T[]> | (() => T[]);

/** Normalize list input to a reactive signal */
function toReactiveList<T>(list: ListInput<T>): Reactive<T[]> {
  if (Array.isArray(list)) return signal(list);
  if (typeof list === "function") return computed(list);
  return list;
}

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
  const reactiveList = toReactiveList(list);

  if (renderFn === undefined) {
    // Two-arg form: each(list, renderFn)
    // Use object reference for objects, index for primitives
    return {
      [EACH]: true,
      list: reactiveList,
      keyFn: (item, index) =>
        item !== null &&
        (typeof item === "object" || typeof item === "function")
          ? item
          : index,
      renderFn: keyFnOrRenderFn as (item: T) => Template,
    };
  }
  // Three-arg form: each(list, keyFn, renderFn)
  return {
    [EACH]: true,
    list: reactiveList,
    keyFn: keyFnOrRenderFn as (item: T, index: number) => unknown,
    renderFn,
  };
}
