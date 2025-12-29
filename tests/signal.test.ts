import { describe, it } from "node:test";
import assert from "node:assert";
import { Signal, computed, store } from "../src/signals/index.js";

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

  it("should dispose properly", () => {
    const a = new Signal(5);
    const doubled = computed(() => a.value * 2);
    let notifyCount = 0;
    doubled.subscribe(() => {
      notifyCount++;
    });
    a.value = 10;
    assert.strictEqual(notifyCount, 1);
    doubled.dispose();
    a.value = 20;
    // After dispose, the computed should not update
    assert.strictEqual(doubled.value, 20); // Last computed value before dispose trigger
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
});
