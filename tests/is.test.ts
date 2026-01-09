import { describe, it } from "node:test";
import assert from "node:assert";
import { signal, computed } from "../src/signals/index.js";

describe("signal.is()", () => {
  describe("basic functionality", () => {
    it("should return true for matching value", () => {
      const selected = signal<number | null>(1);

      assert.strictEqual(selected.is(1), true);
      assert.strictEqual(selected.is(2), false);
      assert.strictEqual(selected.is(3), false);
    });

    it("should return false when signal is null", () => {
      const selected = signal<number | null>(null);

      assert.strictEqual(selected.is(1), false);
      assert.strictEqual(selected.is(2), false);
      assert.strictEqual(selected.is(null), true);
    });

    it("should update when signal changes", () => {
      const selected = signal<number | null>(1);

      assert.strictEqual(selected.is(1), true);
      assert.strictEqual(selected.is(2), false);

      selected.value = 2;

      assert.strictEqual(selected.is(1), false);
      assert.strictEqual(selected.is(2), true);
    });

    it("should use Object.is for equality", () => {
      const s = signal<number>(NaN);
      assert.strictEqual(s.is(NaN), true);

      const s2 = signal<number>(0);
      assert.strictEqual(s2.is(-0), false); // Object.is(0, -0) === false
    });
  });

  describe("O(1) notifications", () => {
    it("should only notify affected computeds when selection changes", () => {
      const selected = signal<number | null>(null);

      let row1Calls = 0;
      let row2Calls = 0;
      let row3Calls = 0;

      const c1 = computed(() => {
        row1Calls++;
        return selected.is(1) ? "danger" : "";
      });
      const c2 = computed(() => {
        row2Calls++;
        return selected.is(2) ? "danger" : "";
      });
      const c3 = computed(() => {
        row3Calls++;
        return selected.is(3) ? "danger" : "";
      });

      // Subscribe to trigger recomputation on changes
      c1.subscribe(() => {});
      c2.subscribe(() => {});
      c3.subscribe(() => {});

      // Initial computation
      assert.strictEqual(c1.value, "");
      assert.strictEqual(c2.value, "");
      assert.strictEqual(c3.value, "");
      assert.strictEqual(row1Calls, 1);
      assert.strictEqual(row2Calls, 1);
      assert.strictEqual(row3Calls, 1);

      // Select row 2 - should only notify row 2
      selected.value = 2;
      assert.strictEqual(c1.value, "");
      assert.strictEqual(c2.value, "danger");
      assert.strictEqual(c3.value, "");
      // Row 1 and 3 should NOT be recomputed
      assert.strictEqual(row1Calls, 1);
      assert.strictEqual(row2Calls, 2);
      assert.strictEqual(row3Calls, 1);

      // Change selection from 2 to 3 - should notify row 2 (deselected) and row 3 (selected)
      selected.value = 3;
      assert.strictEqual(c1.value, "");
      assert.strictEqual(c2.value, "");
      assert.strictEqual(c3.value, "danger");
      assert.strictEqual(row1Calls, 1);
      assert.strictEqual(row2Calls, 3);
      assert.strictEqual(row3Calls, 2);

      // Clear selection - should only notify row 3
      selected.value = null;
      assert.strictEqual(c1.value, "");
      assert.strictEqual(c2.value, "");
      assert.strictEqual(c3.value, "");
      assert.strictEqual(row1Calls, 1);
      assert.strictEqual(row2Calls, 3);
      assert.strictEqual(row3Calls, 3);

      c1.dispose();
      c2.dispose();
      c3.dispose();
    });

    it("should handle selecting same key twice", () => {
      const selected = signal<number | null>(1);

      let calls = 0;
      const c = computed(() => {
        calls++;
        return selected.is(1) ? "danger" : "";
      });
      c.subscribe(() => {});

      assert.strictEqual(c.value, "danger");
      assert.strictEqual(calls, 1);

      // Set to same value - signal equality check prevents any notification
      selected.value = 1;
      assert.strictEqual(c.value, "danger");
      assert.strictEqual(calls, 1);

      c.dispose();
    });

    it("should not notify unrelated .value dependents", () => {
      const selected = signal<number | null>(null);

      let isCallCount = 0;
      let valueCallCount = 0;

      const isComputed = computed(() => {
        isCallCount++;
        return selected.is(1);
      });

      const valueComputed = computed(() => {
        valueCallCount++;
        return selected.value;
      });

      isComputed.subscribe(() => {});
      valueComputed.subscribe(() => {});

      // Initial
      assert.strictEqual(isComputed.value, false);
      assert.strictEqual(valueComputed.value, null);
      assert.strictEqual(isCallCount, 1);
      assert.strictEqual(valueCallCount, 1);

      // Select 1 - both should be notified
      selected.value = 1;
      assert.strictEqual(isComputed.value, true);
      assert.strictEqual(valueComputed.value, 1);
      assert.strictEqual(isCallCount, 2);
      assert.strictEqual(valueCallCount, 2);

      // Select 2 - is(1) should be notified (was true, now false)
      // .value computed should also be notified (value changed)
      selected.value = 2;
      assert.strictEqual(isComputed.value, false);
      assert.strictEqual(valueComputed.value, 2);
      assert.strictEqual(isCallCount, 3);
      assert.strictEqual(valueCallCount, 3);

      isComputed.dispose();
      valueComputed.dispose();
    });
  });

  describe("computed disposal cleanup", () => {
    it("should remove from slot when computed is disposed", () => {
      const selected = signal<number | null>(null);

      let calls = 0;
      const c = computed(() => {
        calls++;
        return selected.is(1);
      });
      c.subscribe(() => {});

      assert.strictEqual(c.value, false);
      assert.strictEqual(calls, 1);

      // Dispose the computed
      c.dispose();

      // Now selecting key 1 should not trigger the disposed computed
      selected.value = 1;
      // calls should still be 1 - disposed computed should not be notified
      assert.strictEqual(calls, 1);
    });
  });

  describe("performance", () => {
    it("should be O(1) for 1000 rows", () => {
      const selected = signal<number | null>(null);

      const computeds: ReturnType<typeof computed<string>>[] = [];
      const callCounts: number[] = [];

      // Create 1000 computeds (simulating 1000 rows)
      for (let i = 0; i < 1000; i++) {
        const rowId = i + 1;
        callCounts[i] = 0;
        const c = computed(() => {
          callCounts[i]!++;
          return selected.is(rowId) ? "danger" : "";
        });
        c.subscribe(() => {});
        computeds.push(c);
      }

      // Access all values to trigger initial computation
      for (const c of computeds) void c.value;

      // All should be called once
      assert.strictEqual(
        callCounts.every((c) => c === 1),
        true,
      );

      // Select row 500
      selected.value = 500;

      // Only row 500 should be recomputed
      let recomputedCount = 0;
      for (let i = 0; i < 1000; i++) {
        if (callCounts[i]! > 1) recomputedCount++;
      }
      assert.strictEqual(recomputedCount, 1);
      assert.strictEqual(callCounts[499], 2); // row 500 (0-indexed: 499)

      // Change selection from 500 to 100
      selected.value = 100;

      // Only rows 500 (deselected) and 100 (selected) should be recomputed
      recomputedCount = 0;
      for (let i = 0; i < 1000; i++) {
        if (callCounts[i]! > 1) recomputedCount++;
      }
      assert.strictEqual(recomputedCount, 2);
      assert.strictEqual(callCounts[99], 2); // row 100
      assert.strictEqual(callCounts[499], 3); // row 500

      // Cleanup
      for (const c of computeds) c.dispose();
    });
  });
});

