/**
 * Effect - Run side effects reactively.
 */

import { computed } from "./computed.js";
import { context, setContext, registerDisposer } from "./context.js";

/**
 * Create a reactive effect that automatically tracks dependencies
 * and re-runs when they change.
 *
 * The effect function can optionally return a cleanup function that will be
 * called before the effect re-runs and when the effect is disposed.
 *
 * @param fn - The effect function to run. May return a cleanup function.
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
 *
 * @example
 * // With cleanup function
 * const userId = signal(1);
 * const dispose = effect(() => {
 *   const subscription = api.subscribe(userId.value);
 *   return () => subscription.unsubscribe(); // cleanup
 * });
 *
 * userId.value = 2; // cleanup runs, then effect re-runs with new subscription
 * dispose(); // final cleanup runs
 */
export function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | undefined;
  let disposed = false;

  const c = computed(() => {
    // Run cleanup outside of tracking context to avoid
    // reactive reads in cleanup creating new dependencies
    if (cleanup) {
      const prev = context;
      setContext(null);
      try {
        cleanup();
      } finally {
        setContext(prev);
      }
    }
    cleanup = fn() ?? undefined;
    return undefined;
  });
  // Subscribe to make it reactive (rerun on dependency changes)
  const unsub = c.subscribe(() => {});

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unsub();
    c.dispose();
    cleanup?.();
  };

  // Register full effect dispose (with cleanup) in current scope
  // This overrides the computed's auto-registration with a more complete cleanup
  registerDisposer(dispose);

  return dispose;
}
