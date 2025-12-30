/**
 * Effect - Run side effects reactively.
 */

import { computed } from "./computed.js";
import { registerDisposer } from "./context.js";

/**
 * Create a reactive effect that automatically tracks dependencies
 * and re-runs when they change.
 *
 * @param fn - The effect function to run
 * @returns A dispose function to stop the effect
 *
 * @example
 * const count = signal(0);
 * const dispose = effect(() => {
 *   console.log("Count is:", count.value);
 * });
 *
 * count.value = 1; // logs: "Count is: 1"
 * dispose(); // stop the effect
 */
export function effect(fn: () => void): () => void {
  const c = computed(() => {
    fn();
    return undefined;
  });

  // Subscribe to make it reactive (rerun on dependency changes)
  const unsub = c.subscribe(() => {});

  const dispose = () => {
    unsub();
    c.dispose();
  };

  // Auto-register disposal in current root scope
  // Note: This doesn't prevent returning the dispose function since the
  // user might want to dispose early, while the root dispose cleans up any
  // effects that weren't manually disposed.
  registerDisposer(dispose);

  return dispose;
}
