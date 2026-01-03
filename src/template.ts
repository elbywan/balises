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
 * - Async generators: ${async function*() { yield html`...`; }}
 */

import {
  computed,
  isSignal,
  scope,
  signal,
  type Reactive,
} from "./signals/index.js";
import { track } from "./signals/context.js";
import { HTMLParser, type Attr } from "./parser.js";

const SVG_NS = "http://www.w3.org/2000/svg";

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

/**
 * Opaque handle representing settled content from an async generator.
 *
 * When an async generator restarts due to signal changes, it receives the
 * previous settled content as its first argument. Return this value to
 * preserve the existing DOM instead of re-rendering.
 *
 * @example
 * ```ts
 * async function* loadUser(settled?: RenderedContent) {
 *   const id = userId.value; // Track dependency
 *
 *   if (settled) {
 *     // Restart: update state, keep existing DOM
 *     const user = await fetchUser(id);
 *     state.user = user; // Triggers surgical updates via reactive bindings
 *     return settled; // Preserve DOM
 *   }
 *
 *   // First load
 *   yield html`<div class="skeleton">...</div>`;
 *   const user = await fetchUser(id);
 *   state.user = user;
 *   return UserCard({ state });
 * }
 * ```
 */
export interface RenderedContent {
  /** @internal Brand to prevent construction outside the library */
  readonly __brand: "RenderedContent";
}

/** Internal structure for RenderedContent (not exported) */
interface RenderedContentInternal extends RenderedContent {
  readonly nodes: Node[];
  readonly childDisposers: (() => void)[];
}

