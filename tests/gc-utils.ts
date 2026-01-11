/**
 * GC testing utilities.
 *
 * Shared utilities for garbage collection tests across the test suite.
 * Used by template-gc.test.ts, each-stress.test.ts, is.test.ts, etc.
 */

import v8 from "node:v8";
import vm from "node:vm";

// Expose GC function
v8.setFlagsFromString("--expose-gc");
export const gc = vm.runInNewContext("gc") as () => void;

/**
 * Force GC and wait until condition is met or timeout.
 */
export async function forceGCUntil(
  condition: () => boolean,
  timeoutMs = 2000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    gc();
    await new Promise((r) => setTimeout(r, 10));
    if (condition()) return true;
  }
  return false;
}

/**
 * Helper to track GC of multiple objects.
 */
export function createGCTracker() {
  const collected = new Set<string>();
  const registry = new FinalizationRegistry((label: string) => {
    collected.add(label);
  });

  return {
    track(obj: object, label: string) {
      registry.register(obj, label);
    },
    isCollected(label: string) {
      return collected.has(label);
    },
    async waitFor(label: string, timeoutMs = 2000) {
      const ok = await forceGCUntil(() => collected.has(label), timeoutMs);
      if (!ok) {
        throw new Error(`GC timeout: "${label}" not collected`);
      }
    },
    async waitForAll(labels: string[], timeoutMs = 2000, context?: string) {
      const ok = await forceGCUntil(
        () => labels.every((l) => collected.has(l)),
        timeoutMs,
      );
      if (!ok) {
        const missing = labels.filter((l) => !collected.has(l));
        const ctx = context ? ` (${context})` : "";
        throw new Error(
          `GC timeout: not collected: ${missing.join(", ")}${ctx}`,
        );
      }
    },
  };
}
