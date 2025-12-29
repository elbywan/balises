import { describe, it } from "node:test";
import assert from "node:assert";
import { Signal, computed, store, batch } from "../src/signals/index.js";

describe("Signal", () => {
  it("should store and retrieve a value", () => {
    const signal = new Signal(10);
    assert.strictEqual(signal.value, 10);
  });

  it("should update value", () => {
    const signal = new Signal(10);
    signal.value = 20;
    assert.strictEqual(signal.value, 20);
  });

  it("should notify subscribers on value change", () => {
    const signal = new Signal(10);
    let notified = false;
    signal.subscribe(() => {
      notified = true;
    });
    signal.value = 20;
    assert.strictEqual(notified, true);
  });

  it("should not notify subscribers when value is the same", () => {
    const signal = new Signal(10);
    let notifyCount = 0;
    signal.subscribe(() => {
      notifyCount++;
    });
    signal.value = 10;
    assert.strictEqual(notifyCount, 0);
  });

  it("should allow unsubscribing", () => {
    const signal = new Signal(10);
    let notifyCount = 0;
    const unsubscribe = signal.subscribe(() => {
      notifyCount++;
    });
    signal.value = 20;
    assert.strictEqual(notifyCount, 1);
    unsubscribe();
    signal.value = 30;
    assert.strictEqual(notifyCount, 1);
  });

  it("should support multiple subscribers", () => {
    const signal = new Signal(10);
    let count1 = 0;
    let count2 = 0;
    signal.subscribe(() => {
      count1++;
    });
    signal.subscribe(() => {
      count2++;
    });
    signal.value = 20;
    assert.strictEqual(count1, 1);
    assert.strictEqual(count2, 1);
  });

  /**
   * Edge case: Unsubscribing during notification
   *
   * When a subscriber unsubscribes itself during notification,
   * due to swap-and-pop removal, the last subscriber is swapped into the
   * removed position. This may cause some subscribers to be skipped
   * in the current cycle if the removed subscriber was before the current
   * iteration index. This is a known trade-off for O(1) removal.
   */
  it("should handle unsubscribing during notification without crashing", () => {
    const signal = new Signal(0);
    let sub1Called = false;

    const unsub1 = signal.subscribe(() => {
      sub1Called = true;
      unsub1(); // Unsubscribe itself during notification
    });

    signal.value = 1;

    // The subscriber that unsubscribed itself should have been called
    assert.strictEqual(sub1Called, true);
  });

  /**
   * Edge case: Subscribing during notification
   *
   * New subscribers added during notification are appended to the array.
   * Since the implementation iterates with a cached loop, new subscribers
   * WILL be called in the same notification cycle (the array grows).
   * This documents the actual behavior.
   */
  it("should call subscribers added during notification in same cycle", () => {
    const signal = new Signal(0);
    let newSubCalled = false;

    signal.subscribe(() => {
      // Add a new subscriber during notification
      signal.subscribe(() => {
        newSubCalled = true;
      });
    });

    signal.value = 1;

    // The new subscriber IS called during this cycle because
    // the loop iterates over the growing array
    assert.strictEqual(newSubCalled, true);
  });

  /**
   * Edge case: Signal with object values using reference equality
   *
   * Signals use strict equality (===) to check if value changed.
   * Same object reference should not trigger notification,
   * but a new object with same content should.
   */
  it("should use reference equality for objects", () => {
    const obj = { a: 1 };
    const signal = new Signal(obj);
    let notifyCount = 0;
    signal.subscribe(() => notifyCount++);

    // Same reference - no notification
    signal.value = obj;
    assert.strictEqual(notifyCount, 0);

    // Different reference with same content - should notify
    signal.value = { a: 1 };
    assert.strictEqual(notifyCount, 1);
  });

  /**
   * Edge case: Signal with NaN values
   *
   * NaN === NaN is false in JavaScript, but Object.is(NaN, NaN) is true.
   * The library uses Object.is() to avoid spurious notifications.
   */
  it("should handle NaN values correctly with Object.is", () => {
    const signal = new Signal(NaN);
    let notifyCount = 0;
    signal.subscribe(() => notifyCount++);

    // NaN === NaN is false, but Object.is(NaN, NaN) is true
    // So setting NaN again should NOT trigger notification
    signal.value = NaN;
    assert.strictEqual(notifyCount, 0);

    // Setting to a different value should notify
    signal.value = 5;
    assert.strictEqual(notifyCount, 1);

    // Setting back to NaN should notify
    signal.value = NaN;
    assert.strictEqual(notifyCount, 2);
  });

  /**
   * Edge case: Signal with undefined and null
   *
   * These falsy values should work correctly.
   */
  it("should handle undefined and null values", () => {
    const signal = new Signal<string | null | undefined>("initial");
    let notifyCount = 0;
    signal.subscribe(() => notifyCount++);

    signal.value = null;
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(signal.value, null);

    signal.value = undefined;
    assert.strictEqual(notifyCount, 2);
    assert.strictEqual(signal.value, undefined);

    // Setting to same value should not notify
    signal.value = undefined;
    assert.strictEqual(notifyCount, 2);
  });

  /**
   * Edge case: Unsubscribing the same subscriber multiple times
   *
   * Calling unsubscribe more than once should be safe (no-op).
   */
  it("should safely handle multiple unsubscribe calls", () => {
    const signal = new Signal(0);
    let notifyCount = 0;
    const unsub = signal.subscribe(() => notifyCount++);

    unsub();
    unsub(); // Second call should be a no-op
    unsub(); // Third call should also be safe

    signal.value = 1;
    assert.strictEqual(notifyCount, 0);
  });

  /**
   * Edge case: Reading signal value during subscriber callback
   *
   * Subscribers should be able to read the new value.
   */
  it("should provide new value to subscribers", () => {
    const signal = new Signal(0);
    let observedValue: number | null = null;

    signal.subscribe(() => {
      observedValue = signal.value;
    });

    signal.value = 42;
    assert.strictEqual(observedValue, 42);
  });

  /**
   * Edge case: Modifying signal value during subscriber callback
   *
   * A subscriber that modifies the signal should trigger another round
   * of notifications (cascade update).
   */
  it("should handle cascading updates from subscribers", () => {
    const signal = new Signal(0);
    const history: number[] = [];

    signal.subscribe(() => {
      history.push(signal.value);
      // Trigger another update when value is 1
      if (signal.value === 1) {
        signal.value = 2;
      }
    });

    signal.value = 1;

    // Should have recorded both 1 and 2
    assert.deepStrictEqual(history, [1, 2]);
  });
});

