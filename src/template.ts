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
 *
 * Extend with plugins via html.with(...plugins) for additional interpolation types.
 *
 * Templates are cached by their static string parts - the DOM structure is built
 * once and cloned for subsequent renders, significantly improving performance.
 */

import { computed, isSignal, scope, type Reactive } from "./signals/index.js";
import { HTMLParser } from "./parser.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Plugin that handles custom interpolation types.
 * Return a bind function if this plugin handles the value, null otherwise.
 * First plugin to return non-null wins.
 */
export interface InterpolationPlugin {
  (
    value: unknown,
  ): ((marker: Comment, disposers: (() => void)[]) => void | false) | null;
}

/**
 * Render a value into DOM nodes before a marker.
 * Handles Templates, arrays, primitives, null/undefined/booleans.
 * Returns the created nodes and disposers for cleanup.
 *
 * Exported for use by plugins that need to render content
 * without duplicating the core rendering logic.
 */
export function renderValue(
  marker: Comment,
  value: unknown,
  nodes: Node[],
  disposers: (() => void)[],
): void {
  const parent = marker.parentNode!;
  const items = Array.isArray(value) ? value.flat() : [value];

  for (const item of items) {
    if (item instanceof Template) {
      const { fragment, dispose } = item.render();
      disposers.push(dispose);
      nodes.push(...fragment.childNodes);
      parent.insertBefore(fragment, marker);
    } else if (item != null && typeof item !== "boolean") {
      const n = document.createTextNode(String(item));
      nodes.push(n);
      parent.insertBefore(n, marker);
    }
  }
}

/**
 * Html template tag function with plugin composition.
 */
export interface HtmlTag {
  (strings: TemplateStringsArray, ...values: unknown[]): Template;
  /** Create a new html tag with additional plugins */
  with(...plugins: InterpolationPlugin[]): HtmlTag;
}

/** Result of rendering a template */
export interface RenderResult {
  fragment: DocumentFragment;
  dispose: () => void;
}

/**
 * Binding descriptor stored in cache.
 * Uses tuple format for compact storage:
 * - [0, nodeIndex, slotIndex] - text content binding
 * - [1, nodeIndex, attrName, staticParts, slotIndices] - attribute binding
 * - [2, nodeIndex, propName, slotIndex] - property binding
 * - [3, nodeIndex, eventName, slotIndex] - event binding
 *
 * nodeIndex is the index in a TreeWalker traversal (elements + comments only).
 */
type Binding =
  | [0, number, number]
  | [1, number, string, string[], number[]]
  | [2, number, string, number]
  | [3, number, string, number];

/** Cached template: prototype fragment and binding descriptors */
type Cached = [DocumentFragment, Binding[]];

/** Template cache - keyed by static string parts identity */
const cache = new WeakMap<TemplateStringsArray, Cached>();

/**
 * Wrap a function in a scoped computed.
 * Nested computeds/effects are automatically disposed on re-run.
 * Registers disposal of both the computed and nested reactives.
 */
function wrapFn(fn: () => unknown, d: (() => void)[]) {
  let cleanup: (() => void) | undefined;
  const c = computed(() => {
    cleanup?.();
    const [r, dispose] = scope(fn);
    cleanup = dispose;
    return r;
  });
  d.push(() => (c.dispose(), cleanup?.()));
  return c;
}

/**
 * Bind a value to an update function.
 * Functions are wrapped in computed() for automatic reactivity.
 * Nested computeds/effects created inside functions are automatically
 * disposed when the function re-runs or the binding is disposed.
 */
function bind(v: unknown, update: (v: unknown) => void, d: (() => void)[]) {
  if (typeof v === "function") v = wrapFn(v as () => unknown, d);
  if (isSignal(v)) {
    update(v.value);
    d.push(v.subscribe(() => update((v as Reactive<unknown>).value)));
  } else update(v);
}

/**
 * Collect nodes for all bindings using a single TreeWalker pass.
 * TreeWalker with filter 129 (SHOW_ELEMENT | SHOW_COMMENT) visits nodes
 * in the same order they were created, matching our nodeIndex counter.
 * Bindings are in document order but may share nodes (multiple attrs).
 */
