/**
 * Memo plugin for functional components.
 *
 * Prevents unnecessary DOM re-renders by memoizing component output.
 * Uses a dual-cache strategy:
 *
 * 1. **Closure cache** (in `memo()`): Caches lastProps/lastDescriptor per
 *    component. When props haven't changed, returns the same descriptor
 *    reference so `computed` skips via `Object.is` without notifying
 *    subscribers — no update fires, no DOM work.
 *
 * 2. **Per-marker cache** (in the plugin binder): A WeakMap keyed by marker
 *    Comment nodes. When multiple slots share the same memo component and
 *    trigger signal, the closure cache gets invalidated by whichever slot
 *    evaluates last. The per-marker cache catches this: if props for *this
 *    specific slot* and *this component* haven't changed, the binder returns
 *    early without pushing disposers, so template.ts preserves the existing DOM.
 *
 * Requires plugin registration: `html.with(memoPlugin)`
 *
 * @example
 * ```ts
 * import { html as baseHtml, signal } from "balises";
 * import memoPlugin, { memo } from "balises/memo";
 *
 * const html = baseHtml.with(memoPlugin);
 * const count = signal(0);
 *
 * const Counter = memo(({ count }: { count: number }) => {
 *   return html`<div>Count: ${count}</div>`;
 * });
 *
 * // Inside a reactive binding, Counter returns a MemoDescriptor.
 * // When props are equal, memo() returns the same descriptor reference,
 * // so computed skips via Object.is without touching the DOM.
 * html`<div>${() => Counter({ count: count.value })}</div>`.render();
 * ```
 */

import { renderValue, type InterpolationPlugin } from "./template.js";
import { registerHydrateHandler } from "./hydrate.js";
import { MEMO } from "./descriptors.js";

export { MEMO } from "./descriptors.js";

/** Descriptor returned by a memoized component call */
interface MemoDescriptor<TProps extends object = object> {
  readonly [MEMO]: true;
  readonly component: (props: TProps) => unknown;
  readonly props: TProps;
  readonly areEqual: (a: TProps, b: TProps) => boolean;
  /** Returns a helpful error message when rendered without the plugin. */
  toString(): string;
}

/** Per-marker cache entry for slot-level memoization */
interface MemoCache<TProps extends object = object> {
  component: MemoComponent<TProps>;
  lastProps: TProps;
  areEqual: (a: TProps, b: TProps) => boolean;
  /** Nodes and disposers of the last successful render, so a deferred
   * (detached-marker) re-render can replace content that the template's
   * pluginCleanup cannot see. */
  nodes: Node[];
  childDisposers: (() => void)[];
}

/** WeakMap keyed by marker Comment nodes for per-slot memoization */
const markerCache = new WeakMap<Comment, MemoCache>();

/** Memoized component function */
export type MemoComponent<TProps extends object = object> = (
  props: TProps,
) => unknown;

/** Optional comparison function for custom memoization logic.
 * Return true if props are equal (skip re-render), false otherwise. */
export type PropsComparator<TProps extends object = object> = (
  prevProps: TProps,
  nextProps: TProps,
) => boolean;

/**
 * Default shallow equality comparison for props.
 * Compares own enumerable keys using Object.is().
 */