/** Check if a function is an async generator function */
function isAsyncGeneratorFunction(
  fn: unknown,
): fn is (settled?: RenderedContent) => AsyncGenerator<unknown> {
  return (
    typeof fn === "function" &&
    fn.constructor?.name === "AsyncGeneratorFunction"
  );
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
   *
   * @example
   * ```ts
   * const { fragment, dispose } = html`<div>Hello</div>`.render();
   * document.body.appendChild(fragment);
   *
   * // For async content, use async generators:
   * const { fragment, dispose } = html`
   *   <div>
   *     ${async function* () {
   *       yield html`<span>Loading...</span>`;
   *       const user = await fetchUser();
   *       yield html`<span>${user.name}</span>`;
   *     }}
   *   </div>
   * `.render();
   * ```
   */
  render(): RenderResult {
    const fragment = document.createDocumentFragment();
    const disposers: (() => void)[] = [];
    const stack: (Element | DocumentFragment)[] = [fragment];
    const parser = new HTMLParser();
    const values = this.values;

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

/** Cached entry for a keyed list item */
interface EachEntry {
  item: unknown;
  nodes: Node[];
  dispose: () => void;
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
 * Bind an async generator function to a marker position.
 * Tracks signal dependencies during generator execution and restarts
 * the generator when those dependencies change.
 *
 * Supports DOM preservation: when the generator receives a `settled` argument
 * (the previous render result) and returns it, the existing DOM is preserved
 * instead of being replaced.
 */
function bindAsyncGenerator(
  genFn: (settled?: RenderedContent) => AsyncGenerator<unknown>,
  marker: Comment,
  disposers: (() => void)[],
): void {
  let generator: AsyncGenerator<unknown> | null = null;
  let currentNodes: Node[] = [];
  let childDisposers: (() => void)[] = [];
  let disposed = false;
  let iterationId = 0;
  let depUnsubscribers: (() => void)[] = [];

  // Last settled content for DOM preservation on restart
  let lastSettled: RenderedContentInternal | null = null;

  /** Remove current nodes and dispose their cleanup functions */
  const clearNodes = () => {
    for (let i = 0; i < childDisposers.length; i++) childDisposers[i]!();
    for (let i = 0; i < currentNodes.length; i++)
      currentNodes[i]!.parentNode?.removeChild(currentNodes[i]!);
    childDisposers = [];
    currentNodes = [];
  };

  /** Unsubscribe from tracked dependencies */
  const clearDeps = () => {
    for (let i = 0; i < depUnsubscribers.length; i++) depUnsubscribers[i]!();
    depUnsubscribers = [];
  };

  /** Cleanup generator and dependencies (not nodes - for preservation support) */
  const cleanupGenerator = () => {
    clearDeps();
    if (generator) {
      // Fire-and-forget: triggers finally block without awaiting
      generator.return(undefined);
      generator = null;
    }
  };

  /** Full cleanup including nodes */
  const cleanup = () => {
    cleanupGenerator();
    clearNodes();
  };

  /** Clear nodes and render new content */
  const render = (value: unknown) => {
    clearNodes();
    renderContent(marker, value, currentNodes, childDisposers);
  };

  const runGenerator = async () => {
    const thisIteration = ++iterationId;
    cleanupGenerator();

    if (disposed) return;

    generator = genFn(lastSettled ?? undefined);
    let lastYielded: unknown = null;

    while (!disposed && thisIteration === iterationId) {
      let result: IteratorResult<unknown>;

      try {
        // Track signal accesses in the synchronous part (before yield/await)
        const tracked = track(() => generator!.next());

        // Restart generator when tracked dependencies change
        tracked.subscribe(() => {
          if (!disposed && thisIteration === iterationId) {
            void runGenerator();
          }
        });
        depUnsubscribers.push(tracked.unsubscribe);

        result = await tracked.value;
      } catch (e) {
        cleanup();
        if (!disposed) throw e;
        return;
      }

      // Stale iteration - a newer runGenerator() has started
      if (thisIteration !== iterationId) return;

      const { value, done } = result;

      if (done) {
        // DOM preservation: return settled to keep existing DOM
        if (value === lastSettled && lastSettled !== null) {
          currentNodes = lastSettled.nodes;
          childDisposers = lastSettled.childDisposers;
        } else {
          // Render final content and capture as settled
          render(value !== undefined ? value : lastYielded);
          lastSettled = {
            __brand: "RenderedContent" as const,
            nodes: currentNodes,
            childDisposers: childDisposers,
          };
        }
        return;
      }

      lastYielded = value;
      render(value);
    }
  };

  void runGenerator();

  disposers.push(() => {
    disposed = true;
    cleanup();
    lastSettled = null;
  });
}

/**
 * Bind dynamic content at a marker position.
 * Handles primitives (as text), Templates (rendered), Each (keyed lists), arrays,
 * and async generator functions.
 *
 * null/undefined/boolean render nothing (enables conditional: ${cond && html`...`})
 *
 * Returns a dispose function to clean up subscriptions and remove nodes.
 */
function bindContent(marker: Comment, value: unknown): () => void {
  let nodes: Node[] = [];
  let childDisposers: (() => void)[] = [];

  const clear = () => {
    childDisposers.forEach((d) => d());
    childDisposers = [];
    nodes.forEach((n) => (n as ChildNode).remove());
    nodes = [];
  };

  // Handle async generator functions
  if (isAsyncGeneratorFunction(value)) {
    const disposers: (() => void)[] = [];
    bindAsyncGenerator(value, marker, disposers);
    return () => disposers.forEach((d) => d());
  }

  // Handle each() - keyed list for efficient list rendering
  if (value != null && typeof value === "object" && EACH in value) {
    const cache = new Map<unknown, EachEntry>();
    const { list, keyFn, renderFn, dispose } = value as EachDescriptor<unknown>;
    let warned = 0;

    const updateList = () => {
      const parent = marker.parentNode!;
      const items = list.value;
      const newKeys = new Set<unknown>();
      const newNodes: Node[] = [];

      for (let i = 0; i < items.length; i++) {
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
            entry.nodes.forEach((n) => (n as ChildNode).remove());
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
          entry.nodes.forEach((n) => (n as ChildNode).remove());
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
      nodes.forEach((n) => (n as ChildNode).remove());
      dispose?.();
    };
  }

  // Sync update function for reactive values
  const update = (v: unknown) => {
    clear();
    renderContent(marker, v, nodes, childDisposers);
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
    : (item: T, index: number) => (Object(item) === item ? item : index);

  // Normalize list to reactive, track dispose if we created a computed
  const c = typeof list === "function" ? computed(list) : null;
  const reactiveList: Reactive<T[]> = Array.isArray(list)
    ? signal(list)
    : (c ?? (list as Reactive<T[]>));

  return {
    [EACH]: true,
    list: reactiveList,
    keyFn,
    renderFn: renderFn ?? (keyFnOrRenderFn as (item: T) => Template),
    dispose: c ? () => c.dispose() : undefined,
  };
}