describe("Computed", () => {
  it("should compute initial value", () => {
    const a = new Signal(5);
    const b = new Signal(10);
    const sum = computed(() => a.value + b.value);
    assert.strictEqual(sum.value, 15);
  });

  it("should update when dependencies change", () => {
    const a = new Signal(5);
    const b = new Signal(10);
    const sum = computed(() => a.value + b.value);
    a.value = 10;
    assert.strictEqual(sum.value, 20);
  });

  it("should notify subscribers when computed value changes", () => {
    const a = new Signal(5);
    const doubled = computed(() => a.value * 2);
    let notified = false;
    doubled.subscribe(() => {
      notified = true;
    });
    a.value = 10;
    assert.strictEqual(notified, true);
    assert.strictEqual(doubled.value, 20);
  });

  it("should not notify subscribers when computed value stays the same", () => {
    const a = new Signal(5);
    const isPositive = computed(() => a.value > 0);
    let notifyCount = 0;
    isPositive.subscribe(() => {
      notifyCount++;
    });
    a.value = 10; // still positive
    assert.strictEqual(notifyCount, 0);
    assert.strictEqual(isPositive.value, true);
  });

  it("should support chained computed values", () => {
    const a = new Signal(2);
    const doubled = computed(() => a.value * 2);
    const quadrupled = computed(() => doubled.value * 2);
    assert.strictEqual(quadrupled.value, 8);
    a.value = 3;
    assert.strictEqual(quadrupled.value, 12);
  });

  it("should not notify subscribers after dispose", () => {
    const a = new Signal(5);
    const doubled = computed(() => a.value * 2);
    let notifyCount = 0;
    doubled.subscribe(() => {
      notifyCount++;
    });

    // Verify subscriber is called before dispose
    a.value = 10;
    assert.strictEqual(notifyCount, 1);

    doubled.dispose();

    // After dispose, subscribers should not be notified
    a.value = 20;
    assert.strictEqual(notifyCount, 1); // Should not increase
    // Note: doubled.value still returns last computed value (20)
    assert.strictEqual(doubled.value, 20);
  });

  it("should dynamically track dependencies", () => {
    const show = new Signal(true);
    const a = new Signal(1);
    const b = new Signal(2);

    let computeCount = 0;
    const result = computed(() => {
      computeCount++;
      return show.value ? a.value : b.value;
    });

    assert.strictEqual(result.value, 1);
    assert.strictEqual(computeCount, 1);

    // Changing `a` should trigger (it's currently tracked)
    a.value = 10;
    assert.strictEqual(result.value, 10);
    assert.strictEqual(computeCount, 2);

    // Changing `b` should NOT trigger (not tracked yet)
    b.value = 20;
    assert.strictEqual(result.value, 10);
    assert.strictEqual(computeCount, 2);

    // Switch branch - now `b` should be tracked, `a` should not
    show.value = false;
    assert.strictEqual(result.value, 20);
    assert.strictEqual(computeCount, 3);

    // Changing `a` should NOT trigger anymore
    a.value = 100;
    assert.strictEqual(result.value, 20);
    assert.strictEqual(computeCount, 3);

    // Changing `b` should trigger now
    b.value = 200;
    assert.strictEqual(result.value, 200);
    assert.strictEqual(computeCount, 4);
  });

  it("should dynamically track dependencies with nested computed", () => {
    const flag = new Signal(true);
    const x = new Signal(1);
    const y = new Signal(2);

    const branch = computed(() => (flag.value ? x.value : y.value));
    const doubled = computed(() => branch.value * 2);

    assert.strictEqual(doubled.value, 2);

    // Change x - should update
    x.value = 5;
    assert.strictEqual(doubled.value, 10);

    // Change y - should NOT update (not in current branch)
    y.value = 100;
    assert.strictEqual(doubled.value, 10);

    // Switch branch
    flag.value = false;
    assert.strictEqual(doubled.value, 200);

    // Now y changes should update
    y.value = 50;
    assert.strictEqual(doubled.value, 100);

    // And x changes should NOT
    x.value = 999;
    assert.strictEqual(doubled.value, 100);
  });

  /**
   * Edge case: Computed with no dependencies (constant)
   *
   * A computed that doesn't read any signals should compute once
   * and never be marked dirty.
   */
  it("should handle computed with no dependencies", () => {
    let computeCount = 0;
    const constant = computed(() => {
      computeCount++;
      return 42;
    });

    assert.strictEqual(constant.value, 42);
    assert.strictEqual(computeCount, 1);

    // Reading again should not recompute
    assert.strictEqual(constant.value, 42);
    assert.strictEqual(computeCount, 1);
  });

  /**
   * Edge case: Computed that throws an error
   *
   * Errors during computation should propagate. Since computed values
   * are computed eagerly on construction, errors will be thrown during
   * the computed() call itself.
   */
  it("should propagate errors from compute function", () => {
    const flag = new Signal(false); // Start with no error

    const c = computed(() => {
      if (flag.value) throw new Error("Test error");
      return 42;
    });

    // Initial computation is fine
    assert.strictEqual(c.value, 42);

    // Changing to throw should cause recomputation
    flag.value = true;

    // Now accessing value should throw
    assert.throws(() => c.value, /Test error/);
  });

  /**
   * Edge case: Diamond dependency pattern
   *
   * A -> B -> D
   * A -> C -> D
   *
   * When A changes, D should only be notified once,
   * and should see consistent values from B and C.
   */
  it("should handle diamond dependency pattern correctly", () => {
    const a = new Signal(1);
    const b = computed(() => a.value * 2);
    const c = computed(() => a.value * 3);
    const d = computed(() => b.value + c.value);

    let dComputeCount = 0;
    const dTracked = computed(() => {
      dComputeCount++;
      return d.value;
    });

    // Initial: a=1, b=2, c=3, d=5
    assert.strictEqual(dTracked.value, 5);
    assert.strictEqual(dComputeCount, 1);

    // Change a: should update b and c, then d
    a.value = 2;
    assert.strictEqual(dTracked.value, 10); // b=4, c=6, d=10
    // d should compute only the necessary times
    assert.ok(dComputeCount <= 3); // Initial + at most 2 more
  });

  /**
   * Edge case: Deeply nested computed chain
   *
   * Tests that changes propagate through a long chain of computeds.
   */
  it("should propagate through deeply nested computed chain", () => {
    const root = new Signal(1);
    let prev: Signal<number> | ReturnType<typeof computed<number>> = root;

    // Create a chain of 10 computeds
    const chain: ReturnType<typeof computed<number>>[] = [];
    for (let i = 0; i < 10; i++) {
      const source: Signal<number> | ReturnType<typeof computed<number>> = prev;
      const next: ReturnType<typeof computed<number>> = computed(
        () => source.value + 1,
      );
      chain.push(next);
      prev = next;
    }

    const final = chain[chain.length - 1]!;
    assert.strictEqual(final.value, 11); // 1 + 10

    root.value = 5;
    assert.strictEqual(final.value, 15); // 5 + 10
  });

  /**
   * Edge case: Computed reading the same signal multiple times
   *
   * Should only track the signal once as a dependency.
   */
  it("should deduplicate multiple reads of the same signal", () => {
    const s = new Signal(5);
    let computeCount = 0;

    const c = computed(() => {
      computeCount++;
      return s.value + s.value + s.value; // Read 3 times
    });

    assert.strictEqual(c.value, 15);
    assert.strictEqual(computeCount, 1);

    s.value = 10;
    assert.strictEqual(c.value, 30);
    // Should only recompute once, not 3 times
    assert.strictEqual(computeCount, 2);
  });

  /**
   * Edge case: Computed that conditionally reads different number of signals
   *
   * When the set of dependencies shrinks, old dependencies should be unlinked.
   */
  it("should unlink dependencies that are no longer accessed", () => {
    const useAll = new Signal(true);
    const a = new Signal(1);
    const b = new Signal(2);
    const c = new Signal(3);

    let computeCount = 0;
    const result = computed(() => {
      computeCount++;
      if (useAll.value) {
        return a.value + b.value + c.value;
      } else {
        return a.value;
      }
    });

    assert.strictEqual(result.value, 6);
    assert.strictEqual(computeCount, 1);

    // Switch to only using 'a'
    useAll.value = false;
    assert.strictEqual(result.value, 1);
    assert.strictEqual(computeCount, 2);

    // Changing b or c should no longer trigger recompute
    b.value = 100;
    assert.strictEqual(result.value, 1);
    assert.strictEqual(computeCount, 2);

    c.value = 100;
    assert.strictEqual(result.value, 1);
    assert.strictEqual(computeCount, 2);

    // But changing a should still trigger
    a.value = 10;
    assert.strictEqual(result.value, 10);
    assert.strictEqual(computeCount, 3);
  });

  /**
   * Edge case: Subscribing to computed triggers initial computation if dirty
   *
   * When subscribing to a computed, if a dependency changes before
   * the subscription but after last read, the subscriber should be
   * notified only when the computed value actually changes.
   */
  it("should notify subscriber only when computed value changes", () => {
    const a = new Signal(5);
    const isEven = computed(() => a.value % 2 === 0);

    let notifyCount = 0;
    isEven.subscribe(() => notifyCount++);

    // 5 is odd, change to 7 (still odd) - no notification
    a.value = 7;
    assert.strictEqual(notifyCount, 0);

    // 7 is odd, change to 8 (even) - should notify
    a.value = 8;
    assert.strictEqual(notifyCount, 1);

    // 8 is even, change to 10 (still even) - no notification
    a.value = 10;
    assert.strictEqual(notifyCount, 1);
  });

  /**
   * Edge case: Computed with NaN values uses Object.is() for equality
   *
   * Computed values should use Object.is() to avoid spurious notifications
   * when the value stays NaN.
   */
  it("should not notify when computed value stays NaN", () => {
    const s = new Signal(1);
    const c = computed(() => (s.value > 0 ? NaN : 0));

    let notifyCount = 0;
    c.subscribe(() => notifyCount++);

    assert.ok(Number.isNaN(c.value));

    // Change source but computed result is still NaN - no notification
    s.value = 2;
    assert.strictEqual(notifyCount, 0);

    s.value = 3;
    assert.strictEqual(notifyCount, 0);

    // Change to non-NaN - should notify
    s.value = -1;
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(c.value, 0);
  });

  /**
   * Short-circuiting optimization: avoid wasteful recomputations
   *
   * When an intermediate computed's value doesn't change AND it has subscribers,
   * downstream computeds should not be recomputed (short-circuit).
   */
  it("should short-circuit when intermediate computed value stays the same", () => {
    const a = new Signal(0);

    let bComputeCount = 0;
    let cComputeCount = 0;

    // b is the intermediate computed that we'll subscribe to
    const b = computed(() => {
      bComputeCount++;
      return a.value % 2;
    });

    // c depends on b
    const c = computed(() => {
      cComputeCount++;
      return b.value === 0 ? "even" : "odd";
    });

    // Subscribe to BOTH b and c - this enables short-circuiting on b
    let bNotifyCount = 0;
    let cNotifyCount = 0;
    b.subscribe(() => bNotifyCount++);
    c.subscribe(() => cNotifyCount++);

    // Initial state: a=0, b=0, c="even"
    assert.strictEqual(c.value, "even");
    assert.strictEqual(bComputeCount, 1);
    assert.strictEqual(cComputeCount, 1);

    // Change a from 0 to 2 (both even)
    // b changes from 0 to 0 (no change)
    // With short-circuiting, c should NOT recompute since b didn't change
    a.value = 2;

    // b should recompute (to check if value changed)
    assert.strictEqual(bComputeCount, 2);
    // c should NOT recompute (b's value didn't change, so it wasn't marked dirty)
    assert.strictEqual(cComputeCount, 1);
    // Neither should be notified (values didn't change)
    assert.strictEqual(bNotifyCount, 0);
    assert.strictEqual(cNotifyCount, 0);

    // Change a from 2 to 3 (even to odd)
    // b changes from 0 to 1 (change!)
    // c should recompute and notify
    a.value = 3;

    assert.strictEqual(bComputeCount, 3);
    assert.strictEqual(cComputeCount, 2);
    assert.strictEqual(bNotifyCount, 1);
    assert.strictEqual(cNotifyCount, 1);
    assert.strictEqual(c.value, "odd");
  });

  /**
   * Edge case: Computed dispose while another computed depends on it
   *
   * Disposing a computed should clean up its relationship with sources.
   */
  it("should dispose cleanly when other computeds depend on it", () => {
    const s = new Signal(1);
    const c1 = computed(() => s.value * 2);
    const c2 = computed(() => c1.value + 1);

    assert.strictEqual(c2.value, 3);

    c1.dispose();

    // After dispose, c1 returns its last value but doesn't update
    s.value = 5;
    assert.strictEqual(c1.value, 2); // Still returns 2
  });

  /**
   * Edge case: Reading disposed computed
   *
   * A disposed computed should return its last computed value
   * but should not recompute.
   */
  it("should return last value after dispose", () => {
    const s = new Signal(10);
    let computeCount = 0;
    const c = computed(() => {
      computeCount++;
      return s.value * 2;
    });

    assert.strictEqual(c.value, 20);
    assert.strictEqual(computeCount, 1);

    c.dispose();

    // Reading after dispose returns last value without recomputing
    s.value = 100;
    assert.strictEqual(c.value, 20);
    assert.strictEqual(computeCount, 1);
  });
});