function collectBindingNodes(
  frag: DocumentFragment,
  bindings: Binding[],
): Node[] {
  if (!bindings.length) return [];

  const result: Node[] = new Array(bindings.length);
  const walker = document.createTreeWalker(frag, 129); // SHOW_ELEMENT | SHOW_COMMENT
  let nodeIndex = -1;
  let node: Node | null = null;

  for (let i = 0; i < bindings.length; i++) {
    const targetIndex = bindings[i]![1];
    // Advance walker to the target node
    while (nodeIndex < targetIndex) {
      node = walker.nextNode();
      nodeIndex++;
    }
    result[i] = node!;
  }

  return result;
}

/** A parsed HTML template. Call render() to create live DOM. */
export class Template {
  #strings: TemplateStringsArray;
  #values: unknown[];
  #plugins: InterpolationPlugin[];

  constructor(
    strings: TemplateStringsArray,
    values: unknown[],
    plugins: InterpolationPlugin[] = [],
  ) {
    this.#strings = strings;
    this.#values = values;
    this.#plugins = plugins;
  }

  /**
   * Parse template and create live DOM.
   * Returns the fragment and a dispose function to clean up subscriptions.
   *
   * Templates are cached by their static string parts - subsequent renders
   * clone the cached DOM structure instead of rebuilding it.
   */
  render(): RenderResult {
    let cached = cache.get(this.#strings);
    if (!cached) cache.set(this.#strings, (cached = this.#buildPrototype()));
    return this.#instantiate(cached);
  }

  /** Build the prototype fragment and collect binding descriptors */
  #buildPrototype(): Cached {
    const frag = document.createDocumentFragment();
    const bindings: Binding[] = [];
    const stack: (Element | DocumentFragment)[] = [frag];
    // nodeIndex counts elements and comments (what TreeWalker visits)
    let nodeIndex = 0;

    new HTMLParser().parseTemplate(this.#strings, {
      onText: (t) => stack[stack.length - 1]!.append(t),

      onOpenTag: (tag, attrs, selfClose) => {
        const parent = stack[stack.length - 1]!;
        const svg =
          tag === "svg" ||
          tag === "SVG" ||
          (parent instanceof Element && parent.namespaceURI === SVG_NS);
        const el = svg
          ? document.createElementNS(SVG_NS, tag)
          : document.createElement(tag);

        const elIndex = nodeIndex++;
        for (const [name, statics, slots] of attrs) {
          if (!slots.length) el.setAttribute(name, statics[0] ?? "");
          else {
            const c = name[0];
            if (c === "@")
              bindings.push([3, elIndex, name.slice(1), slots[0]!]);
            else if (c === ".")
              bindings.push([2, elIndex, name.slice(1), slots[0]!]);
            else bindings.push([1, elIndex, name, statics, slots]);
          }
        }

        parent.appendChild(el);
        if (!selfClose) stack.push(el);
      },

      onClose: () => {
        if (stack.length > 1) stack.pop();
      },

      onSlot: (i) => {
        const parent = stack[stack.length - 1]!;
        parent.appendChild(document.createComment(""));
        bindings.push([0, nodeIndex++, i]);
      },
    });

    return [frag, bindings];
  }

  /** Clone the prototype and apply bindings with current values */
  #instantiate([proto, bindings]: Cached): RenderResult {
    const frag = proto.cloneNode(true) as DocumentFragment;
    const disposers: (() => void)[] = [];
    const values = this.#values;

    // Single TreeWalker pass to collect all binding nodes
    const nodes = collectBindingNodes(frag, bindings);

