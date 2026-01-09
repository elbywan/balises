/**
 * Global state and batching for the reactive system.
 */

import type { Computed } from "./computed.js";

/** Callback function for subscribers */
export type Subscriber = () => void;

/**
 * Minimal interface for dependency tracking sources.
 * Implemented by Signal, Computed, and selector slots.
 */
export interface TrackableSource {
  targets: Computed<unknown>[];
  deleteTarget(target: Computed<unknown>): void;
}

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

/**
 * Hook for tracking signal/computed accesses.
 * Set by async.ts when track() is active to capture dependencies.
 * Using an object wrapper so async.ts can mutate the current value.
 */
export const onTrack: {
  current: ((source: TrackableSource) => void) | null;
} = { current: null };