describe("Computed caching behavior", () => {
  /**
   * Multiple reads should not recompute
   *
   * A computed should cache its value and only recompute when marked dirty.
   */
  it("should not recompute on multiple reads", () => {
    const s = new Signal(5);
    let computeCount = 0;

    const c = computed(() => {
      computeCount++;
      return s.value * 2;
    });

    // First read triggers computation
    assert.strictEqual(c.value, 10);
    assert.strictEqual(computeCount, 1);

    // Subsequent reads should use cached value
    assert.strictEqual(c.value, 10);
    assert.strictEqual(c.value, 10);
    assert.strictEqual(c.value, 10);
    assert.strictEqual(computeCount, 1); // Still 1, not 4
  });

  /**
   * Unrelated signal changes should not recompute
   *
   * If a computed doesn't depend on a signal, changes to that signal
   * should not cause recomputation.
   */
  it("should not recompute when unrelated signals change", () => {
    const related = new Signal(1);
    const unrelated = new Signal(100);
    let computeCount = 0;

    const c = computed(() => {
      computeCount++;
      return related.value * 2;
    });

    assert.strictEqual(c.value, 2);
    assert.strictEqual(computeCount, 1);

    // Changing unrelated signal should not trigger recompute
    unrelated.value = 200;
    unrelated.value = 300;
    assert.strictEqual(c.value, 2);
    assert.strictEqual(computeCount, 1);

    // Changing related signal should trigger recompute
    related.value = 5;
    assert.strictEqual(c.value, 10);
    assert.strictEqual(computeCount, 2);
  });

  /**
   * Computed #computing flag prevents re-entry during computation
   *
   * The #computing flag is checked to prevent infinite loops.
   * This test verifies the mechanism works by observing that
   * modifying a dependency during compute doesn't cause infinite loops.
   */
  it("should prevent re-entry during computation via #computing flag", () => {
    const trigger = new Signal(0);
    let computeCount = 0;

    const c = computed(() => {
      computeCount++;
      const val = trigger.value;
      // Modifying the trigger during compute could cause re-entry
      // but #computing flag prevents infinite loops
      if (val < 5) {
        trigger.value = val + 1;
      }
      return val;
    });

    // Initial computation
    assert.strictEqual(c.value, 0);
    // Should only compute a limited number of times, not infinite
    assert.ok(
      computeCount <= 2,
      `Expected computeCount <= 2, got ${computeCount}`,
    );
  });

  /**
   * Context isolation - nested computed access during computation
   *
   * When a computed reads another computed during its computation,
   * the dependency tracking context should be properly saved and restored.
   */
  it("should isolate context during nested computed access", () => {
    const a = new Signal(1);
    const b = new Signal(2);

    // c1 depends only on a
    const c1 = computed(() => a.value * 10);

    // c2 depends on b and reads c1
    const c2 = computed(() => c1.value + b.value);

    assert.strictEqual(c2.value, 12); // 10 + 2

    // Changing a should update c1, which should update c2
    a.value = 2;
    assert.strictEqual(c2.value, 22); // 20 + 2

    // Changing b should only trigger c2, not c1
    let c1ComputeCount = 0;
    const c1Tracked = computed(() => {
      c1ComputeCount++;
      return a.value * 10;
    });
    const c2Tracked = computed(() => c1Tracked.value + b.value);

    assert.strictEqual(c2Tracked.value, 22);
    assert.strictEqual(c1ComputeCount, 1);

    b.value = 5;
    assert.strictEqual(c2Tracked.value, 25);
    // c1 should not have recomputed
    assert.strictEqual(c1ComputeCount, 1);
  });

  /**
   * Dispose during subscriber notification
   *
   * Disposing a computed while its subscribers are being notified
   * should not cause errors.
   */
  it("should handle dispose during notification", () => {
    const s = new Signal(1);
    const c = computed(() => s.value * 2);

    let disposed = false;
    c.subscribe(() => {
      if (!disposed) {
        disposed = true;
        c.dispose();
      }
    });

    // This should not throw
    s.value = 2;

    // After dispose, value should be the last computed value
    assert.strictEqual(c.value, 4);
  });
});

