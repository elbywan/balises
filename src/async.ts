/**
 * Async generator support for templates.
 *
 * This module provides opt-in support for async generators in templates,
 * enabling loading states, progressive content, and automatic restart
 * when signal dependencies change.
 *
 * @example
 * ```ts
 * import { html as baseHtml, signal } from "balises";
 * import asyncPlugin from "balises/async";
 *
 * const html = baseHtml.with(asyncPlugin);
 * const userId = signal(1);
 *
 * // Async generators are auto-detected - no wrapper needed!
 * html`<div>${async function* () {
 *   yield html`<span>Loading user ${userId.value}...</span>`;
 *   const user = await fetchUser(userId.value);
 *   return html`<span>${user.name}</span>`;
 * }}</div>`.render();
 * ```
 */

import {
  onTrack,
  type Subscriber,
  type TrackableSource,
} from "./signals/context.js";
import { renderValue, Template, type InterpolationPlugin } from "./template.js";
import {
  clearRegion,
  registerHydrateHandler,
  type HydrateRecurse,
} from "./hydrate.js";
import { isSignal, type Reactive } from "./signals/index.js";

/** Reactive source type - TrackableSource may or may not be subscribable */
type SubscribableSource = Reactive<unknown>;

/**
 * Opaque handle representing settled content from an async generator.
 *
 * When an async generator restarts due to signal changes, it receives the
 * previous settled content as its first argument. Return this value to
 * preserve the existing DOM instead of re-rendering.
 *
 * @example
 * ```ts
 * import asyncPlugin, { type RenderedContent } from "balises/async";
 *
 * async function* loadUser(
 *   settled?: RenderedContent,
 *   ctx?: AsyncGeneratorContext<{ lastId?: number }>,
 * ) {
 *   const id = userId.value; // Track dependency
 *   const previous = ctx?.lastId;
 *   ctx && (ctx.lastId = id);
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
 *   const user = await fetchUser(id, { signal: ctx?.signal });
 *   state.user = user;
 *   return UserCard({ state });
 *   // The fetch is cancelled when the generator restarts (id changed),
 *   // the binding is disposed, or a stream consumer stops early.
 * }
 * ```
 */
export interface RenderedContent {
  /** @internal Brand to prevent construction outside the library */
  readonly __brand: "RenderedContent";
}

/**
 * Mutable context object that persists across async generator restarts.
 *
 * `signal` is replaced with a fresh AbortSignal for every run: it aborts
 * when the generator restarts (a tracked signal changed mid-run) or the
 * binding is disposed, and on the server when a stream consumer stops
 * early. Pass it to fetch()/requests so in-flight work is cancelled
 * instead of wasting bandwidth.
 */
export type AsyncGeneratorContext<T extends object = Record<string, unknown>> =
  T & { signal: AbortSignal };

/** Internal structure for RenderedContent */
interface RenderedContentInternal extends RenderedContent {
  readonly nodes: Node[];
  readonly childDisposers: (() => void)[];
  /** Node before the hydrated region; region clears walk back to it. */
  readonly boundary: Node | null;
}

/** Async generator function type */
type AsyncGenFn = (
  settled?: RenderedContent,
  ctx?: AsyncGeneratorContext,
) => AsyncGenerator<unknown, unknown, unknown>;

/**
 * Check if a value is an async generator function.
 * @internal Exported for the SSR plugin.
 */
export function isAsyncGeneratorFunction(
  value: unknown,
): value is AsyncGeneratorFunction {
  if (typeof value !== "function") return false;
  const constructor = value.constructor;
  return (
    constructor &&
    (constructor.name === "AsyncGeneratorFunction" ||
      // Check prototype chain for async generator
      Object.prototype.toString.call(constructor.prototype) ===
        "[object AsyncGeneratorFunction]")
  );
}

/**
 * Plugin that handles async generator functions.
 * Auto-detects `async function*` without needing a wrapper.
 */
const asyncPlugin: InterpolationPlugin = (value) => {
  if (!isAsyncGeneratorFunction(value)) return null;

  return (marker, disposers) => {
    bindAsyncGenerator(value as AsyncGenFn, marker, disposers);
  };
};

