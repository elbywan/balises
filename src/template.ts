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

import {
  Signal,
  computed,
  isSignal,
  scope,
  type Reactive,
} from "./signals/index.js";
import { HTMLParser } from "./parser.js";
import { ssrTemplateData } from "./ssr-shared.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * HTML void elements - never have children or closing tags.
 * Treated as self-closing even when written without "/>".
 * @internal Exported for the SSR plugin.
 */
export const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

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
 * Returns the nodes and disposers for cleanup.
 *
 * Exported for use by plugins that need to render content
 * without duplicating the core rendering logic.
 *
 * When `tracked` is set, nested templates are rendered with slot tracking
 * so they can be re-bound in place (hot module replacement).
 * @internal The `tracked` parameter and return value are internal.
 */
export function renderValue(
  marker: Comment,
  value: unknown,
  nodes: Node[],
  disposers: (() => void)[],
  tracked = false,
): RenderResult | null {
  const parent = marker.parentNode!;
  const items = Array.isArray(value) ? value.flat() : [value];
  let nested: RenderResult | null = null;

  for (const item of items) {
    if (item instanceof Template) {
      const result =
        process.env.NODE_ENV !== "production" && tracked
          ? item.renderTracked()
          : item.render();
      if (process.env.NODE_ENV !== "production" && tracked) nested = result;
      disposers.push(result.dispose);
      nodes.push(...result.fragment.childNodes);
      parent.insertBefore(result.fragment, marker);
    } else if (item != null && typeof item !== "boolean") {
      const n = document.createTextNode(String(item));
      nodes.push(n);
      parent.insertBefore(n, marker);
    }
  }
  return nested;
}

/**
 * Html template tag function with plugin composition.
 */
export interface HtmlTag {
  (strings: TemplateStringsArray, ...values: unknown[]): Template;
  /** Create a new html tag with additional plugins */
  with(...plugins: InterpolationPlugin[]): HtmlTag;
}

/**
 * A re-bindable template slot (hot module replacement).
 * Calling it with a new value re-binds the slot, returning `false` when
 * the binding cannot be updated in place (the caller must re-render).
 * @internal Exported for the HMR module.
 */
export interface Slot {
  (v: unknown): boolean;
}