function shallowEqual<TProps extends object>(
  prev: TProps,
  next: TProps,
): boolean {
  if (prev === next) return true;

  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of prevKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(next, key) ||
      !Object.is(
        (prev as Record<string, unknown>)[key],
        (next as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Create a memoized functional component.
 *
 * The returned function caches the last props and descriptor. When called
 * with equal props (per comparator), it returns the same descriptor
 * reference. This lets `computed` skip via `Object.is` without even
 * notifying subscribers.
 *
 * @param component - The functional component to memoize
 * @param compare - Optional custom comparison function for props.
 *                  Return true if props are equal (skip re-render).
 * @returns A memoized component function that returns MemoDescriptors
 */
export function memo<TProps extends object = object>(
  component: MemoComponent<TProps>,
  compare?: PropsComparator<TProps>,
): (props: TProps) => MemoDescriptor<TProps> {
  const areEqual = compare ?? shallowEqual;
  let lastProps: TProps | undefined;
  let lastDescriptor: MemoDescriptor<TProps> | undefined;

  return (props: TProps): MemoDescriptor<TProps> => {
    // If props match the last call, return the same descriptor reference.
    // This means `computed` sees the same object via Object.is and
    // skips subscriber notification entirely (fast path).
    if (
      lastProps !== undefined &&
      lastDescriptor &&
      areEqual(lastProps, props)
    ) {
      return lastDescriptor;
    }

    lastProps = props;
    lastDescriptor = {
      [MEMO]: true as const,
      component,
      props,
      areEqual,
      toString() {
        return "[MemoDescriptor - did you forget html.with(memoPlugin)?]";
      },
    };
    return lastDescriptor;
  };
}

/**
 * Plugin that handles MemoDescriptor values in templates.
 *
 * Uses a dual-cache strategy for optimal skip detection:
 *
 * 1. The closure cache (in `memo()`) handles the common case: same component,
 *    same props → same descriptor reference → computed skips via Object.is.
 *
 * 2. The per-marker cache handles the multi-slot case: when multiple slots
 *    share a memo component and trigger signal, the closure cache gets
 *    invalidated by whichever slot evaluates last. The per-marker cache
 *    detects that *this specific slot's* props haven't changed and returns
 *    `false` to signal template.ts to skip clearing — preserving the existing
 *    DOM and pluginCleanup.
 */
// Hydration: render the component's output fresh into the slot region.
registerHydrateHandler((value) => {
  if (!(value && typeof value === "object" && MEMO in value)) return null;
  return (contentStart, anchor, disposers) => {
    const desc = value as MemoDescriptor;
    const nodes: Node[] = [];
    const childDisposers: (() => void)[] = [];
    let node = contentStart;
    while (node && node !== anchor) {
      const next = node.nextSibling;
      (node as ChildNode).remove();
      node = next;
    }
    renderValue(anchor, desc.component(desc.props), nodes, childDisposers);
    disposers.push(() => {
      for (const d of childDisposers) d();
      for (const n of nodes) (n as ChildNode).remove();
    });
  };
});

const memoPlugin: InterpolationPlugin = (value) => {
  if (!(value && typeof value === "object" && MEMO in value)) return null;

  return (marker, disposers) => {
    const desc = value as MemoDescriptor;
    let disposed = false;
    let pendingReattachCheck = false;

    // Render the component and take ownership of the result.
    // The previous render's content is replaced only after the new render
    // succeeds (a throwing component/render must leave it intact), and
    // idempotently - the same arrays are also owned by the template's
    // pluginCleanup disposer. Needed because a deferred render's content
    // is invisible to pluginCleanup.
    const render = (): void => {
      const result = desc.component(desc.props);
      const nodes: Node[] = [];
      const childDisposers: (() => void)[] = [];
      try {
        renderValue(marker, result, nodes, childDisposers);
      } catch (e) {
        // Partial render: remove already-inserted nodes and run disposers
        // so a throwing nested template can't leak DOM.
        for (const d of childDisposers) d();
        for (const n of nodes) (n as ChildNode).remove();
        throw e;
      }

      const prev = markerCache.get(marker);
      if (prev) {
        for (const d of prev.childDisposers) d();
        prev.childDisposers.length = 0;
        for (const n of prev.nodes) (n as ChildNode).remove();
        prev.nodes.length = 0;
      }

      // Set per-marker cache after successful render
      const entry = {
        component: desc.component,
        lastProps: desc.props,
        areEqual: desc.areEqual,
        nodes,
        childDisposers,
      };
      markerCache.set(marker, entry);

      disposers.push(() => {
        disposed = true;
        for (const d of childDisposers) d();
        childDisposers.length = 0;
        for (const n of nodes) (n as ChildNode).remove();
        nodes.length = 0;
        // Only delete the entry this render created: template.ts runs the
        // previous cycle's disposer after the binder has already written a
        // fresh entry, so an unconditional delete would kill the cache on
        // every re-render.
        if (markerCache.get(marker) === entry) markerCache.delete(marker);
      });
    };

    // Returns false to signal template.ts to skip clearing (cache hit or
    // deferred render) — the existing DOM must be preserved.
    const update = (): boolean => {
      // Per-marker cache check: if this marker already rendered the same
      // component with the same comparator and equal props, skip. The
      // comparator is part of the identity: two memo() instances over the
      // same function may use different ones.
      const cached = markerCache.get(marker);
      if (
        cached &&
        cached.component === desc.component &&
        cached.areEqual === desc.areEqual &&
        cached.areEqual(cached.lastProps, desc.props)
      ) {
        return false;
      }

      if (!marker.parentNode) {
        // Marker detached (e.g., inside a hidden cached when()/match()
        // branch): don't crash on the missing parent - keep the previous
        // content and retry once the marker is re-attached (typically the
        // same tick, when the branch is re-shown).
        if (!pendingReattachCheck) {
          pendingReattachCheck = true;
          queueMicrotask(() => {
            pendingReattachCheck = false;
            if (!disposed && marker.parentNode) update();
          });
        }
        return false;
      }

      render();
      return true;
    };

    return update() ? undefined : false;
  };
};

export default memoPlugin;
