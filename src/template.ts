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
 */

import { computed, isSignal, scope, type Reactive } from "./signals/index.js";
import { HTMLParser, type Attr } from "./parser.js";

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
 * If reactive, subscribes and returns unsubscribe. Otherwise returns null.
 * Functions are wrapped in computed() for automatic reactivity.
 * Nested computeds/effects created inside functions are automatically
 * disposed when the function re-runs or the binding is disposed.
 */
function bind(
  value: unknown,
  update: (v: unknown) => void,
): (() => void) | null | undefined {
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
}

/** Result of rendering a template */
export interface RenderResult {
  fragment: DocumentFragment;
  dispose: () => void;
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
   */
  render(): RenderResult {
    const fragment = document.createDocumentFragment();
    const disposers: (() => void)[] = [];
    const stack: (Element | DocumentFragment)[] = [fragment];
    const parser = new HTMLParser();
    const values = this.values;
    const plugins = this.plugins;

    const handleAttribute = (el: Element, [name, statics, indexes]: Attr) => {
      const idx0 = indexes[0];

      // Event binding: @click=${handler}
      if (name[0] === "@") {
        if (idx0 != null) {
          const handler = values[idx0] as EventListener;
          el.addEventListener(name.slice(1), handler);
          disposers.push(() => el.removeEventListener(name.slice(1), handler));
        }
        return;
      }

      // Property binding: .value=${data} - sets DOM property directly
      if (name[0] === ".") {
        if (idx0 != null) {
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

      // Wrap functions in scoped computed, collect all reactive sources
      const reactives: Reactive<unknown>[] = [];
      for (const idx of indexes) {
        const v = values[idx];
        if (typeof v === "function") {
          const [c, dispose] = scopedComputed(v as () => unknown);
          values[idx] = c;
          reactives.push(c);
          disposers.push(dispose);
        } else if (isSignal(v)) {
          reactives.push(v);
        }
      }

      const update = () => {
        let result = statics[0]!;
        for (let i = 0; i < indexes.length; i++) {
          const v = values[indexes[i]!];
          const val = isSignal(v) ? (v as Reactive<unknown>).value : v;
          // Single dynamic attr: handle boolean/null specially
          if (indexes.length === 1 && (val == null || val === false)) {
            el.removeAttribute(name);
            return;
          }
          result += (val === true ? "" : (val ?? "")) + statics[i + 1]!;
        }
        el.setAttribute(name, result);
      };

      update();
      for (const s of reactives) disposers.push(s.subscribe(update));
    };

    /**
     * Bind dynamic content at a marker position.
     * Tries plugins first (first match wins), then falls back to default handling.
     */
    const bindContent = (marker: Comment, value: unknown): (() => void) => {
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

      const clear = () => {
        childDisposers.forEach((d) => d());
        childDisposers = [];
        nodes.forEach((n) => (n as ChildNode).remove());
        nodes = [];
      };

      const update = (v: unknown) => {
        clear();
        renderContent(marker, v, nodes, childDisposers);
      };

      const unsub = bind(value, update);
      return () => {
        unsub?.();
        clear();
      };
    };

    parser.parseTemplate(this.strings, {
      onText: (text) => {
        stack.at(-1)!.append(text);
      },

      onOpenTag: (tag, attrs, selfClosing) => {
        const parent = stack.at(-1)!;
        const isSvg =
          tag === "svg" ||
          tag === "SVG" ||
          (parent instanceof Element && parent.namespaceURI === SVG_NS);
        const el = isSvg
          ? document.createElementNS(SVG_NS, tag)
          : document.createElement(tag);
        for (const attr of attrs) handleAttribute(el, attr);
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

/**
 * Render content and insert nodes before marker.
 * Handles Templates, primitives, arrays.
 */
function renderContent(
  marker: Comment,
  v: unknown,
  nodes: Node[],
  childDisposers: (() => void)[],
): void {
  const parent = marker.parentNode!;

  for (const item of Array.isArray(v) ? v : [v]) {
    // Handle templates
    if (item instanceof Template) {
      const { fragment, dispose } = item.render();
      childDisposers.push(dispose);
      nodes.push(...fragment.childNodes);
      parent.insertBefore(fragment, marker);
    }
    // Handle primitives (ignore null/undefined/boolean)
    else if (item != null && typeof item !== "boolean") {
      const node = document.createTextNode(String(item));
      nodes.push(node);
      parent.insertBefore(node, marker);
    }
  }
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