/** Result of rendering a template */
export interface RenderResult {
  fragment: DocumentFragment;
  dispose: () => void;
  /**
   * Re-binding slots, indexed by template value index.
   * Empty for plain renders — only `renderTracked()` populates them.
   * @internal Exported for the HMR module.
   */
  slots: Slot[];
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
 * @internal Exported for the hydration module.
 */
export function wrapFn(fn: () => unknown, d: (() => void)[]) {
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
 * @internal Exported for the hydration module.
 */
export function bind(
  v: unknown,
  update: (v: unknown) => void,
  d: (() => void)[],
) {
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
    // Registered for the SSR renderer and hydration module.
    ssrTemplateData.set(this, [strings, values]);
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

  /**
   * Render with per-slot re-binding support (hot module replacement).
   * @internal Exported for the HMR module.
   */
  renderTracked(): RenderResult {
    if (process.env.NODE_ENV !== "production") {
      let cached = cache.get(this.#strings);
      if (!cached) cache.set(this.#strings, (cached = this.#buildPrototype()));
      return this.#instantiate(cached, true);
    }
    return this.render();
  }

  /**
   * Re-bind a previously rendered result with this template's values.
   * Only re-binds slots whose values changed; unchanged slots keep their
   * DOM nodes and live bindings. Returns `false` when the static source
   * differs or a slot cannot be updated in place — the caller must
   * re-render from scratch.
   * @internal Exported for the HMR module.
   */
  rebind(prev: Template, result: RenderResult): boolean {
    if (process.env.NODE_ENV !== "production") {
      const as = this.#strings,
        bs = prev.#strings;
      if (as.length !== bs.length) return false;
      for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false;
      const slots = result.slots,
        values = this.#values;
      for (let i = 0; i < values.length; i++) {
        const slot = slots[i];
        if (!slot || !slot(values[i]!)) return false;
      }
      return true;
    }
    return false;
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
        if (!selfClose && !VOID_ELEMENTS.has(tag.toLowerCase())) {
          stack.push(el);
        }
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
  #instantiate([proto, bindings]: Cached, track = false): RenderResult {
    const frag = proto.cloneNode(true) as DocumentFragment;
    const disposers: (() => void)[] = [];
    const values = this.#values;
    // Re-binding slots, one per template value index (tracked renders only).
    // Production builds fold the guard to a plain empty array.
    const slots: Slot[] =
      process.env.NODE_ENV !== "production" && track
        ? new Array(values.length)
        : [];

    // Single TreeWalker pass to collect all binding nodes
    const nodes = collectBindingNodes(frag, bindings);

    for (let i = 0; i < bindings.length; i++) {
      const b = bindings[i]!;
      const node = nodes[i]!;

      if (b[0] === 0) {
        // Content binding - fast path for static values inline
        const value = values[b[2]];
        const t = typeof value;
        // `!(process.env.NODE_ENV !== "production" && track)` folds to `true` in production builds.
        if (
          !(process.env.NODE_ENV !== "production" && track) &&
          (t === "string" || t === "number" || t === "bigint")
        ) {
          // Static primitive - insert text node directly, no disposer needed
          // (text nodes have no subscriptions and are removed with parent)
          const n = document.createTextNode(String(value));
          node.parentNode!.insertBefore(n, node);
        } else if (
          !(process.env.NODE_ENV !== "production" && track) &&
          (value == null || t === "boolean")
        ) {
          // null, undefined, boolean - render nothing, no disposer needed
        } else {
          // Functions, signals, objects, arrays, templates - full binding
          const slot = this.#bindContent(
            node as Comment,
            value,
            disposers,
            track,
          );
          // #bindContent only returns null for untracked renders.
          if (process.env.NODE_ENV !== "production" && track)
            slots[b[2]] = slot!;
        }
      } else if (b[0] === 1) {
        // Attribute binding
        const [, , name, statics, attrSlots] = b;
        // Current slot values for this binding (tracked mode only).
        const holder: unknown[] =
          process.env.NODE_ENV !== "production"
            ? new Array(attrSlots.length)
            : [];
        if (process.env.NODE_ENV !== "production")
          attrSlots.forEach((s, j) => (holder[j] = values[s]));
        const getVal = (j: number) =>
          process.env.NODE_ENV !== "production"
            ? holder[j]
            : values[attrSlots[j]!];
        const d =
          process.env.NODE_ENV !== "production" && track ? [] : disposers;
        // Built by refresh() — wrapFn computeds run eagerly at construction,
        // so building twice would double-execute function slots.
        let resolved: unknown[] = [];
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
          const next = attrSlots.length === 1 && allNull ? null : result;
          if (next !== prev) {
            prev = next;
            if (next === null) (node as Element).removeAttribute(name);
            else (node as Element).setAttribute(name, next);
          }
        };
        const refresh = () => {
          // Tracked mode uses a binding-local disposer array; untracked
          // shares the render's array, which must never be drained here
          // (other bindings' subscriptions live in it).
          if (process.env.NODE_ENV !== "production" && track) {
            for (const f of d) f();
            d.length = 0;
          }
          resolved = attrSlots.map((_, j) => {
            const v = getVal(j);
            return typeof v === "function" ? wrapFn(v as () => unknown, d) : v;
          });
          update();
          for (const r of resolved)
            if (isSignal(r)) d.push(r.subscribe(update));
        };
        refresh();
        if (process.env.NODE_ENV !== "production" && track) {
          disposers.push(() => {
            for (const f of d) f();
          });
          attrSlots.forEach((s, j) => {
            slots[s] = (v: unknown) => {
              const oldV = holder[j];
              if (v === oldV) return true;
              // Carry signal state into the new instance.
              if (v instanceof Signal && isSignal(oldV))
                (v as Signal<unknown>).value = (
                  oldV as Reactive<unknown>
                ).value;
              holder[j] = v;
              refresh();
              return true;
            };
          });
        }
      } else if (b[0] === 2) {
        // Property binding
        const [, , name, slot] = b;
        const d =
          process.env.NODE_ENV !== "production" && track ? [] : disposers;
        const update = (v: unknown) =>
          ((node as unknown as Record<string, unknown>)[name] = v);
        let current = values[slot];
        bind(current, update, d);
        if (process.env.NODE_ENV !== "production" && track) {
          disposers.push(() => {
            for (const f of d) f();
          });
          slots[slot] = (v: unknown) => {
            if (v === current) return true;
            if (v instanceof Signal && isSignal(current))
              (v as Signal<unknown>).value = (
                current as Reactive<unknown>
              ).value;
            for (const f of d) f();
            d.length = 0;
            current = v;
            bind(current, update, d);
            return true;
          };
        }
      } else {
        // Event binding
        const [, , name, slot] = b;
        let handler = values[slot] as EventListener;
        node.addEventListener(name, handler);
        disposers.push(() => {
          // Nodes removed from the DOM are garbage-collected with their
          // listeners - skip the removal (nodes in a detached fragment
          // keep their parentNode, so this only skips truly removed nodes).
          if (node.parentNode !== null) {
            node.removeEventListener(name, handler);
          }
        });
        if (process.env.NODE_ENV !== "production" && track)
          slots[slot] = (v: unknown) => {
            if (v === handler) return true;
            node.removeEventListener(name, handler);
            handler = v as EventListener;
            node.addEventListener(name, handler);
            return true;
          };
      }
    }

    return {
      fragment: frag,
      slots,
      dispose: () => {
        for (const f of disposers) f();
      },
    };
  }

  /**
   * Bind content slot - handles plugins, templates, arrays, and reactive
   * values. In tracked mode, returns a re-bindable slot.
   */
  #bindContent(
    marker: Comment,
    value: unknown,
    disposers: (() => void)[],
    track = false,
  ): Slot | null {
    // Binding-local disposers: a fresh array in tracked mode (re-bindable),
    // the shared render disposers otherwise.
    const d = process.env.NODE_ENV !== "production" && track ? [] : disposers;
    let currentNodes: Node[] = [],
      childDisposers: (() => void)[] = [];
    // Cleanup callback registered by a plugin that took over rendering.
    // Called when transitioning back to default rendering or on dispose.
    let pluginCleanup: (() => void) | null = null;
    // Last nested template render, for in-place re-binding (tracked mode).
    let nested: RenderResult | null = null;

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
            const prevLen = d.length;
            const skip = binder(marker, d) === false;
            const added = d.splice(prevLen);
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
        (currentNodes[0] as Text).nodeValue = String(v);
        return;
      }
      clear();
      nested = renderValue(marker, v, currentNodes, childDisposers, track);
    };

