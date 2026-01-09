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
  ): ((marker: Comment, disposers: (() => void)[]) => void) | null;
}

/**
 * Html template tag function with plugin composition.
 */
export interface HtmlTag {
  (strings: TemplateStringsArray, ...values: unknown[]): Template;
  /** Create a new html tag with additional plugins */
  with(...plugins: InterpolationPlugin[]): HtmlTag;
}

/** Information about a single binding point */
type BindingInfo =
  | { type: "text"; path: number[]; slot: number }
  | {
      type: "attr";
      path: number[];
      name: string;
      statics: string[];
      slots: number[];
    }
  | { type: "prop"; path: number[]; slot: number; name: string }
  | { type: "event"; path: number[]; slot: number; name: string };

/** Cached template structure */
interface CachedTemplate {
  prototype: DocumentFragment; // The DOM structure to clone
  bindings: BindingInfo[]; // How to apply values after cloning
}

/** Template cache - keyed by static string parts identity */
const cache = new WeakMap<TemplateStringsArray, CachedTemplate>();

/**
 * Create a computed that wraps function execution in a scope.
 * Nested computeds/effects are automatically disposed on re-run.
 * Returns [computed, dispose] - dispose cleans up both the computed
 * and any nested reactives from the last run.
 */
function scopedComputed<T>(fn: () => T) {
  let disposeScope: (() => void) | undefined;

  const c = computed(() => {
    disposeScope?.();
    const [result, dispose] = scope(fn);
    disposeScope = dispose;
    return result;
  });

  return [c, () => (c.dispose(), disposeScope?.())] as const;
}

/**
 * Bind a value to an update function.
 * If reactive, subscribes and returns unsubscribe. Otherwise returns undefined.
 * Functions are wrapped in computed() for automatic reactivity.
 * Nested computeds/effects created inside functions are automatically
 * disposed when the function re-runs or the binding is disposed.
 */
function bind(
  value: unknown,
  update: (v: unknown) => void,
): (() => void) | undefined {
  let dispose: (() => void) | undefined;
  if (typeof value === "function") {
    [value, dispose] = scopedComputed(value as () => unknown);
  }
  if (isSignal(value)) {
    update(value.value);
    const unsub = value.subscribe(() =>
      update((value as Reactive<unknown>).value),
    );
    return dispose ? () => (unsub(), dispose()) : unsub;
  }
  update(value);
  return dispose;
}

/** Result of rendering a template */
export interface RenderResult {
  fragment: DocumentFragment;
  dispose: () => void;
}

/** Walk a path to find a node in a fragment */
function walkPath(root: Node, path: number[]): Node {
  let node: Node = root;
  for (let i = 0; i < path.length; i++) node = node.childNodes[path[i]!]!;
  return node;
}

/** A parsed HTML template. Call render() to create live DOM. */
export class Template {
  constructor(
    private strings: TemplateStringsArray,
    private values: unknown[],
    private plugins: InterpolationPlugin[] = [],
  ) {}

  /**
   * Parse template and create live DOM.
   * Returns the fragment and a dispose function to clean up subscriptions.
   *
   * Templates are cached by their static string parts - subsequent renders
   * clone the cached DOM structure instead of rebuilding it.
   */
  render(): RenderResult {
    let cached = cache.get(this.strings);

    if (!cached) {
      cached = this.buildPrototype();
      cache.set(this.strings, cached);
    }

    return this.instantiate(cached);
  }