describe("computed.is()", () => {
  describe("basic functionality", () => {
    it("should return true for matching value", () => {
      const a = signal(1);
      const selected = computed(() => a.value);

      assert.strictEqual(selected.is(1), true);
      assert.strictEqual(selected.is(2), false);

      selected.dispose();
    });

    it("should update when computed value changes", () => {
      const a = signal(1);
      const selected = computed(() => a.value);

      assert.strictEqual(selected.is(1), true);
      assert.strictEqual(selected.is(2), false);

      a.value = 2;

      assert.strictEqual(selected.is(1), false);
      assert.strictEqual(selected.is(2), true);

      selected.dispose();
    });
  });

  describe("O(1) notifications", () => {
    it("should only notify affected computeds when computed value changes", () => {
      const a = signal<number | null>(null);
      const selected = computed(() => a.value);

      let row1Calls = 0;
      let row2Calls = 0;
      let row3Calls = 0;

      const c1 = computed(() => {
        row1Calls++;
        return selected.is(1) ? "danger" : "";
      });
      const c2 = computed(() => {
        row2Calls++;
        return selected.is(2) ? "danger" : "";
      });
      const c3 = computed(() => {
        row3Calls++;
        return selected.is(3) ? "danger" : "";
      });

      c1.subscribe(() => {});
      c2.subscribe(() => {});
      c3.subscribe(() => {});

      // Initial computation
      assert.strictEqual(c1.value, "");
      assert.strictEqual(c2.value, "");
      assert.strictEqual(c3.value, "");
      assert.strictEqual(row1Calls, 1);
      assert.strictEqual(row2Calls, 1);
      assert.strictEqual(row3Calls, 1);

      // Select row 2 - should only notify row 2
      a.value = 2;
      assert.strictEqual(c1.value, "");
      assert.strictEqual(c2.value, "danger");
      assert.strictEqual(c3.value, "");
      assert.strictEqual(row1Calls, 1);
      assert.strictEqual(row2Calls, 2);
      assert.strictEqual(row3Calls, 1);

      // Change selection from 2 to 3
      a.value = 3;
      assert.strictEqual(c1.value, "");
      assert.strictEqual(c2.value, "");
      assert.strictEqual(c3.value, "danger");
      assert.strictEqual(row1Calls, 1);
      assert.strictEqual(row2Calls, 3);
      assert.strictEqual(row3Calls, 2);

      c1.dispose();
      c2.dispose();
      c3.dispose();
      selected.dispose();
    });
  });

  describe("disposal", () => {
    it("should clean up .is() slots on dispose", () => {
      const a = signal(1);
      const selected = computed(() => a.value);

      let calls = 0;
      const c = computed(() => {
        calls++;
        return selected.is(1);
      });
      c.subscribe(() => {});

      assert.strictEqual(c.value, true);
      assert.strictEqual(calls, 1);

      // Dispose the source computed
      selected.dispose();

      // Change source - should not affect anything
      a.value = 2;
      assert.strictEqual(calls, 1);

      c.dispose();
    });
  });
});