describe("Computed loop protection", () => {
  it("should prevent infinite loops when computed modifies its dependency", () => {
    const s = new Signal(0);
    let computeCount = 0;

    const c = computed(() => {
      computeCount++;
      const val = s.value;
      s.value = val + 1; // Dangerous: modifying dependency inside compute
      return val;
    });

    c.subscribe(() => {});

    // Trigger update
    s.value = 100;

    // Should only compute twice (initial + one triggered), not infinite
    assert.strictEqual(computeCount, 2);
    assert.strictEqual(c.value, 100);
    assert.strictEqual(s.value, 101); // Value was modified once during compute
  });

  it("should prevent infinite loops with multiple computeds modifying shared signal", () => {
    const s = new Signal(0);
    let computeCountA = 0;
    let computeCountB = 0;

    // Both computeds read and write to the same signal
    const a = computed(() => {
      computeCountA++;
      const val = s.value;
      s.value = val + 1;
      return val;
    });

    const b = computed(() => {
      computeCountB++;
      const val = s.value;
      s.value = val + 1;
      return val;
    });

    a.subscribe(() => {});
    b.subscribe(() => {});

    // Trigger update - without protection this would loop forever
    s.value = 10;

    // Both computed should run a limited number of times, not infinite
    assert.ok(computeCountA < 10, `computeCountA was ${computeCountA}`);
    assert.ok(computeCountB < 10, `computeCountB was ${computeCountB}`);
  });
});