/**
 * Hydrate server-rendered async content: the region holds the settled
 * content rendered by renderToStringAsync; it is adopted and passed to
 * the generator as the `settled` handle so restarts can preserve it.
 * The settled content's own bindings are hydrated in place: the
 * generator is run once without the seed (it must produce its settled
 * template from already-available state) and the region is walked with
 * it. Inner disposers go into the seed's childDisposers so a restart
 * or dispose cleans them up.
 * @internal
 */
registerHydrateHandler((value) => {
  if (typeof value !== "function" || !isAsyncGeneratorFunction(value)) {
    return null;
  }
  return (contentStart, anchor, disposers, recurse: HydrateRecurse) => {
    const nodes: Node[] = [];
    let node = contentStart;
    while (node && node !== anchor) {
      nodes.push(node);
      node = node.nextSibling;
    }
    const seed: RenderedContentInternal = {
      __brand: "RenderedContent" as const,
      nodes,
      childDisposers: [],
      boundary: contentStart?.previousSibling ?? null,
    };
    // Learn the settled template and hydrate the region's inner
    // bindings. The generator must settle without network access here
    // (e.g. from state already restored from the page payload). If the
    // settled content does not align with the region (e.g. the route
    // changed since the render), replace it with a fresh render.
    //
    // The walk instance gets its own context: generators that read
    // ctx.signal work here too, and the signal aborts when the binding
    // is disposed, cancelling any stray in-flight work.
    const context: AsyncGeneratorContext = {} as AsyncGeneratorContext;
    const walkController = new AbortController();
    context.signal = walkController.signal;
    disposers.push(() => walkController.abort());
    void (async () => {
      // The generator may throw (e.g. a fetch error it does not catch).
      // The bound generator owns the error path; this walk-instance only
      // learns the settled template, so errors are ignored here.
      let result: IteratorResult<unknown>;
      let lastYield: unknown = null;
      try {
        const gen = (value as AsyncGenFn)(undefined, context);
        result = await gen.next();
        while (!result.done) {
          lastYield = result.value;
          result = await gen.next();
        }
      } catch {
        return;
      }
      // Same "settled content" semantics as the server renderer: the
      // return value, or the last yield when the generator returns
      // undefined.
      const settledContent =
        result.value !== undefined ? result.value : lastYield;
      if (settledContent instanceof Template) {
        const aligned = recurse(
          settledContent,
          nodes[0] ?? null,
          anchor,
          seed.childDisposers,
        );
        if (!aligned) {
          // The binding may have replaced the region while the walk ran
          // (both run the generator's fetch path): clear whatever
          // currently sits between the region boundary and the anchor,
          // then render the settled content fresh.
          for (const f of seed.childDisposers) f();
          seed.childDisposers.length = 0;
          clearRegion(seed.boundary ?? null, anchor);
          nodes.length = 0;
          renderValue(anchor, settledContent, nodes, seed.childDisposers);
        }
      }
    })();
    bindAsyncGenerator(value as AsyncGenFn, anchor, disposers, seed);
    return true;
  };
});

export default asyncPlugin;

/** Result of tracking dependencies during a function call */
interface TrackResult<T> {
  value: T;
  subscribe: (callback: Subscriber) => void;
  unsubscribe: () => void;
}

/**
 * Track reactive dependencies accessed during a function call.
 * Sets up the onTrack hook temporarily to capture signal/computed accesses.
 */
function track<T>(fn: () => T): TrackResult<T> {
  const sources = new Set<TrackableSource>();
  const prevHook = onTrack.current;
  onTrack.current = (source) => sources.add(source);

  let value: T;
  try {
    value = fn();
  } finally {
    onTrack.current = prevHook;
  }

  let unsubscribers: (() => void)[] = [];
  let subscribed = false;

  return {
    value,
    subscribe: (callback: Subscriber) => {
      if (subscribed) return;
      subscribed = true;
      for (const source of sources) {
        // Only subscribe to actual signals/computeds (not selector slots)
        if (isSignal(source)) {
          unsubscribers.push(
            (source as SubscribableSource).subscribe(callback),
          );
        }
      }
    },
    unsubscribe: () => {
      for (const unsub of unsubscribers) unsub();
      unsubscribers = [];
      subscribed = false;
    },
  };
}

