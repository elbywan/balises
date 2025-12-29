/**
 * Global state and batching for the reactive system.
 */

import type { Computed } from "./computed.js";

/** Callback function for subscribers */
export type Subscriber = () => void;

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
export function enqueueBatch(sub: Subscriber): void {
  batchQueue!.add(sub);
}

/** Add multiple subscribers to the batch queue */
export function enqueueBatchAll(subs: Subscriber[]): void {
  for (let i = 0; i < subs.length; i++) {
    batchQueue!.add(subs[i]!);
  }
}
