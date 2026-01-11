import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { signal, computed } from "../src/signals/index.js";
import { html } from "../src/template.js";
import { createGCTracker } from "./gc-utils.js";

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

describe(".is() GC and memory leak tests", () => {
  describe("signal.is() GC", () => {
    it("should GC computed using .is() after dispose", async () => {
      const tracker = createGCTracker();
      // Signal stays alive - this is key to a valid test
      const selected = signal<number | null>(null);

      (function scope() {
        const c = computed(() => (selected.is(1) ? "danger" : ""));
        c.subscribe(() => {});
        void c.value; // Trigger computation
        tracker.track(c, "computed");
        c.dispose();
      })();

      // If dispose() didn't unlink from .is() slot, it would keep computed alive
      await tracker.waitFor("computed");
    });

    it("should GC multiple computeds using same .is() value after dispose", async () => {
      const tracker = createGCTracker();
      const selected = signal<number | null>(null);

      (function scope() {
        const c1 = computed(() => (selected.is(1) ? "a" : ""));
        const c2 = computed(() => (selected.is(1) ? "b" : ""));
        const c3 = computed(() => (selected.is(1) ? "c" : ""));
        c1.subscribe(() => {});
        c2.subscribe(() => {});
        c3.subscribe(() => {});
        void c1.value;
        void c2.value;
        void c3.value;
        tracker.track(c1, "computed1");
        tracker.track(c2, "computed2");
        tracker.track(c3, "computed3");
        c1.dispose();
        c2.dispose();
        c3.dispose();
      })();

      await tracker.waitForAll(["computed1", "computed2", "computed3"]);
    });

    it("should GC computeds using different .is() values after dispose", async () => {
      const tracker = createGCTracker();
      const selected = signal<number | null>(null);

      (function scope() {
        const c1 = computed(() => (selected.is(1) ? "a" : ""));
        const c2 = computed(() => (selected.is(2) ? "b" : ""));
        const c3 = computed(() => (selected.is(3) ? "c" : ""));
        c1.subscribe(() => {});
        c2.subscribe(() => {});
        c3.subscribe(() => {});
        void c1.value;
        void c2.value;
        void c3.value;
        tracker.track(c1, "computed1");
        tracker.track(c2, "computed2");
        tracker.track(c3, "computed3");
        c1.dispose();
        c2.dispose();
        c3.dispose();
      })();

      await tracker.waitForAll(["computed1", "computed2", "computed3"]);
    });

    it("should not leak when creating and disposing many .is() computeds", async () => {
      const tracker = createGCTracker();
      const selected = signal<number | null>(null);

      const labels: string[] = [];

      (function scope() {
        // Create 100 computeds each checking different .is() values
        for (let i = 0; i < 100; i++) {
          const c = computed(() => (selected.is(i) ? "danger" : ""));
          c.subscribe(() => {});
          void c.value;
          const label = `computed${i}`;
          labels.push(label);
          tracker.track(c, label);
          c.dispose();
        }
      })();

      // All should be GC'd
      await tracker.waitForAll(labels);
    });

    it("should GC computed after signal value changes and dispose", async () => {
      const tracker = createGCTracker();
      const selected = signal<number | null>(null);

      (function scope() {
        const c = computed(() => (selected.is(1) ? "danger" : ""));
        c.subscribe(() => {});
        void c.value;

        // Trigger some updates before dispose
        selected.value = 1;
        void c.value;
        selected.value = 2;
        void c.value;
        selected.value = null;
        void c.value;

        tracker.track(c, "computed");
        c.dispose();
      })();

      await tracker.waitFor("computed");
    });
  });

  describe("computed.is() GC", () => {
    it("should GC computed using computed.is() after dispose", async () => {
      const tracker = createGCTracker();
      const a = signal(1);
      const selected = computed(() => a.value);

      (function scope() {
        const c = computed(() => (selected.is(1) ? "danger" : ""));
        c.subscribe(() => {});
        void c.value;
        tracker.track(c, "computed");
        c.dispose();
      })();

      await tracker.waitFor("computed");

      // Cleanup
      selected.dispose();
    });

    it("should GC source computed's .is() slots when source is disposed", async () => {
      const tracker = createGCTracker();
      const a = signal(1);

      (function scope() {
        const selected = computed(() => a.value);
        const c = computed(() => (selected.is(1) ? "danger" : ""));
        c.subscribe(() => {});
        void c.value;
        tracker.track(c, "inner-computed");
        tracker.track(selected, "source-computed");

        // Dispose both
        c.dispose();
        selected.dispose();
      })();

      await tracker.waitForAll(["inner-computed", "source-computed"]);
    });

    it("should GC multiple computeds using computed.is() after dispose", async () => {
      const tracker = createGCTracker();
      const a = signal<number | null>(null);
      const selected = computed(() => a.value);

      (function scope() {
        const c1 = computed(() => (selected.is(1) ? "a" : ""));
        const c2 = computed(() => (selected.is(2) ? "b" : ""));
        const c3 = computed(() => (selected.is(3) ? "c" : ""));
        c1.subscribe(() => {});
        c2.subscribe(() => {});
        c3.subscribe(() => {});
        void c1.value;
        void c2.value;
        void c3.value;
        tracker.track(c1, "computed1");
        tracker.track(c2, "computed2");
        tracker.track(c3, "computed3");
        c1.dispose();
        c2.dispose();
        c3.dispose();
      })();

      await tracker.waitForAll(["computed1", "computed2", "computed3"]);

      // Cleanup
      selected.dispose();
    });
  });

  describe("subscription cleanup", () => {
    it("should remove from .is() slot targets when computed is disposed", () => {
      const selected = signal<number | null>(null);

      const c1 = computed(() => (selected.is(1) ? "a" : ""));
      const c2 = computed(() => (selected.is(1) ? "b" : ""));
      c1.subscribe(() => {});
      c2.subscribe(() => {});
      void c1.value;
      void c2.value;

      // Both should be subscribed to the is(1) slot
      // Dispose one - the other should still work
      c1.dispose();

      // c2 should still react to changes
      let c2Calls = 0;
      c2.subscribe(() => c2Calls++);
      selected.value = 1;
      assert.strictEqual(c2.value, "b");
      assert.strictEqual(c2Calls, 1);

      c2.dispose();
    });

    it("should not notify disposed computed when .is() value changes", () => {
      const selected = signal<number | null>(null);

      let calls = 0;
      const c = computed(() => {
        calls++;
        return selected.is(1) ? "danger" : "";
      });
      c.subscribe(() => {});
      void c.value;
      assert.strictEqual(calls, 1);

      c.dispose();

      // This should not trigger the disposed computed
      selected.value = 1;
      assert.strictEqual(calls, 1); // Should still be 1
    });

    it("should handle dispose during signal update cycle", () => {
      const selected = signal<number | null>(null);

      let c2Disposed = false;
      let c1Calls = 0;
      let c2Calls = 0;

      const c2 = computed(() => {
        c2Calls++;
        return selected.is(2) ? "danger2" : "";
      });

      const c1 = computed(() => {
        c1Calls++;
        const isOne = selected.is(1);
        // Dispose c2 during c1's computation (edge case)
        // Use peek() to avoid creating a .value dependency
        if (selected.peek() === 1 && !c2Disposed) {
          c2Disposed = true;
          c2.dispose();
        }
        return isOne ? "danger1" : "";
      });

      c1.subscribe(() => {});
      c2.subscribe(() => {});
      void c1.value;
      void c2.value;

      // Trigger update that will cause c1 to dispose c2
      selected.value = 1;

      assert.strictEqual(c1.value, "danger1");
      assert.strictEqual(c1Calls, 2);
      // c2 was disposed during the update cycle
      assert.strictEqual(c2Disposed, true);

      // Further updates should not affect disposed c2
      const c2CallsAfterDispose = c2Calls;
      selected.value = 2;
      assert.strictEqual(c2Calls, c2CallsAfterDispose);

      c1.dispose();
    });
  });

  describe("edge cases", () => {
    it("should handle rapid create/dispose cycles", async () => {
      const tracker = createGCTracker();
      const selected = signal<number | null>(null);

      const labels: string[] = [];

      // Rapid create/dispose cycle
      for (let cycle = 0; cycle < 10; cycle++) {
        (function scope() {
          const c = computed(() => (selected.is(cycle) ? "danger" : ""));
          c.subscribe(() => {});
          void c.value;

          // Trigger some updates
          selected.value = cycle;
          void c.value;

          const label = `computed-cycle${cycle}`;
          labels.push(label);
          tracker.track(c, label);
          c.dispose();
        })();
      }

      await tracker.waitForAll(labels);
    });

    it("should handle .is() with object keys", async () => {
      const tracker = createGCTracker();
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      const selected = signal<object | null>(null);

      (function scope() {
        const c1 = computed(() => (selected.is(obj1) ? "a" : ""));
        const c2 = computed(() => (selected.is(obj2) ? "b" : ""));
        c1.subscribe(() => {});
        c2.subscribe(() => {});
        void c1.value;
        void c2.value;

        selected.value = obj1;
        assert.strictEqual(c1.value, "a");
        assert.strictEqual(c2.value, "");

        selected.value = obj2;
        assert.strictEqual(c1.value, "");
        assert.strictEqual(c2.value, "b");

        tracker.track(c1, "computed1");
        tracker.track(c2, "computed2");
        c1.dispose();
        c2.dispose();
      })();

      await tracker.waitForAll(["computed1", "computed2"]);
    });

    it("should handle .is() computed that switches between tracking and not", async () => {
      const tracker = createGCTracker();
      const selected = signal<number | null>(null);
      const shouldTrack = signal(true);

      (function scope() {
        const c = computed(() => {
          if (shouldTrack.value) {
            return selected.is(1) ? "danger" : "";
          }
          return "not-tracking";
        });
        c.subscribe(() => {});
        void c.value;

        // Switch to not tracking
        shouldTrack.value = false;
        void c.value;

        // Switch back to tracking
        shouldTrack.value = true;
        void c.value;

        tracker.track(c, "computed");
        c.dispose();
      })();

      await tracker.waitFor("computed");
    });
  });
});