/**
 * Bind an async generator function to a marker position.
 * Tracks signal dependencies during generator execution and restarts
 * the generator when those dependencies change.
 */
function bindAsyncGenerator(
  genFn: AsyncGenFn,
  marker: Comment,
  disposers: (() => void)[],
  seed?: RenderedContentInternal,
): void {
  let generator: AsyncGenerator<unknown> | null = null;
  let currentNodes: Node[] = seed ? [...seed.nodes] : [];
  let childDisposers: (() => void)[] = [];
  let disposed = false;
  let iterationId = 0;
  let depUnsubscribers: (() => void)[] = [];
  let lastSettled: RenderedContentInternal | null = seed ?? null;
  const context: AsyncGeneratorContext = {} as AsyncGeneratorContext;
  let controller: AbortController | null = null;

  const clearNodes = () => {
    for (let i = 0; i < childDisposers.length; i++) childDisposers[i]!();
    childDisposers = [];
    if (seed) {
      // Hydrated region: concurrent renders (the hydration walk's own
      // fetch path) may have inserted nodes the seed collection does not
      // know about - remove whatever currently sits between the region
      // boundary and the marker.
      clearRegion(seed.boundary ?? null, marker);
    } else {
      for (let i = 0; i < currentNodes.length; i++)
        currentNodes[i]!.parentNode?.removeChild(currentNodes[i]!);
    }
    currentNodes = [];
  };

  const clearDeps = () => {
    for (let i = 0; i < depUnsubscribers.length; i++) depUnsubscribers[i]!();
    depUnsubscribers = [];
  };

  const cleanupGenerator = () => {
    clearDeps();
    // Cancel the previous run: its context signal aborts, so in-flight
    // requests wired to it stop instead of wasting bandwidth.
    if (controller) {
      controller.abort();
      controller = null;
    }
    if (generator) {
      // The pending next() may reject (e.g. an AbortError from the
      // cancelled signal): mark the return() promise handled so the
      // cancellation never surfaces as an unhandled rejection.
      void generator.return(undefined).catch(() => {});
      generator = null;
    }
  };

  const cleanup = () => {
    cleanupGenerator();
    clearNodes();
  };

  const render = (value: unknown) => {
    if (!marker.parentNode) return; // Binding removed (e.g. hidden branch).
    clearNodes();
    renderValue(marker, value, currentNodes, childDisposers);
  };

  const runGenerator = async () => {
    const thisIteration = ++iterationId;
    cleanupGenerator();

    if (disposed) return;

    // Fresh signal for this run: aborts when the run is superseded
    // (restart) or the binding is disposed.
    controller = new AbortController();
    context.signal = controller.signal;

    generator = genFn(lastSettled ?? undefined, context);
    let lastYielded: unknown = null;

    while (!disposed && thisIteration === iterationId) {
      let result: IteratorResult<unknown>;

      try {
        const tracked = track(() => generator!.next());

        tracked.subscribe(() => {
          if (!disposed && thisIteration === iterationId) {
            void runGenerator();
          }
        });
        depUnsubscribers.push(tracked.unsubscribe);

        result = await tracked.value;
      } catch (e) {
        // A superseded run (restarted or disposed) must not touch the
        // region - it belongs to a newer run - and its cancellation
        // errors (e.g. AbortError from ctx.signal) are expected.
        if (disposed || thisIteration !== iterationId) return;
        cleanup();
        throw e;
      }

      // The binding may have been disposed or replaced while the
      // generator was awaiting - never render into a dead slot.
      if (disposed || thisIteration !== iterationId) return;

      const { value, done } = result;

      if (done) {
        if (value === lastSettled && lastSettled !== null) {
          currentNodes = lastSettled.nodes;
          childDisposers = lastSettled.childDisposers;
        } else {
          render(value !== undefined ? value : lastYielded);
          lastSettled = {
            __brand: "RenderedContent" as const,
            nodes: currentNodes,
            childDisposers: childDisposers,
            boundary: seed?.boundary ?? null,
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
