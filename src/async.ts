/**
 * Async generator support for templates.
 *
 * This module provides opt-in support for async generators in templates,
 * enabling loading states, progressive content, and automatic restart
 * when signal dependencies change.
 *
 * @example
 * ```ts
 * import { html, signal } from "balises";
 * import { async } from "balises/async";
 *
 * const userId = signal(1);
 *
 * html`<div>${async(async function* () {
 *   yield html`<span>Loading user ${userId.value}...</span>`;
 *   const user = await fetchUser(userId.value);
 *   return html`<span>${user.name}</span>`;
 * })}</div>`;
 * ```
 */

import { onTrack, type Subscriber } from "./signals/context.js";
import type { Computed } from "./signals/computed.js";
import type { Signal } from "./signals/signal.js";
import { renderContent } from "./template.js";

/** Reactive source type */
type ReactiveSource = Signal<unknown> | Computed<unknown>;

/**
 * Opaque handle representing settled content from an async generator.
 *
 * When an async generator restarts due to signal changes, it receives the
 * previous settled content as its first argument. Return this value to
 * preserve the existing DOM instead of re-rendering.
 *
 * @example
 * ```ts
 * import { async, type RenderedContent } from "balises/async";
 *
 * async(async function* (settled?: RenderedContent) {
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
 * });
 * ```
 */
export interface RenderedContent {
  /** @internal Brand to prevent construction outside the library */
  readonly __brand: "RenderedContent";
}

/** Internal structure for RenderedContent */
interface RenderedContentInternal extends RenderedContent {
  readonly nodes: Node[];
  readonly childDisposers: (() => void)[];
}

/** Async generator function type */
type AsyncGenFn = (
  settled?: RenderedContent,
) => AsyncGenerator<unknown, unknown, unknown>;

/** Marker property for async generator descriptors */
const ASYNC_MARKER = "__asyncGen__";

/** Async generator descriptor - returned by async() */
export interface AsyncDescriptor {
  readonly [ASYNC_MARKER]: true;
  /** @internal Bind the async generator to a DOM position */
  __bind__(marker: Comment, disposers: (() => void)[]): void;
}

// Re-export marker for template.ts detection
export { ASYNC_MARKER };

/**
 * Wrap an async generator function for use in templates.
 *
 * The generator function:
 * - Can yield content progressively (loading states)
 * - Automatically tracks signal dependencies accessed before each yield
 * - Restarts when those dependencies change
 * - Receives previous settled content for DOM preservation on restart
 *
 * @example
 * ```ts
 * import { html, signal } from "balises";
 * import { async } from "balises/async";
 *
 * const userId = signal(1);
 *
 * // Basic usage - loading state then content
 * html`${async(async function* () {
 *   yield html`<div>Loading...</div>`;
 *   const data = await fetchData(userId.value);
 *   return html`<div>${data.name}</div>`;
 * })}`;
 *
 * // With DOM preservation on restart
 * html`${async(async function* (settled) {
 *   const id = userId.value;
 *   if (settled) {
 *     state.data = await fetchData(id);
 *     return settled; // Keep existing DOM
 *   }
 *   yield html`<div>Loading...</div>`;
 *   state.data = await fetchData(id);
 *   return html`<div>${() => state.data.name}</div>`;
 * })}`;
 * ```
 */
export function async(fn: AsyncGenFn): AsyncDescriptor {
  return {
    [ASYNC_MARKER]: true as const,
    __bind__(marker: Comment, disposers: (() => void)[]) {
      bindAsyncGenerator(fn, marker, disposers);
    },
  };
}

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
  const sources = new Set<ReactiveSource>();
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
        unsubscribers.push(source.subscribe(callback));
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
): void {
  let generator: AsyncGenerator<unknown> | null = null;
  let currentNodes: Node[] = [];
  let childDisposers: (() => void)[] = [];
  let disposed = false;
  let iterationId = 0;
  let depUnsubscribers: (() => void)[] = [];
  let lastSettled: RenderedContentInternal | null = null;

  const clearNodes = () => {
    for (let i = 0; i < childDisposers.length; i++) childDisposers[i]!();
    for (let i = 0; i < currentNodes.length; i++)
      currentNodes[i]!.parentNode?.removeChild(currentNodes[i]!);
    childDisposers = [];
    currentNodes = [];
  };

  const clearDeps = () => {
    for (let i = 0; i < depUnsubscribers.length; i++) depUnsubscribers[i]!();
    depUnsubscribers = [];
  };

  const cleanupGenerator = () => {
    clearDeps();
    if (generator) {
      generator.return(undefined);
      generator = null;
    }
  };

  const cleanup = () => {
    cleanupGenerator();
    clearNodes();
  };

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
        const tracked = track(() => generator!.next());

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

      if (thisIteration !== iterationId) return;

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