describe(".is() slot cleanup", () => {
  it("should remove empty slots from the map when all targets dispose", () => {
    const selected = signal<number | null>(null);

    // Access internal isSlots map via the signal
    // We'll verify cleanup by checking the computed properly unlinks
    const c1 = computed(() => (selected.is(1) ? "a" : ""));
    const c2 = computed(() => (selected.is(1) ? "b" : ""));
    c1.subscribe(() => {});
    c2.subscribe(() => {});
    void c1.value;
    void c2.value;

    // Both computeds are now tracking the is(1) slot
    // Verify they work
    selected.value = 1;
    assert.strictEqual(c1.value, "a");
    assert.strictEqual(c2.value, "b");

    // Dispose one - the other should still work
    c1.dispose();

    selected.value = null;
    assert.strictEqual(c2.value, "");

    selected.value = 1;
    assert.strictEqual(c2.value, "b");

    // Dispose the other - slot should be cleaned up
    c2.dispose();

    // Creating a new computed should work (new slot created)
    const c3 = computed(() => (selected.is(1) ? "c" : ""));
    c3.subscribe(() => {});
    assert.strictEqual(c3.value, "c");

    c3.dispose();
  });

  it("should handle computed using both .value and .is() on same signal", () => {
    const selected = signal<number | null>(null);

    let calls = 0;
    const c = computed(() => {
      calls++;
      // Access both .value and .is()
      const currentValue = selected.value;
      const isOne = selected.is(1);
      return `value=${currentValue}, isOne=${isOne}`;
    });
    c.subscribe(() => {});

    assert.strictEqual(c.value, "value=null, isOne=false");
    assert.strictEqual(calls, 1);

    // Change to 1 - should trigger once (not twice)
    selected.value = 1;
    assert.strictEqual(c.value, "value=1, isOne=true");
    assert.strictEqual(calls, 2); // Only one recompute

    // Change to 2 - should trigger once
    selected.value = 2;
    assert.strictEqual(c.value, "value=2, isOne=false");
    assert.strictEqual(calls, 3); // Only one recompute

    c.dispose();
  });

  it("should clean up slots when computed changes dependencies", () => {
    const selected = signal<number | null>(null);
    const useIs = signal(true);

    let calls = 0;
    const c = computed(() => {
      calls++;
      if (useIs.value) {
        return selected.is(1) ? "danger" : "";
      }
      return "not-using-is";
    });
    c.subscribe(() => {});

    assert.strictEqual(c.value, "");
    assert.strictEqual(calls, 1);

    // Trigger is(1) slot
    selected.value = 1;
    assert.strictEqual(c.value, "danger");
    assert.strictEqual(calls, 2);

    // Switch to not using .is() - old slot should be unlinked
    useIs.value = false;
    assert.strictEqual(c.value, "not-using-is");
    assert.strictEqual(calls, 3);

    // Now changing selected should NOT trigger recompute
    // (because c no longer tracks selected or its .is() slot)
    const callsBeforeChange = calls;
    selected.value = 2;
    // c should NOT be recomputed
    assert.strictEqual(calls, callsBeforeChange);

    c.dispose();
  });

  it("should handle computed using both .value and .is() on same computed source", () => {
    const source = signal(1);
    const derived = computed(() => source.value);

    let calls = 0;
    const c = computed(() => {
      calls++;
      // Access both .value and .is() on the COMPUTED (not signal)
      const currentValue = derived.value;
      const isOne = derived.is(1);
      return `value=${currentValue}, isOne=${isOne}`;
    });
    c.subscribe(() => {});

    assert.strictEqual(c.value, "value=1, isOne=true");
    assert.strictEqual(calls, 1);

    // Change source to 2 - should trigger c only once (not twice)
    source.value = 2;
    assert.strictEqual(c.value, "value=2, isOne=false");
    assert.strictEqual(calls, 2); // Only one recompute

    // Change back to 1 - should trigger c only once
    source.value = 1;
    assert.strictEqual(c.value, "value=1, isOne=true");
    assert.strictEqual(calls, 3); // Only one recompute

    // Change to 3 - neither old nor new matches .is(1)
    source.value = 3;
    assert.strictEqual(c.value, "value=3, isOne=false");
    assert.strictEqual(calls, 4); // Only one recompute

    derived.dispose();
    c.dispose();
  });

  it("should handle many slots and clean them all up", () => {
    const selected = signal<number | null>(null);
    const computeds: ReturnType<typeof computed<string>>[] = [];

    // Create 100 computeds each checking different .is() values
    for (let i = 0; i < 100; i++) {
      const c = computed(() => (selected.is(i) ? "danger" : ""));
      c.subscribe(() => {});
      void c.value;
      computeds.push(c);
    }

    // Verify they work
    selected.value = 50;
    assert.strictEqual(computeds[50]!.value, "danger");
    assert.strictEqual(computeds[49]!.value, "");

    // Dispose all
    for (const c of computeds) c.dispose();

    // Creating new computeds should work
    const c = computed(() => (selected.is(50) ? "new" : ""));
    c.subscribe(() => {});
    assert.strictEqual(c.value, "new");
    c.dispose();
  });
});