describe("Store", () => {
  it("should make object properties reactive", () => {
    const s = store({ count: 0 });
    let notifyCount = 0;

    const doubled = computed(() => s.count * 2);
    doubled.subscribe(() => {
      notifyCount++;
    });

    assert.strictEqual(doubled.value, 0);

    s.count = 5;
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(doubled.value, 10);
  });

  it("should wrap nested objects", () => {
    const s = store({ user: { name: "Alice" } });
    let notifyCount = 0;

    const upperName = computed(() => s.user.name.toUpperCase());
    upperName.subscribe(() => {
      notifyCount++;
    });

    assert.strictEqual(upperName.value, "ALICE");

    s.user.name = "Bob";
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(upperName.value, "BOB");
  });

  it("should wrap objects inside arrays", () => {
    const s = store({
      items: [{ name: "Alice" }, { name: "Bob" }],
    });
    let notifyCount = 0;

    const firstItem = computed(() => s.items[0]?.name ?? "");
    firstItem.subscribe(() => {
      notifyCount++;
    });

    assert.strictEqual(firstItem.value, "Alice");

    // Mutating object inside array should be reactive
    s.items[0]!.name = "Alicia";

    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(firstItem.value, "Alicia");
  });

  it("should wrap objects inside arrays when array is reassigned", () => {
    const s = store({
      items: [] as { name: string }[],
    });
    let notifyCount = 0;

    const firstName = computed(() => s.items[0]?.name ?? "none");
    firstName.subscribe(() => {
      notifyCount++;
    });

    assert.strictEqual(firstName.value, "none");

    // Assign new array with objects - objects should be wrapped
    s.items = [{ name: "Charlie" }];

    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(firstName.value, "Charlie");

    // Mutating object inside new array should be reactive
    s.items[0]!.name = "Carol";

    assert.strictEqual(notifyCount, 2);
    assert.strictEqual(firstName.value, "Carol");
  });

  /**
   * Edge case: Store with deeply nested objects
   *
   * Changes deep in the object tree should trigger reactivity.
   */
  it("should handle deeply nested objects", () => {
    const s = store({
      level1: {
        level2: {
          level3: {
            value: "deep",
          },
        },
      },
    });
    let notifyCount = 0;

    const deepValue = computed(() => s.level1.level2.level3.value);
    deepValue.subscribe(() => notifyCount++);

    assert.strictEqual(deepValue.value, "deep");

    s.level1.level2.level3.value = "changed";
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(deepValue.value, "changed");
  });

  /**
   * Edge case: Store with array mutations (push, pop, etc.)
   *
   * Array methods that mutate the array should trigger reactivity
   * when the array property is accessed reactively.
   */
  it("should react to array property reassignment", () => {
    const s = store({
      items: [1, 2, 3],
    });
    let notifyCount = 0;

    const length = computed(() => s.items.length);
    length.subscribe(() => notifyCount++);

    assert.strictEqual(length.value, 3);

    // Reassigning the array should trigger
    s.items = [1, 2, 3, 4];
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(length.value, 4);
  });

  /**
   * Edge case: Store property that starts as undefined
   *
   * Properties that are initially undefined should become reactive
   * when assigned.
   */
  it("should handle initially undefined properties", () => {
    const s = store<{ name?: string }>({});
    let notifyCount = 0;

    const name = computed(() => s.name ?? "default");
    name.subscribe(() => notifyCount++);

    assert.strictEqual(name.value, "default");

    s.name = "Alice";
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(name.value, "Alice");
  });

  /**
   * Edge case: Store with non-plain objects (class instances)
   *
   * Non-plain objects (like class instances, Date, etc.) should NOT
   * be recursively wrapped as stores - they should be stored as-is.
   */
  it("should not wrap non-plain objects", () => {
    class Person {
      constructor(public name: string) {}
    }

    const s = store({
      date: new Date("2024-01-01"),
      person: new Person("Alice"),
    });

    // Non-plain objects should be stored as-is
    assert.ok(s.date instanceof Date);
    assert.ok(s.person instanceof Person);
    assert.strictEqual(s.person.name, "Alice");
  });

  /**
   * Edge case: Reassigning a property with the same store value
   *
   * If a property already contains a store, assigning the same
   * store should not create a nested wrapper.
   */
  it("should not double-wrap existing stores", () => {
    const inner = store({ value: 1 });
    const s = store({ nested: inner });

    // Reassign with the same store
    s.nested = inner;

    // Should still work correctly
    let notifyCount = 0;
    const val = computed(() => s.nested.value);
    val.subscribe(() => notifyCount++);

    assert.strictEqual(val.value, 1);

    inner.value = 2;
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(val.value, 2);
  });

  /**
   * Edge case: Store with null values
   *
   * Null values should not be wrapped and should work correctly.
   */
  it("should handle null values in store", () => {
    const s = store<{ value: string | null }>({ value: "test" });
    let notifyCount = 0;

    const val = computed(() => s.value ?? "null");
    val.subscribe(() => notifyCount++);

    assert.strictEqual(val.value, "test");

    s.value = null;
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(val.value, "null");

    s.value = "restored";
    assert.strictEqual(notifyCount, 2);
    assert.strictEqual(val.value, "restored");
  });

  /**
   * Edge case: In-place array mutations (push, pop, etc.) do NOT trigger reactivity
   *
   * This documents that the store only tracks property assignments, not mutations
   * within the same reference. To trigger reactivity, you must reassign the array.
   */
  it("should NOT trigger reactivity on array.push() (by design)", () => {
    const s = store({ items: [1, 2, 3] });
    let notifyCount = 0;

    const length = computed(() => s.items.length);
    length.subscribe(() => notifyCount++);

    assert.strictEqual(length.value, 3);

    // In-place mutation does NOT trigger reactivity
    s.items.push(4);
    // The value changed in the array, but computed won't know
    assert.strictEqual(notifyCount, 0);

    // Must force a read to see the new value
    // The array is modified but computed still shows cached value
    assert.strictEqual(length.value, 3); // Still cached!

    // To properly update, reassign the array
    s.items = [...s.items];
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(length.value, 4);
  });

  /**
   * Edge case: In-place array mutations with splice
   *
   * Same as push - splice does not trigger reactivity.
   */
  it("should NOT trigger reactivity on array.splice() (by design)", () => {
    const s = store({ items: ["a", "b", "c"] });
    let notifyCount = 0;

    const firstItem = computed(() => s.items[0] ?? "none");
    firstItem.subscribe(() => notifyCount++);

    assert.strictEqual(firstItem.value, "a");

    // Removing first element via splice - no reactivity
    s.items.splice(0, 1);
    assert.strictEqual(notifyCount, 0);
    assert.strictEqual(firstItem.value, "a"); // Still cached

    // Reassign to trigger update
    s.items = [...s.items];
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(firstItem.value, "b");
  });
});