  /**
   * Build the prototype DOM and collect binding metadata.
   * This is called only on the first render for each unique template.
   */
  private buildPrototype(): CachedTemplate {
    const fragment = document.createDocumentFragment();
    const bindings: BindingInfo[] = [];
    const stack: (Element | DocumentFragment)[] = [fragment];
    const path: number[] = []; // Current path - push/pop as we traverse
    const parser = new HTMLParser();

    parser.parseTemplate(this.strings, {
      onText: (text) => {
        stack.at(-1)!.append(text);
      },

      onOpenTag: (tag, attrs, selfClosing) => {
        const parent = stack.at(-1)!;
        const childIndex = parent.childNodes.length;

        const isSvg =
          tag === "svg" ||
          tag === "SVG" ||
          (parent instanceof Element && parent.namespaceURI === SVG_NS);
        const el = isSvg
          ? document.createElementNS(SVG_NS, tag)
          : document.createElement(tag);

        // Process attributes - record bindings for dynamic ones
        for (const [name, statics, slots] of attrs) {
          if (slots.length > 0) {
            // Has dynamic parts - record binding
            const bindingPath = [...path, childIndex];

            if (name[0] === "@") {
              bindings.push({
                type: "event",
                path: bindingPath,
                slot: slots[0]!,
                name: name.slice(1),
              });
            } else if (name[0] === ".") {
              bindings.push({
                type: "prop",
                path: bindingPath,
                slot: slots[0]!,
                name: name.slice(1),
              });
            } else {
              bindings.push({
                type: "attr",
                path: bindingPath,
                name,
                statics,
                slots,
              });
            }
          } else {
            // Static attribute - apply directly to prototype
            el.setAttribute(name, statics[0] ?? "");
          }
        }

        parent.appendChild(el);

        if (!selfClosing) {
          stack.push(el);
          path.push(childIndex);
        }
      },

      onClose: () => {
        if (stack.length > 1) {
          stack.pop();
          path.pop();
        }
      },

      onSlot: (index) => {
        const parent = stack.at(-1)!;
        const childIndex = parent.childNodes.length;

        const marker = document.createComment("");
        parent.appendChild(marker);

        bindings.push({
          type: "text",
          path: [...path, childIndex],
          slot: index,
        });
      },
    });

    return { prototype: fragment, bindings };
  }

  /**
   * Clone the cached prototype and apply bindings.
   * This is the fast path for subsequent renders.
   *
   * IMPORTANT: We must walk all paths BEFORE applying any bindings,
   * because text bindings insert content which shifts sibling indices.
   */
  private instantiate(cached: CachedTemplate): RenderResult {
    const fragment = cached.prototype.cloneNode(true) as DocumentFragment;
    const disposers: (() => void)[] = [];
    const values = this.values;
    const plugins = this.plugins;

    // First pass: resolve all paths to actual node references
    // This must happen before any content insertion which could shift indices
    const nodes = cached.bindings.map((binding) =>
      walkPath(fragment, binding.path),
    );

    // Second pass: apply bindings using the resolved node references
    for (let i = 0; i < cached.bindings.length; i++) {
      const binding = cached.bindings[i]!;
      const node = nodes[i]!;

      switch (binding.type) {
        case "text":
          disposers.push(
            bindContent(node as Comment, values[binding.slot], plugins),
          );
          break;

        case "attr":
          this.applyAttrBinding(node as Element, binding, values, disposers);
          break;

        case "prop": {
          const { name, slot } = binding;
          let prev: unknown;
          const unsub = bind(values[slot], (v) => {
            if (Object.is(v, prev)) return;
            prev = v;
            (node as unknown as Record<string, unknown>)[name] = v;
          });
          if (unsub) disposers.push(unsub);
          break;
        }

        case "event": {
          const { name, slot } = binding;
          const handler = values[slot] as EventListener;
          node.addEventListener(name, handler);
          disposers.push(() => node.removeEventListener(name, handler));
          break;
        }
      }
    }

    return { fragment, dispose: () => disposers.forEach((d) => d()) };
  }

