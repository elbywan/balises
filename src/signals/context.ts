/**
 * Global state and batching for the reactive system.
 */

import type { Computed } from "./computed.js";
import type { Signal } from "./signal.js";

/** Callback function for subscribers */
export type Subscriber = () => void;

/** Reactive source type - either a Signal or Computed */
type ReactiveSource = Signal<unknown> | Computed<unknown>;

/** The currently executing computed (for dependency tracking) */
export let context: Computed<unknown> | null = null;

/** Set the current execution context */
export function setContext(c: Computed<unknown> | null): void {
  context = c;
}

/** Batching: defer subscriber notifications until batch completes */
let batchDepth = 0;
let batchQueue: Set<Subscriber> | null = null;

/**
 * Batch multiple signal updates into a single notification pass.
 * Subscribers are only notified after the batch function completes.
 */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  if (batchDepth === 1) batchQueue = new Set();
  try {
    return fn();
  } finally {
    if (--batchDepth === 0) {
      const q = batchQueue!;
      batchQueue = null;
      for (const sub of q) sub();
    }
  }
}

/** Check if currently batching */
export function isBatching(): boolean {
  return batchDepth > 0;
}

/** Add a subscriber to the batch queue */
export function enqueueBatchOne(sub: Subscriber): void {
  batchQueue!.add(sub);
}

/** Add multiple subscribers to the batch queue */
export function enqueueBatchAll(subs: Subscriber[]): void {
  for (let i = 0; i < subs.length; i++) batchQueue!.add(subs[i]!);
}

/** Scope disposal: collect all disposers in a scope */
let disposalStack: Array<Array<() => void>> | null = null;

/**
 * Create a disposal scope that collects all subscriptions and computeds created within.
 * Returns the result of the function and a dispose function that cleans up all resources.
 *
 * @example
 * ```ts
 * const [result, dispose] = scope(() => {
 *   const count = signal(0);
 *   const doubled = computed(() => count.value * 2);
 *   effect(() => console.log(doubled.value));
 *   return { count, doubled };
 * });
 *
 * // Later: clean up all subscriptions and computeds
 * dispose();
 * ```
 */
export function scope<T>(fn: () => T): [result: T, dispose: () => void] {
  const disposers: Array<() => void> = [];

  // Push new disposal context
  if (!disposalStack) disposalStack = [];
  disposalStack.push(disposers);

  try {
    const result = fn();
    return [
      result,
      () => {
        for (let i = disposers.length - 1; i >= 0; i--) {
          disposers[i]!();
        }
        disposers.length = 0;
      },
    ];
  } finally {
    // Pop disposal context
    disposalStack.pop();
    if (!disposalStack.length) disposalStack = null;
  }
}

/**
 * Register a disposer in the current scope (if any).
 * This is called internally by computed/effect when they create cleanup functions.
 */
export function registerDisposer(dispose: () => void): void {
  disposalStack?.at(-1)?.push(dispose);
}

/** Result of tracking dependencies during a function call */
export interface TrackResult<T = unknown> {
  /** The return value of the tracked function */
  value: T;
  /** Subscribe to dependency changes - returns unsubscribe function */
  subscribe: (callback: () => void) => void;
  /** Unsubscribe from all tracked dependencies */
  unsubscribe: () => void;
}

/** Stack for tracking mode - collects accessed sources */
let trackingStack: Array<Set<ReactiveSource>> | null = null;

/** Check if we're currently in tracking mode */
export function isTracking(): boolean {
  return trackingStack !== null && trackingStack.length > 0;
}

/** Add a source to the current tracking context (if any) */
export function addTrackedSource(source: ReactiveSource): void {
  trackingStack?.at(-1)?.add(source);
}

/**
 * Track reactive dependencies accessed during a function call.
 * Returns the function result and allows subscribing to dependency changes.
 *
 * This is used for async generators to track dependencies before each await.
 *
 * @example
 * ```ts
 * const result = track(() => {
 *   return signal.value + computed.value; // These accesses are tracked
 * });
 *
 * result.subscribe(() => {
 *   console.log("Dependencies changed!");
 * });
 * ```
 */
export function track<T>(fn: () => T): TrackResult<T> {
  const sources = new Set<ReactiveSource>();

  // Push tracking context
  if (!trackingStack) trackingStack = [];
  trackingStack.push(sources);

  let value: T;
  try {
    value = fn();
  } finally {
    // Pop tracking context
    trackingStack.pop();
    if (trackingStack.length === 0) trackingStack = null;
  }

  let unsubscribers: (() => void)[] = [];
  let subscribed = false;

  return {
    value,
    subscribe: (callback: () => void) => {
      if (subscribed) return; // Only subscribe once
      subscribed = true;

      // Subscribe to all tracked sources
      for (const source of sources) {
        unsubscribers.push(source.subscribe(callback));
      }
    },
    unsubscribe: () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
      unsubscribers = [];
      subscribed = false;
    },
  };
}