    // Bind a value, checking plugins against the raw value first: bind()
    // wraps functions in computed() before update runs, which would hide
    // plugin-detectable values like async generator functions.
    const bindValue = (v: unknown) => {
      for (const plugin of plugins) {
        const binder = plugin(v);
        if (binder) {
          binder(marker, d);
          return;
        }
      }
      bind(v, update, d);
    };

    bindValue(value);
    if (process.env.NODE_ENV !== "production" && track) {
      disposers.push(() => {
        for (const f of d) f();
        clear();
      });
      let current = value;
      return (v: unknown) => {
        if (v === current) return true;
        // Re-bind nested templates in place when their static source is
        // unchanged (child components survive a hot reload).
        if (
          current instanceof Template &&
          v instanceof Template &&
          nested !== null &&
          v.rebind(current, nested)
        ) {
          current = v;
          return true;
        }
        // Carry module-scope signal state into the new instance.
        if (v instanceof Signal && isSignal(current)) {
          (v as Signal<unknown>).value = (current as Reactive<unknown>).value;
        }
        // Clear before re-binding: the old content (including plugin-owned
        // regions like each() rows) must be gone before a fresh binder runs,
        // or the old cleanup would remove the newly rendered nodes.
        for (const f of d) f();
        d.length = 0;
        clear();
        bindValue(v);
        current = v;
        return true;
      };
    }
    disposers.push(clear);
    return null;
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