  /** Apply an attribute binding */
  private applyAttrBinding(
    el: Element,
    binding: Extract<BindingInfo, { type: "attr" }>,
    values: unknown[],
    disposers: (() => void)[],
  ): void {
    const { name, statics, slots } = binding;

    // Convert functions to scoped computeds, track all reactives
    const resolved: unknown[] = [];
    const reactives: Reactive<unknown>[] = [];
    for (let i = 0; i < slots.length; i++) {
      let v = values[slots[i]!];
      if (typeof v === "function") {
        const [c, dispose] = scopedComputed(v as () => unknown);
        v = c;
        disposers.push(dispose);
      }
      resolved[i] = v;
      if (isSignal(v)) reactives.push(v);
    }

    let prev: string | null | undefined;
    const update = () => {
      let result = statics[0]!;
      let allNull = true;
      for (let i = 0; i < resolved.length; i++) {
        const v = resolved[i];
        const val = isSignal(v) ? (v as Reactive<unknown>).value : v;
        if (val != null && val !== false) allNull = false;
        result += (val === true ? "" : (val ?? "")) + statics[i + 1]!;
      }
      const next = slots.length === 1 && allNull ? null : result;
      if (next === prev) return;
      prev = next;
      if (next === null) el.removeAttribute(name);
      else el.setAttribute(name, next);
    };

    update();
    for (let i = 0; i < reactives.length; i++) {
      disposers.push(reactives[i]!.subscribe(update));
    }
  }
}

/**
 * Bind dynamic content at a marker position.
 * Tries plugins first (first match wins), then falls back to default handling.
 */
function bindContent(
  marker: Comment,
  value: unknown,
  plugins: InterpolationPlugin[],
): () => void {
  // Try plugins first (first match wins)
  for (const plugin of plugins) {
    const binder = plugin(value);
    if (binder) {
      const pluginDisposers: (() => void)[] = [];
      binder(marker, pluginDisposers);
      return () => pluginDisposers.forEach((d) => d());
    }
  }

  // Default handling
  let nodes: Node[] = [];
  let childDisposers: (() => void)[] = [];
  let prevPrimitive: unknown;

  const clear = () => {
    for (let i = 0; i < childDisposers.length; i++) childDisposers[i]!();
    childDisposers = [];
    for (let i = 0; i < nodes.length; i++) (nodes[i] as ChildNode).remove();
    nodes = [];
    prevPrimitive = undefined;
  };

  const update = (v: unknown) => {
    // Fast path: update existing text node for primitives
    const isPrimitive =
      v != null && typeof v !== "boolean" && typeof v !== "object";
    if (
      isPrimitive &&
      nodes.length === 1 &&
      childDisposers.length === 0 &&
      nodes[0] instanceof Text
    ) {
      const str = String(v);
      if (str !== prevPrimitive) {
        prevPrimitive = str;
        nodes[0].textContent = str;
      }
      return;
    }

    clear();
    const parent = marker.parentNode!;

    // Render content (handles arrays, templates, primitives)
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

    // Track primitive for future fast-path
    if (isPrimitive && nodes.length === 1 && childDisposers.length === 0) {
      prevPrimitive = String(v);
    }
  };

  const unsub = bind(value, update);
  return () => {
    unsub?.();
    clear();
  };
}

/**
 * Create an html tag function with the given plugins.
 */
function createHtmlWithPlugins(plugins: InterpolationPlugin[]): HtmlTag {
  const tag = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    new Template(strings, values, plugins)) as HtmlTag;

  tag.with = (...morePlugins: InterpolationPlugin[]) =>
    createHtmlWithPlugins([...plugins, ...morePlugins]);

  return tag;
}

/**
 * Tagged template literal for creating reactive HTML templates.
 * Use .with(...plugins) to add interpolation handlers like each() or async generators.
 *
 * @example
 * ```ts
 * import { html } from "balises";
 * import eachPlugin, { each } from "balises/each";
 * import asyncPlugin from "balises/async";
 *
 * const html = baseHtml.with(eachPlugin, asyncPlugin);
 *
 * html`<div>${async function* () { ... }}</div>`.render();
 * ```
 */
export const html: HtmlTag = createHtmlWithPlugins([]);
