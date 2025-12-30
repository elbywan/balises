/**
 * Tests for scope disposal
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  signal,
  computed,
  effect,
  scope,
  type Computed,
} from "../src/signals/index.js";

describe("scope", () => {
  it("should collect and dispose computeds", () => {
    const s = signal(1);
    let computedDisposed = false;

    const [result, dispose] = scope(() => {
      const c = computed(() => s.value * 2);

      // Override dispose to track if it was called
      const originalDispose = c.dispose.bind(c);
      c.dispose = () => {
        computedDisposed = true;
        originalDispose();
      };

      return c;
    });

    assert.strictEqual(result.value, 2);
    assert.strictEqual(computedDisposed, false);

    dispose();
    assert.strictEqual(computedDisposed, true);
  });

  it("should collect and dispose effects", () => {
    const s = signal(1);
    let effectRuns = 0;

    const dispose = scope(() => {
      effect(() => {
        effectRuns++;
        void s.value; // Read signal to track dependency
      });

      return {};
    })[1];

    assert.strictEqual(effectRuns, 1); // Initial run

    s.value = 2;
    assert.strictEqual(effectRuns, 2); // Effect should rerun

    dispose();

    s.value = 3;
    assert.strictEqual(effectRuns, 2); // Effect should not run after disposal
  });

  it("should dispose multiple items in reverse order", () => {
    const disposalOrder: number[] = [];

    const dispose = scope(() => {
      const c1 = computed(() => 1);
      const c2 = computed(() => 2);
      const c3 = computed(() => 3);

      // Track disposal order
      const wrap = (c: Computed<number>, id: number) => {
        const orig = c.dispose.bind(c);
        c.dispose = () => {
          disposalOrder.push(id);
          orig();
        };
      };

      wrap(c1, 1);
      wrap(c2, 2);
      wrap(c3, 3);

      return { c1, c2, c3 };
    })[1];

    dispose();

    // Should dispose in reverse order (LIFO)
    assert.deepStrictEqual(disposalOrder, [3, 2, 1]);
  });

  it("should handle nested scopes independently", () => {
    const outerDisposed: number[] = [];
    const innerDisposed: number[] = [];

    const [outerResult, outerDispose] = scope(() => {
      const c1 = computed(() => 1);
      const orig1 = c1.dispose.bind(c1);
      c1.dispose = () => {
        outerDisposed.push(1);
        orig1();
      };

      const [innerResult, innerDispose] = scope(() => {
        const c2 = computed(() => 2);
        const orig2 = c2.dispose.bind(c2);
        c2.dispose = () => {
          innerDisposed.push(2);
          orig2();
        };
        return { c2 };
      });

      return { c1, inner: innerResult, innerDispose };
    });

    // Dispose inner scope only
    outerResult.innerDispose();
    assert.deepStrictEqual(innerDisposed, [2]);
    assert.deepStrictEqual(outerDisposed, []);

    // Dispose outer scope
    outerDispose();
    assert.deepStrictEqual(outerDisposed, [1]);
    assert.deepStrictEqual(innerDisposed, [2]); // Still just the inner disposal
  });

  it("should work without a scope", () => {
    // Should not throw when computeds/effects are created outside scope
    const s = signal(1);
    const c = computed(() => s.value * 2);
    const dispose = effect(() => {
      void s.value;
    });

    assert.strictEqual(c.value, 2);

    // Manual cleanup should still work
    c.dispose();
    dispose();
  });

  it("should return result from scope function", () => {
    const [result, dispose] = scope(() => {
      return { foo: "bar", baz: 42 };
    });

    assert.deepStrictEqual(result, { foo: "bar", baz: 42 });
    dispose();
  });

  it("should handle empty scope", () => {
    const [result, dispose] = scope(() => {
      return "nothing created";
    });

    assert.strictEqual(result, "nothing created");

    // Should not throw even with no disposers
    assert.doesNotThrow(() => dispose());
  });

  it("should allow calling dispose multiple times safely", () => {
    let disposeCount = 0;

    const dispose = scope(() => {
      const c = computed(() => 1);
      const orig = c.dispose.bind(c);
      c.dispose = () => {
        disposeCount++;
        orig();
      };
      return c;
    })[1];

    dispose();
    assert.strictEqual(disposeCount, 1);

    // Calling dispose again should not run disposers again
    dispose();
    assert.strictEqual(disposeCount, 1);
  });
});
