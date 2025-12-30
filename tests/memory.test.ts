/**
 * Memory/cleanup tests for the reactive system.
 *
 * These tests verify that subscriptions, computeds, and dependencies
 * are properly cleaned up by checking internal state.
 *
 * Note: We test cleanup by checking internal array lengths rather than
 * relying on GC, which is non-deterministic.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { signal, computed, store, Signal } from "../src/signals/index.js";

describe("Cleanup behavior", () => {
  describe("Signal subscriptions", () => {
    it("should not call unsubscribed handler on value change", () => {
      const s = signal(1);

      let handler1Called = 0;
      let handler2Called = 0;
      let handler3Called = 0;

      const unsub1 = s.subscribe(() => handler1Called++);
      const unsub2 = s.subscribe(() => handler2Called++);
      const unsub3 = s.subscribe(() => handler3Called++);

      // All handlers called on first change
      s.value = 2;
      assert.strictEqual(handler1Called, 1);
      assert.strictEqual(handler2Called, 1);
      assert.strictEqual(handler3Called, 1);

      // Unsubscribe middle one
      unsub2();

      // Only handler1 and handler3 should be called
      s.value = 3;
      assert.strictEqual(handler1Called, 2);
      assert.strictEqual(handler2Called, 1); // Not called again
      assert.strictEqual(handler3Called, 2);

      // Clean up
      unsub1();
      unsub3();
    });

    it("should not call any old handlers after unsubscribing all", () => {
      const s = signal(1);
      const unsubscribes: (() => void)[] = [];
      let oldHandlerCalls = 0;

      for (let i = 0; i < 100; i++) {
        unsubscribes.push(s.subscribe(() => oldHandlerCalls++));
      }

      // Verify all 100 are called initially
      s.value = 2;
      assert.strictEqual(oldHandlerCalls, 100);

      // Unsubscribe all
      for (const unsub of unsubscribes) {
        unsub();
      }

      // Verify none of the old handlers are called
      oldHandlerCalls = 0;
      s.value = 3;
      assert.strictEqual(oldHandlerCalls, 0);
    });

    it("should work correctly after many subscribe/unsubscribe cycles", () => {
      const s = signal(1);

      // Perform many subscribe/unsubscribe cycles
      for (let i = 0; i < 100; i++) {
        const unsub = s.subscribe(() => {});
        unsub();
      }

      // Signal should still notify new subscribers correctly
      let callCount = 0;
      const unsub = s.subscribe(() => callCount++);

      s.value = 2;
      assert.strictEqual(callCount, 1);

      s.value = 3;
      assert.strictEqual(callCount, 2);

      unsub();
    });
  });

  describe("Computed cleanup", () => {
    it("should remove computed from signal targets after dispose", () => {
      const s = signal(1);
      const comp = computed(() => s.value * 2);

      // Establish dependency
      void comp.value;

      // Signal should have computed as target
      assert.strictEqual(s.targets.length, 1);
      assert.strictEqual(s.targets[0], comp);

      // Dispose
      comp.dispose();

      // Signal should no longer have computed as target
      assert.strictEqual(s.targets.length, 0);
    });

    it("should remove computed from multiple signal targets after dispose", () => {
      const a = signal(1);
      const b = signal(2);
      const c = signal(3);

      const comp = computed(() => a.value + b.value + c.value);
      void comp.value; // Establish dependencies

      assert.strictEqual(a.targets.length, 1);
      assert.strictEqual(b.targets.length, 1);
      assert.strictEqual(c.targets.length, 1);

      comp.dispose();

      assert.strictEqual(a.targets.length, 0);
      assert.strictEqual(b.targets.length, 0);
      assert.strictEqual(c.targets.length, 0);
    });

    it("should unlink old dependencies when computed deps change", () => {
      const flag = signal(true);
      const a = signal(1);
      const b = signal(2);

      const comp = computed(() => (flag.value ? a.value : b.value));
      void comp.value; // Initially depends on flag and a

      assert.strictEqual(flag.targets.length, 1);
      assert.strictEqual(a.targets.length, 1);
      assert.strictEqual(b.targets.length, 0);

      // Switch branch
      flag.value = false;
      void comp.value; // Now depends on flag and b

      assert.strictEqual(flag.targets.length, 1);
      assert.strictEqual(a.targets.length, 0); // a should be unlinked
      assert.strictEqual(b.targets.length, 1);

      comp.dispose();
    });

    it("should clean up chained computeds", () => {
      const s = signal(1);
      const comp1 = computed(() => s.value * 2);
      const comp2 = computed(() => comp1.value + 1);
      const comp3 = computed(() => comp2.value * 3);

      // Establish all dependencies
      void comp3.value;

      assert.strictEqual(s.targets.length, 1);
      assert.strictEqual(comp1.targets.length, 1);
      assert.strictEqual(comp2.targets.length, 1);

      // Dispose in order (leaf first)
      comp3.dispose();
      assert.strictEqual(comp2.targets.length, 0);

      comp2.dispose();
      assert.strictEqual(comp1.targets.length, 0);

      comp1.dispose();
      assert.strictEqual(s.targets.length, 0);
    });

    it("should clean up diamond dependency pattern", () => {
      const root = signal(1);
      const left = computed(() => root.value * 2);
      const right = computed(() => root.value * 3);
      const bottom = computed(() => left.value + right.value);

      // Establish all dependencies
      void bottom.value;

      // Root should have 2 targets (left and right)
      assert.strictEqual(root.targets.length, 2);
      assert.strictEqual(left.targets.length, 1);
      assert.strictEqual(right.targets.length, 1);

      // Dispose bottom first
      bottom.dispose();
      assert.strictEqual(left.targets.length, 0);
      assert.strictEqual(right.targets.length, 0);

      // Dispose left and right
      left.dispose();
      right.dispose();
      assert.strictEqual(root.targets.length, 0);
    });
  });

  describe("Computed subscriber cleanup", () => {
    it("should not notify subscribers after dispose", () => {
      const s = signal(1);
      const comp = computed(() => s.value * 2);

      let callCount = 0;
      comp.subscribe(() => callCount++);
      comp.subscribe(() => callCount++);
      comp.subscribe(() => callCount++);

      // Verify subscribers are called before dispose
      s.value = 2;
      assert.strictEqual(callCount, 3);

      comp.dispose();

      // After dispose, changing signal should not notify subscribers
      callCount = 0;
      s.value = 3;
      assert.strictEqual(callCount, 0);
    });
  });

  describe("Store cleanup", () => {
    it("should not notify computed subscribers after dispose", () => {
      const s = store({ count: 0 });

      const comp = computed(() => s.count * 2);
      void comp.value; // Establish dependency

      let notifyCount = 0;
      comp.subscribe(() => notifyCount++);

      // Verify subscriber is called before dispose
      s.count = 1;
      assert.strictEqual(notifyCount, 1);

      comp.dispose();

      // After dispose, store changes should not notify
      s.count = 2;
      assert.strictEqual(notifyCount, 1); // Should not increase
    });
  });

  describe("Long chains", () => {
    it("should clean up long computed chains", () => {
      const root = signal(1);
      const chain: ReturnType<typeof computed<number>>[] = [];

      let prev: Signal<number> | ReturnType<typeof computed<number>> = root;
      for (let i = 0; i < 50; i++) {
        const source: Signal<number> | ReturnType<typeof computed<number>> =
          prev;
        const next: ReturnType<typeof computed<number>> = computed(
          () => source.value + 1,
        );
        chain.push(next);
        prev = next;
      }

      // Establish all dependencies
      void chain[chain.length - 1]!.value;

      // Verify chain is connected
      assert.strictEqual(root.targets.length, 1);
      for (let i = 0; i < chain.length - 1; i++) {
        assert.strictEqual(chain[i]!.targets.length, 1);
      }

      // Dispose all in reverse order
      for (let i = chain.length - 1; i >= 0; i--) {
        chain[i]!.dispose();
      }

      // Verify all cleaned up
      assert.strictEqual(root.targets.length, 0);
    });

    it("should handle many signals feeding one computed", () => {
      const signals: Signal<number>[] = [];
      for (let i = 0; i < 50; i++) {
        signals.push(signal(i));
      }

      const sum = computed(() => signals.reduce((acc, s) => acc + s.value, 0));
      void sum.value; // Establish dependencies

      // All signals should have the computed as target
      for (const signal of signals) {
        assert.strictEqual(signal.targets.length, 1);
      }

      sum.dispose();

      // All should be cleaned up
      for (const signal of signals) {
        assert.strictEqual(signal.targets.length, 0);
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle dispose called multiple times", () => {
      const s = signal(1);
      const comp = computed(() => s.value * 2);
      void comp.value;

      comp.dispose();
      comp.dispose(); // Should not throw
      comp.dispose();

      assert.strictEqual(s.targets.length, 0);
    });

    it("should not call handler after multiple unsubscribe calls", () => {
      const s = signal(1);
      let callCount = 0;
      const unsub = s.subscribe(() => callCount++);

      // Verify handler is called before unsubscribe
      s.value = 2;
      assert.strictEqual(callCount, 1);

      // Multiple unsubscribe calls should be safe
      unsub();
      unsub(); // Should not throw
      unsub();

      // Handler should not be called after unsubscribe
      s.value = 3;
      assert.strictEqual(callCount, 1); // Should not increase
    });

    it("should dispose multiple computeds correctly", () => {
      const s = signal(1);
      const comps: ReturnType<typeof computed>[] = [];

      for (let i = 0; i < 10; i++) {
        comps.push(computed(() => s.value + i));
      }

      // Establish dependencies
      for (const comp of comps) {
        void comp.value;
      }

      // Verify all 10 are connected
      assert.strictEqual(s.targets.length, 10);

      // Dispose all (not during iteration - just in a loop)
      for (const comp of comps) {
        comp.dispose();
      }

      // Verify all cleaned up
      assert.strictEqual(s.targets.length, 0);
    });
  });
});