/**
 * Integration tests for .is() with template rendering.
 * Tests the primary use case: tab selection, accordion panels, etc.
 */
describe("signal.is() with template rendering", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should efficiently update class on selected tab", () => {
    const selectedTab = signal<string>("tab1");
    let tab1ComputeCount = 0;
    let tab2ComputeCount = 0;

    const { fragment, dispose } = html`
      <div>
        <button
          class=${() => {
            tab1ComputeCount++;
            return selectedTab.is("tab1") ? "selected" : "";
          }}
        >
          Tab 1
        </button>
        <button
          class=${() => {
            tab2ComputeCount++;
            return selectedTab.is("tab2") ? "selected" : "";
          }}
        >
          Tab 2
        </button>
      </div>
    `.render();

    document.body.appendChild(fragment);
    const buttons = document.body.querySelectorAll("button");

    // Initial render
    assert.strictEqual(buttons[0]!.getAttribute("class"), "selected");
    assert.strictEqual(buttons[1]!.getAttribute("class"), "");
    assert.strictEqual(tab1ComputeCount, 1);
    assert.strictEqual(tab2ComputeCount, 1);

    // Change to tab2 - both tabs affected (tab1 deselected, tab2 selected)
    selectedTab.value = "tab2";
    assert.strictEqual(buttons[0]!.getAttribute("class"), "");
    assert.strictEqual(buttons[1]!.getAttribute("class"), "selected");
    assert.strictEqual(tab1ComputeCount, 2);
    assert.strictEqual(tab2ComputeCount, 2);

    // Change to tab3 (neither) - only tab2 recomputes (was selected, now deselected)
    // tab1 was already deselected, so its IsSlot("tab1") is not notified
    selectedTab.value = "tab3";
    assert.strictEqual(buttons[0]!.getAttribute("class"), "");
    assert.strictEqual(buttons[1]!.getAttribute("class"), "");
    assert.strictEqual(tab1ComputeCount, 2); // NOT recomputed! O(1) optimization
    assert.strictEqual(tab2ComputeCount, 3);

    // Back to tab1 - only tab1 recomputes (IsSlot("tab1") notified)
    selectedTab.value = "tab1";
    assert.strictEqual(buttons[0]!.getAttribute("class"), "selected");
    assert.strictEqual(buttons[1]!.getAttribute("class"), "");
    assert.strictEqual(tab1ComputeCount, 3);
    assert.strictEqual(tab2ComputeCount, 3); // NOT recomputed! O(1) optimization

    dispose();
  });

  it("should show conditional content based on .is()", () => {
    const activePanel = signal<number>(1);

    const { fragment, dispose } = html`
      <div>
        ${() =>
          activePanel.is(1) ? html`<div class="panel">Panel 1</div>` : null}
        ${() =>
          activePanel.is(2) ? html`<div class="panel">Panel 2</div>` : null}
        ${() =>
          activePanel.is(3) ? html`<div class="panel">Panel 3</div>` : null}
      </div>
    `.render();

    document.body.appendChild(fragment);
    const container = document.body.querySelector("div")!;

    // Only panel 1 visible
    assert.strictEqual(container.querySelectorAll(".panel").length, 1);
    assert.strictEqual(
      container.querySelector(".panel")!.textContent,
      "Panel 1",
    );

    // Switch to panel 2
    activePanel.value = 2;
    assert.strictEqual(container.querySelectorAll(".panel").length, 1);
    assert.strictEqual(
      container.querySelector(".panel")!.textContent,
      "Panel 2",
    );

    // Switch to panel 3
    activePanel.value = 3;
    assert.strictEqual(container.querySelectorAll(".panel").length, 1);
    assert.strictEqual(
      container.querySelector(".panel")!.textContent,
      "Panel 3",
    );

    // Switch to none (e.g., 0)
    activePanel.value = 0;
    assert.strictEqual(container.querySelectorAll(".panel").length, 0);

    dispose();
  });

  it("should work with computed.is() in templates", () => {
    const count = signal(5);
    const category = computed(() => {
      if (count.value < 5) return "low";
      if (count.value < 10) return "medium";
      return "high";
    });

    const { fragment, dispose } = html`
      <div>
        <span class=${() => (category.is("low") ? "active" : "")}>Low</span>
        <span class=${() => (category.is("medium") ? "active" : "")}
          >Medium</span
        >
        <span class=${() => (category.is("high") ? "active" : "")}>High</span>
      </div>
    `.render();

    document.body.appendChild(fragment);
    const spans = document.body.querySelectorAll("span");

    // Initially medium (count=5)
    assert.strictEqual(spans[0]!.getAttribute("class"), "");
    assert.strictEqual(spans[1]!.getAttribute("class"), "active");
    assert.strictEqual(spans[2]!.getAttribute("class"), "");

    // Change to low (count=3)
    count.value = 3;
    assert.strictEqual(spans[0]!.getAttribute("class"), "active");
    assert.strictEqual(spans[1]!.getAttribute("class"), "");
    assert.strictEqual(spans[2]!.getAttribute("class"), "");

    // Change to high (count=15)
    count.value = 15;
    assert.strictEqual(spans[0]!.getAttribute("class"), "");
    assert.strictEqual(spans[1]!.getAttribute("class"), "");
    assert.strictEqual(spans[2]!.getAttribute("class"), "active");

    dispose();
  });
});