    for (let i = 0; i < bindings.length; i++) {
      const b = bindings[i]!;
      const node = nodes[i]!;

      if (b[0] === 0) {
        // Content binding - fast path for static values inline
        const value = values[b[2]];
        const t = typeof value;
        if (t === "string" || t === "number" || t === "bigint") {
          // Static primitive - insert text node directly, no disposer needed
          // (text nodes have no subscriptions and are removed with parent)
          const n = document.createTextNode(String(value));
          node.parentNode!.insertBefore(n, node);
        } else if (value == null || t === "boolean") {
          // null, undefined, boolean - render nothing, no disposer needed
        } else {
          // Functions, signals, objects, arrays, templates - full binding
          this.#bindContent(node as Comment, value, disposers);
        }
      } else if (b[0] === 1) {
        // Attribute binding
        const [, , name, statics, slots] = b;
        const resolved = slots.map((s) => {
          const v = values[s];
          return typeof v === "function"
            ? wrapFn(v as () => unknown, disposers)
            : v;
        });
        let prev: string | null | undefined;

        const update = () => {
          let result = statics[0]!,
            allNull = true;
          for (let j = 0; j < resolved.length; j++) {
            const val = isSignal(resolved[j])
              ? (resolved[j] as Reactive<unknown>).value
              : resolved[j];
            if (val != null && val !== false) allNull = false;
            result += (val === true ? "" : (val ?? "")) + statics[j + 1]!;
          }
          const next = slots.length === 1 && allNull ? null : result;
          if (next !== prev) {
            prev = next;
            if (next === null) (node as Element).removeAttribute(name);
            else (node as Element).setAttribute(name, next);
          }
        };
        update();
        for (const r of resolved)
          if (isSignal(r)) disposers.push(r.subscribe(update));
      } else if (b[0] === 2) {
        // Property binding
        const [, , name, slot] = b;
        bind(
          values[slot],
          (v) => ((node as unknown as Record<string, unknown>)[name] = v),
          disposers,
        );
      } else {
        // Event binding
        const [, , name, slot] = b;
        const handler = values[slot] as EventListener;
        node.addEventListener(name, handler);
        disposers.push(() => node.removeEventListener(name, handler));
      }
    }

    return {
      fragment: frag,
      dispose: () => {
        for (const f of disposers) f();
      },
    };
  }

  /** Bind content slot - handles plugins, templates, arrays, and reactive values */
  #bindContent(marker: Comment, value: unknown, disposers: (() => void)[]) {
    // Try plugins first
    for (const plugin of this.#plugins) {
      const binder = plugin(value);
      if (binder) {
        binder(marker, disposers);
        return;
      }
    }

    // Full reactive path for functions, signals, objects, arrays, templates
    let currentNodes: Node[] = [],
      childDisposers: (() => void)[] = [];
    // Cleanup callback registered by a plugin that took over rendering.
    // Called when transitioning back to default rendering or on dispose.
    let pluginCleanup: (() => void) | null = null;

    const clear = () => {
      if (pluginCleanup) {
        pluginCleanup();
        pluginCleanup = null;
      }
      for (const f of childDisposers) f();
      childDisposers = [];
      for (const n of currentNodes) (n as ChildNode).remove();
      currentNodes = [];
    };

    const plugins = this.#plugins;

    const update = (v: unknown) => {
      // Try plugins on computed results (e.g., MemoDescriptor from reactive bindings)
      if (plugins.length > 0) {
        for (const plugin of plugins) {
          const binder = plugin(v);
          if (binder) {
            // Run binder, then clear old content unless the binder returned
            // `false` to signal "skip — preserve existing DOM". This enables
            // plugins like memo to opt out of clearing on cache hits while
            // ensuring all other plugins (each, async, match, user plugins)
            // get correct clear-after-bind behavior by default.
            const prevLen = disposers.length;
            const skip = binder(marker, disposers) === false;
            const added = disposers.splice(prevLen);
            if (!skip) {
              clear();
            }
            if (added.length) {
              pluginCleanup = () => {
                for (const f of added) f();
              };
            }
            return;
          }
        }
      }

      // Fast path: update existing text node for primitives
      if (
        v != null &&
        typeof v !== "boolean" &&
        typeof v !== "object" &&
        currentNodes.length === 1 &&
        !childDisposers.length &&
        currentNodes[0] instanceof Text
      ) {
        currentNodes[0].textContent = String(v);
        return;
      }
      clear();
      renderValue(marker, v, currentNodes, childDisposers);
    };

    bind(value, update, disposers);
    disposers.push(clear);
  }
}

function createHtml(plugins: InterpolationPlugin[]): HtmlTag {
  const tag = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    new Template(strings, values, plugins)) as HtmlTag;
  tag.with = (...more: InterpolationPlugin[]) =>
    createHtml([...plugins, ...more]);
  return tag;
}

export const html: HtmlTag = createHtml([]);
