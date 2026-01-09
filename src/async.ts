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
import { Template, type InterpolationPlugin } from "./template.js";
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

/** Internal structure for RenderedContent */
interface RenderedContentInternal extends RenderedContent {
  readonly nodes: Node[];
  readonly childDisposers: (() => void)[];
}

/** Async generator function type */
type AsyncGenFn = (
  settled?: RenderedContent,
) => AsyncGenerator<unknown, unknown, unknown>;

/**
 * Check if a value is an async generator function.
 */
function isAsyncGeneratorFunction(
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
 * Render content and insert nodes before marker.
 * Handles Templates and primitives.
 */
function insertContent(
  marker: Comment,
  value: unknown,
  nodes: Node[],
  disposers: (() => void)[],
): void {
  const parent = marker.parentNode!;

  for (const item of Array.isArray(value) ? value : [value]) {
    if (item instanceof Template) {
      const { fragment, dispose } = item.render();
      disposers.push(dispose);
      nodes.push(...fragment.childNodes);
      parent.insertBefore(fragment, marker);
    } else if (item != null && typeof item !== "boolean") {
      const node = document.createTextNode(String(item));
      nodes.push(node);
      parent.insertBefore(node, marker);
    }
  }
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
    insertContent(marker, value, currentNodes, childDisposers);
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