/**
 * Batch tests
 *
 * batch() defers subscriber notifications until the batch completes.
 * This prevents intermediate states from being observed and improves
 * performance when making multiple related updates.
 */
describe("batch", () => {
  /**
   * Basic batching: multiple signal updates, single notification
   *
   * When multiple signals are updated within a batch, subscribers
   * should only be notified once at the end.
   */
  it("should defer notifications until batch completes", () => {
    const a = new Signal(1);
    const b = new Signal(2);
    let notifyCount = 0;

    const sum = computed(() => a.value + b.value);
    sum.subscribe(() => notifyCount++);

    assert.strictEqual(sum.value, 3);

    batch(() => {
      a.value = 10;
      b.value = 20;
    });

    // Should only notify once, not twice
    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(sum.value, 30);
  });

  /**
   * Batch return value
   *
   * batch() should return the value returned by the function.
   */
  it("should return the function result", () => {
    const result = batch(() => {
      return 42;
    });
    assert.strictEqual(result, 42);
  });

  /**
   * Nested batches
   *
   * Nested batch calls should only flush notifications when the
   * outermost batch completes.
   */
  it("should support nested batches", () => {
    const s = new Signal(0);
    let notifyCount = 0;
    s.subscribe(() => notifyCount++);

    batch(() => {
      s.value = 1;
      assert.strictEqual(notifyCount, 0); // Not yet notified

      batch(() => {
        s.value = 2;
        assert.strictEqual(notifyCount, 0); // Still not notified
      });

      assert.strictEqual(notifyCount, 0); // Inner batch complete, but outer not
      s.value = 3;
    });

    // Now outer batch is complete, notifications should fire
    assert.ok(notifyCount >= 1);
  });

  /**
   * Batch with computed values
   *
   * Computed values should see consistent state during batch,
   * and subscribers should be notified after batch.
   */
  it("should work correctly with computed values", () => {
    const firstName = new Signal("John");
    const lastName = new Signal("Doe");
    const fullNameUpdates: string[] = [];

    const fullName = computed(() => `${firstName.value} ${lastName.value}`);
    fullName.subscribe(() => {
      fullNameUpdates.push(fullName.value);
    });

    batch(() => {
      firstName.value = "Jane";
      lastName.value = "Smith";
    });

    // Should only see the final value, not intermediate "Jane Doe"
    assert.strictEqual(fullNameUpdates.length, 1);
    assert.strictEqual(fullNameUpdates[0], "Jane Smith");
  });

  /**
   * Batch with error
   *
   * If the batch function throws, notifications should still
   * be processed for changes made before the error.
   */
  it("should process notifications even if batch throws", () => {
    const s = new Signal(0);
    let notified = false;
    s.subscribe(() => {
      notified = true;
    });

    try {
      batch(() => {
        s.value = 1;
        throw new Error("Batch error");
      });
    } catch {
      // Expected
    }

    // Notification should have been processed in finally block
    assert.strictEqual(notified, true);
  });

  /**
   * Batch with no changes
   *
   * A batch that makes no changes should not cause any notifications.
   */
  it("should handle batch with no changes", () => {
    const s = new Signal(1);
    let notifyCount = 0;
    s.subscribe(() => notifyCount++);

    batch(() => {
      // No changes
    });

    assert.strictEqual(notifyCount, 0);
  });

  /**
   * Batch with same-value assignments
   *
   * Assigning the same value should not queue any notifications.
   */
  it("should not notify for same-value assignments in batch", () => {
    const s = new Signal(1);
    let notifyCount = 0;
    s.subscribe(() => notifyCount++);

    batch(() => {
      s.value = 1; // Same value
      s.value = 1; // Same value again
    });

    assert.strictEqual(notifyCount, 0);
  });

  /**
   * Batch with store mutations
   *
   * Store property changes within a batch should also be deferred.
   */
  it("should work with store mutations", () => {
    const s = store({ x: 1, y: 2 });
    let notifyCount = 0;

    const sum = computed(() => s.x + s.y);
    sum.subscribe(() => notifyCount++);

    batch(() => {
      s.x = 10;
      s.y = 20;
    });

    assert.strictEqual(notifyCount, 1);
    assert.strictEqual(sum.value, 30);
  });

  /**
   * Batch deduplicates same handler subscribed to multiple signals
   *
   * If a handler is subscribed to signals A and B, and both are updated
   * in a batch, the handler is only called once (deduplicated via Set).
   */
  it("should deduplicate same handler subscribed to multiple signals in batch", () => {
    const a = new Signal(1);
    const b = new Signal(2);
    let callCount = 0;

    const handler = () => {
      callCount++;
    };

    a.subscribe(handler);
    b.subscribe(handler);

    batch(() => {
      a.value = 10;
      b.value = 20;
    });

    // Handler is deduplicated - only called once
    assert.strictEqual(callCount, 1);
  });

  /**
   * Batch deduplicates multiple updates to the same signal
   *
   * If the same signal is updated multiple times in a batch,
   * subscribers are only called once (deduplicated via Set).
   */
  it("should deduplicate multiple updates to same signal in batch", () => {
    const s = new Signal(0);
    let callCount = 0;

    s.subscribe(() => {
      callCount++;
    });

    batch(() => {
      s.value = 1;
      s.value = 2;
      s.value = 3;
    });

    // Subscriber is deduplicated - only called once
    assert.strictEqual(callCount, 1);
    assert.strictEqual(s.value, 3);
  });
});
