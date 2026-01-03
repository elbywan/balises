/**
 * Template garbage collection tests.
 *
 * These tests verify that after calling dispose(), templates properly
 * clean up all subscriptions and internal objects become eligible for GC.
 *
 * IMPORTANT: For valid GC tests, signals must be declared OUTSIDE the IIFE
 * so they remain alive. If dispose() doesn't properly unlink computeds,
 * the signal's `targets` array would keep them alive and prevent GC.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { html, each } from "../src/template.js";
import { signal, store, effect, computed } from "../src/signals/index.js";
import v8 from "node:v8";
import vm from "node:vm";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;

/**
 * Force GC and wait until condition is met or timeout.
 */
async function forceGCUntil(
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
function createGCTracker() {
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
    async waitForAll(labels: string[], timeoutMs = 2000) {
      const ok = await forceGCUntil(
        () => labels.every((l) => collected.has(l)),
        timeoutMs,
      );
      if (!ok) {
        const missing = labels.filter((l) => !collected.has(l));
        throw new Error(`GC timeout: not collected: ${missing.join(", ")}`);
      }
    },
  };
}

describe("Template GC after dispose()", () => {
  describe("text content bindings", () => {
    it("should GC computed in text binding after dispose", async () => {
      const tracker = createGCTracker();
      // Signal stays alive - this is key to a valid test
      const count = signal(0);

      (function scope() {
        const { dispose } = html`<div>${() => count.value}</div>`.render();
        // The computed is stored in signal's targets
        const comp = count.targets[0];
        assert.ok(comp, "computed should be in targets");
        tracker.track(comp, "computed");
        dispose();
      })();

      // If dispose() didn't unlink, count.targets would keep computed alive
      await tracker.waitFor("computed");
      assert.strictEqual(count.targets.length, 0, "targets should be empty");
    });

    it("should GC computed with multiple signal dependencies after dispose", async () => {
      const tracker = createGCTracker();
      const a = signal(1);
      const b = signal(2);

      (function scope() {
        const { dispose } = html`<div>
          ${() => a.value + b.value}
        </div>`.render();
        const comp = a.targets[0];
        assert.ok(comp, "computed should be in a.targets");
        tracker.track(comp, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(a.targets.length, 0);
      assert.strictEqual(b.targets.length, 0);
    });

    it("should unsubscribe signal in text binding after dispose", async () => {
      const count = signal(0);
      let updateCount = 0;

      const { dispose } = html`<div>${count}</div>`.render();

      // Subscribe to count to verify updates still work
      const unsub = count.subscribe(() => updateCount++);

      count.value = 1;
      assert.strictEqual(updateCount, 1, "subscriber should be called");

      dispose();

      // The template's subscription should be gone, but our test subscription remains
      count.value = 2;
      assert.strictEqual(updateCount, 2, "our subscriber still works");

      unsub();
    });
  });

  describe("attribute bindings", () => {
    it("should GC computed in dynamic attribute after dispose", async () => {
      const tracker = createGCTracker();
      const isActive = signal(true);

      (function scope() {
        const { dispose } = html`<div
          class=${() => (isActive.value ? "active" : "inactive")}
        ></div>`.render();
        const comp = isActive.targets[0];
        assert.ok(comp, "computed should be in targets");
        tracker.track(comp, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(isActive.targets.length, 0);
    });

    it("should GC computed in multi-part attribute after dispose", async () => {
      const tracker = createGCTracker();
      const count = signal(0);

      (function scope() {
        const { dispose } = html`<div
          data-info="Count: ${() => count.value * 2}"
        ></div>`.render();
        const comp = count.targets[0];
        assert.ok(comp, "computed should be in targets");
        tracker.track(comp, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(count.targets.length, 0);
    });
  });

  describe("property bindings", () => {
    it("should GC computed in property binding after dispose", async () => {
      const tracker = createGCTracker();
      const count = signal(0);

      (function scope() {
        const { dispose } = html`<input
          .value=${() => String(count.value)}
        />`.render();
        const comp = count.targets[0];
        assert.ok(comp, "computed should be in targets");
        tracker.track(comp, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(count.targets.length, 0);
    });
  });

  describe("event bindings", () => {
    it("should remove event listener after dispose", async () => {
      let clickCount = 0;
      const { fragment, dispose } = html`<button @click=${() => clickCount++}>
        Click
      </button>`.render();

      document.body.appendChild(fragment);
      const button = document.body.querySelector("button")!;

      button.click();
      assert.strictEqual(clickCount, 1);

      dispose();

      button.click();
      assert.strictEqual(
        clickCount,
        1,
        "handler should not fire after dispose",
      );

      button.remove();
    });
  });

  describe("nested templates", () => {
    it("should GC inner computed when outer template disposed", async () => {
      const tracker = createGCTracker();
      const inner = signal("inner");

      (function scope() {
        const { dispose } = html`<div>
          ${html`<span>${() => inner.value}</span>`}
        </div>`.render();
        const comp = inner.targets[0];
        assert.ok(comp, "computed should be in targets");
        tracker.track(comp, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(inner.targets.length, 0);
    });

    it("should GC deeply nested computeds after dispose", async () => {
      const tracker = createGCTracker();
      const a = signal("a");
      const b = signal("b");
      const c = signal("c");

      (function scope() {
        const { dispose } = html`<div>
          ${html`<div>
            ${() => a.value}
            ${html`<div>
              ${() => b.value} ${html`<div>${() => c.value}</div>`}
            </div>`}
          </div>`}
        </div>`.render();

        const compA = a.targets[0];
        const compB = b.targets[0];
        const compC = c.targets[0];
        assert.ok(compA && compB && compC, "all computeds should exist");
        tracker.track(compA, "compA");
        tracker.track(compB, "compB");
        tracker.track(compC, "compC");
        dispose();
      })();

      await tracker.waitForAll(["compA", "compB", "compC"]);
      assert.strictEqual(a.targets.length, 0);
      assert.strictEqual(b.targets.length, 0);
      assert.strictEqual(c.targets.length, 0);
    });

    it("should GC conditional nested template computed after dispose", async () => {
      const tracker = createGCTracker();
      const show = signal(true);
      const text = signal("hello");

      (function scope() {
        const { dispose } = html`<div>
          ${() => (show.value ? html`<span>${() => text.value}</span>` : null)}
        </div>`.render();
        // The outer computed (for the condition)
        const outerComp = show.targets[0];
        // The inner computed (for text.value)
        const innerComp = text.targets[0];
        assert.ok(outerComp, "outer computed should exist");
        assert.ok(innerComp, "inner computed should exist");
        tracker.track(outerComp, "outerComp");
        tracker.track(innerComp, "innerComp");
        dispose();
      })();

      await tracker.waitForAll(["outerComp", "innerComp"]);
      assert.strictEqual(show.targets.length, 0);
      assert.strictEqual(text.targets.length, 0);
    });

    it("should GC array of template computeds after dispose", async () => {
      const tracker = createGCTracker();
      const items = signal(["a", "b", "c"]);

      (function scope() {
        const { dispose } = html`<ul>
          ${() => items.value.map((i) => html`<li>${i}</li>`)}
        </ul>`.render();
        const comp = items.targets[0];
        assert.ok(comp, "computed should exist");
        tracker.track(comp, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(items.targets.length, 0);
    });
  });

  describe("each() lists", () => {
    it("should unsubscribe each() after dispose", async () => {
      const items = signal([1, 2, 3]);
      let updateCount = 0;

      const { dispose } = html`<ul>
        ${each(
          items,
          (i) => i,
          (item) => html`<li>${item}</li>`,
        )}
      </ul>`.render();

      // Add our own subscriber to verify signal still works
      const unsub = items.subscribe(() => updateCount++);

      items.value = [4, 5];
      assert.strictEqual(updateCount, 1);

      dispose();

      // After dispose, template subscription is gone but ours remains
      items.value = [6, 7, 8];
      assert.strictEqual(updateCount, 2);

      unsub();
    });

    it("should GC each() with getter function computed after dispose", async () => {
      const tracker = createGCTracker();
      const multiplier = signal(1);

      (function scope() {
        const { dispose } = html`<ul>
          ${each(
            () => [1, 2, 3].map((n) => n * multiplier.value),
            (i) => i,
            (item) => html`<li>${item}</li>`,
          )}
        </ul>`.render();
        // When using a getter, each() creates a computed
        const comp = multiplier.targets[0];
        assert.ok(comp, "computed should exist for getter");
        tracker.track(comp, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(multiplier.targets.length, 0);
    });

    it("should GC each() item template computeds after dispose", async () => {
      const tracker = createGCTracker();
      const items = signal([
        { id: 1, name: signal("Alice") },
        { id: 2, name: signal("Bob") },
      ]);
      const nameSignals = items.value.map((i) => i.name);

      (function scope() {
        const { dispose } = html`<ul>
          ${each(
            items,
            (i) => i.id,
            (item) => html`<li>${() => item.name.value}</li>`,
          )}
        </ul>`.render();

        // Each item template has a computed for the name
        for (const ns of nameSignals) {
          const comp = ns.targets[0];
          assert.ok(comp, "item computed should exist");
          tracker.track(comp, `comp-${ns.value}`);
        }
        dispose();
      })();

      await tracker.waitForAll(nameSignals.map((ns) => `comp-${ns.value}`));
      for (const ns of nameSignals) {
        assert.strictEqual(ns.targets.length, 0);
      }
    });

    it("should unsubscribe nested each() after dispose", async () => {
      const matrix = signal([
        [1, 2],
        [3, 4],
      ]);
      let updateCount = 0;

      const { dispose } = html`<div>
        ${each(
          matrix,
          (row, i) => i,
          (row) =>
            html`<div>
              ${each(
                row,
                (cell, j) => j,
                (cell) => html`<span>${cell}</span>`,
              )}
            </div>`,
        )}
      </div>`.render();

      const unsub = matrix.subscribe(() => updateCount++);

      matrix.value = [[5, 6]];
      assert.strictEqual(updateCount, 1);

      dispose();

      matrix.value = [[7, 8, 9]];
      assert.strictEqual(updateCount, 2); // Our subscriber still works

      unsub();
    });
  });

  describe("store bindings", () => {
    it("should stop reacting to store changes after dispose", () => {
      const state = store({ count: 0 });
      let renderCount = 0;

      const { fragment, dispose } = html`<div>
        ${() => {
          renderCount++;
          return state.count;
        }}
      </div>`.render();

      // Initial render
      assert.strictEqual(renderCount, 1);
      assert.strictEqual(fragment.textContent?.trim(), "0");

      // Update triggers re-render
      state.count = 1;
      assert.strictEqual(renderCount, 2);

      dispose();

      // After dispose, updates should not trigger re-render
      state.count = 2;
      state.count = 3;
      assert.strictEqual(renderCount, 2, "should not re-render after dispose");
    });

    it("should handle nested store properties after dispose", () => {
      const state = store({
        user: { name: "Alice", age: 30 },
      });
      let renderCount = 0;

      const { dispose } = html`<div>
        ${() => {
          renderCount++;
          return `${state.user.name} - ${state.user.age}`;
        }}
      </div>`.render();

      assert.strictEqual(renderCount, 1);

      state.user.name = "Bob";
      assert.strictEqual(renderCount, 2);

      dispose();

      // After dispose, nested updates should not trigger re-render
      state.user.name = "Charlie";
      state.user.age = 40;
      assert.strictEqual(renderCount, 2, "should not re-render after dispose");
    });
  });

  describe("complex scenarios", () => {
    it("should GC all computeds with mixed binding types after dispose", async () => {
      const tracker = createGCTracker();
      const text = signal("hello");
      const className = signal("active");
      const value = signal("input");

      (function scope() {
        const { dispose } = html`<div class=${() => className.value}>
          <span>${() => text.value}</span>
          <input .value=${() => value.value} />
        </div>`.render();

        tracker.track(text.targets[0]!, "textComp");
        tracker.track(className.targets[0]!, "classComp");
        tracker.track(value.targets[0]!, "valueComp");
        dispose();
      })();

      await tracker.waitForAll(["textComp", "classComp", "valueComp"]);
      assert.strictEqual(text.targets.length, 0);
      assert.strictEqual(className.targets.length, 0);
      assert.strictEqual(value.targets.length, 0);
    });

    it("should GC conditional branch computeds after dispose", async () => {
      const tracker = createGCTracker();
      const show = signal(true);
      const a = signal("a");
      const b = signal("b");

      (function scope() {
        const { dispose } = html`<div>
          ${() =>
            show.value
              ? html`<span>${() => a.value}</span>`
              : html`<span>${() => b.value}</span>`}
        </div>`.render();

        tracker.track(show.targets[0]!, "showComp");
        tracker.track(a.targets[0]!, "aComp");
        // b shouldn't have a computed yet (false branch not rendered)
        assert.strictEqual(b.targets.length, 0);

        // Switch to false branch
        show.value = false;
        tracker.track(b.targets[0]!, "bComp");

        dispose();
      })();

      await tracker.waitForAll(["showComp", "aComp", "bComp"]);
      assert.strictEqual(show.targets.length, 0);
      assert.strictEqual(a.targets.length, 0);
      assert.strictEqual(b.targets.length, 0);
    });

    it("should GC after DOM attachment and removal", async () => {
      const tracker = createGCTracker();
      const count = signal(0);

      (function scope() {
        const { fragment, dispose } = html`<div id="gc-test">
          ${() => count.value}
        </div>`.render();

        document.body.appendChild(fragment);
        tracker.track(count.targets[0]!, "computed");

        count.value = 1;
        count.value = 2;

        dispose();
        document.getElementById("gc-test")!.remove();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(count.targets.length, 0);
    });

    it("should GC when dispose called during signal update", async () => {
      const tracker = createGCTracker();
      const trigger = signal(0);

      (function scope() {
        let disposeRef: (() => void) | null = null;

        const { dispose } = html`<div>
          ${() => {
            if (trigger.value === 5) {
              disposeRef?.();
            }
            return trigger.value;
          }}
        </div>`.render();

        disposeRef = dispose;
        tracker.track(trigger.targets[0]!, "computed");

        trigger.value = 1;
        trigger.value = 2;
        trigger.value = 3;
        trigger.value = 4;
        trigger.value = 5; // Triggers dispose inside computed

        // These should not cause errors after dispose
        trigger.value = 6;
        trigger.value = 7;
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(trigger.targets.length, 0);
    });

    it("should GC multiple independent templates sharing a signal", async () => {
      const tracker = createGCTracker();
      const shared = signal(0);

      (function scope() {
        const { dispose: dispose1 } = html`<div>
          ${() => shared.value}
        </div>`.render();
        const { dispose: dispose2 } = html`<div>
          ${() => shared.value * 2}
        </div>`.render();
        const { dispose: dispose3 } = html`<div>
          ${() => shared.value * 3}
        </div>`.render();

        assert.strictEqual(shared.targets.length, 3);

        tracker.track(shared.targets[0]!, "comp1");
        tracker.track(shared.targets[1]!, "comp2");
        tracker.track(shared.targets[2]!, "comp3");

        dispose1();
        dispose2();
        dispose3();
      })();

      await tracker.waitForAll(["comp1", "comp2", "comp3"]);
      assert.strictEqual(shared.targets.length, 0);
    });
  });

  describe("edge cases", () => {
    it("should handle dispose called multiple times", async () => {
      const tracker = createGCTracker();
      const count = signal(0);

      (function scope() {
        const { dispose } = html`<div>${() => count.value}</div>`.render();
        tracker.track(count.targets[0]!, "computed");

        dispose();
        dispose(); // Should not throw
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(count.targets.length, 0);
    });

    it("should GC computed that accesses signal multiple times", async () => {
      const tracker = createGCTracker();
      const s = signal(1);

      (function scope() {
        const { dispose } = html`<div>
          ${() => s.value + s.value + s.value}
        </div>`.render();
        // May have duplicates in targets, but at least one should exist
        assert.ok(s.targets.length >= 1);
        tracker.track(s.targets[0]!, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(s.targets.length, 0);
    });

    it("should GC SVG template computed after dispose", async () => {
      const tracker = createGCTracker();
      const r = signal(10);

      (function scope() {
        const { dispose } = html`<svg>
          <circle r=${() => r.value} />
        </svg>`.render();
        tracker.track(r.targets[0]!, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(r.targets.length, 0);
    });

    it("should GC when toggling between null and template", async () => {
      const tracker = createGCTracker();
      const show = signal(false);
      const text = signal("hello");

      (function scope() {
        const { dispose } = html`<div>
          ${() => (show.value ? html`<span>${() => text.value}</span>` : null)}
        </div>`.render();

        tracker.track(show.targets[0]!, "showComp");

        // Toggle multiple times
        show.value = true;
        tracker.track(text.targets[0]!, "textComp");
        show.value = false;
        show.value = true;
        show.value = false;
        show.value = true;

        dispose();
      })();

      await tracker.waitForAll(["showComp", "textComp"]);
      assert.strictEqual(show.targets.length, 0);
      assert.strictEqual(text.targets.length, 0);
    });
  });

  describe("composable function components", () => {
    it("should GC function component computed when conditionally removed", async () => {
      const tracker = createGCTracker();
      // Signal to track - lives outside the IIFE so we can verify targets are cleaned
      const count = signal(0);

      // Composable function component using the external signal
      function Counter({ count: countSignal }: { count: typeof count }) {
        return html`<button>${() => countSignal.value}</button>`;
      }

      const show = signal(true);

      await (async function scope() {
        const { fragment, dispose } = html`<div>
          ${() => (show.value ? Counter({ count }) : null)}
        </div>`.render();

        document.body.appendChild(fragment);

        // Component is shown - should have computed in targets
        assert.ok(count.targets.length >= 1, "should have computed target");
        tracker.track(count.targets[0]!, "counterComputed");

        // Hide the component - computed should be disposed and GC'd
        show.value = false;

        // Force GC and verify the computed is collected
        await tracker.waitFor("counterComputed");
        assert.strictEqual(
          count.targets.length,
          0,
          "targets should be empty after hiding",
        );

        dispose();
        fragment.firstElementChild?.remove();
      })();
    });

    it("should GC function component computed after toggling multiple times", async () => {
      const tracker = createGCTracker();
      const value = signal("test");

      function Item({ value: valueSignal }: { value: typeof value }) {
        return html`<span>${() => valueSignal.value}</span>`;
      }

      const show = signal(true);

      await (async function scope() {
        const { fragment, dispose } = html`<div>
          ${() => (show.value ? Item({ value }) : null)}
        </div>`.render();

        document.body.appendChild(fragment);

        // Toggle multiple times - each hide should dispose the previous computed
        show.value = false;
        show.value = true;
        show.value = false;
        show.value = true;
        show.value = false;
        show.value = true;

        // Currently shown - track the current computed
        assert.ok(value.targets.length >= 1, "should have computed target");
        tracker.track(value.targets[0]!, "finalComputed");

        // Final hide
        show.value = false;

        await tracker.waitFor("finalComputed");
        assert.strictEqual(
          value.targets.length,
          0,
          "targets should be empty after final hide",
        );

        dispose();
        fragment.firstElementChild?.remove();
      })();
    });

    it("should GC nested function component computeds when parent removed", async () => {
      const tracker = createGCTracker();
      const outerValue = signal("outer");
      const innerValue = signal("inner");

      function Inner({ value }: { value: typeof innerValue }) {
        return html`<span class="inner">${() => value.value}</span>`;
      }

      function Outer({
        outerVal,
        innerVal,
      }: {
        outerVal: typeof outerValue;
        innerVal: typeof innerValue;
      }) {
        return html`<div class="outer">
          ${() => outerVal.value} ${Inner({ value: innerVal })}
        </div>`;
      }

      const show = signal(true);

      await (async function scope() {
        const { fragment, dispose } = html`<div>
          ${() =>
            show.value
              ? Outer({ outerVal: outerValue, innerVal: innerValue })
              : null}
        </div>`.render();

        document.body.appendChild(fragment);

        // Both outer and inner computeds should exist
        assert.ok(
          outerValue.targets.length >= 1,
          "outer should have computed target",
        );
        assert.ok(
          innerValue.targets.length >= 1,
          "inner should have computed target",
        );

        tracker.track(outerValue.targets[0]!, "outerComputed");
        tracker.track(innerValue.targets[0]!, "innerComputed");

        // Hide the parent - both should be disposed
        show.value = false;

        await tracker.waitForAll(["outerComputed", "innerComputed"]);
        assert.strictEqual(
          outerValue.targets.length,
          0,
          "outer targets should be empty",
        );
        assert.strictEqual(
          innerValue.targets.length,
          0,
          "inner targets should be empty",
        );

        dispose();
        fragment.firstElementChild?.remove();
      })();
    });

    it("should GC function component with store when conditionally removed", async () => {
      const tracker = createGCTracker();
      // Use a signal inside the store pattern to track GC
      const countSignal = signal(0);

      // Simulate store-like usage where the signal is accessed via a getter
      const state = {
        get count() {
          return countSignal.value;
        },
      };

      function Counter({ state: s }: { state: typeof state }) {
        return html`<button>${() => s.count}</button>`;
      }

      const show = signal(true);

      await (async function scope() {
        const { fragment, dispose } = html`<div>
          ${() => (show.value ? Counter({ state }) : null)}
        </div>`.render();

        document.body.appendChild(fragment);

        // Component is shown - computed should be tracking countSignal
        assert.ok(
          countSignal.targets.length >= 1,
          "should have computed target",
        );
        tracker.track(countSignal.targets[0]!, "storeComputed");

        // Hide the component
        show.value = false;

        await tracker.waitFor("storeComputed");
        assert.strictEqual(
          countSignal.targets.length,
          0,
          "targets should be empty after hiding",
        );

        dispose();
        fragment.firstElementChild?.remove();
      })();
    });

    it("should GC function component computed after DOM removal and dispose", async () => {
      const tracker = createGCTracker();
      const text = signal("hello");

      function Message({ text: textSignal }: { text: typeof text }) {
        return html`<p>${() => textSignal.value}</p>`;
      }

      await (async function scope() {
        const { fragment, dispose } = html`<div id="gc-dom-test">
          ${Message({ text })}
        </div>`.render();

        document.body.appendChild(fragment);

        // Verify component is rendered and tracking
        assert.ok(text.targets.length >= 1, "should have computed target");
        tracker.track(text.targets[0]!, "messageComputed");

        // Update works
        text.value = "world";
        assert.strictEqual(
          document.querySelector("#gc-dom-test p")?.textContent,
          "world",
        );

        // Dispose and remove from DOM
        dispose();
        document.getElementById("gc-dom-test")?.remove();
      })();

      await tracker.waitFor("messageComputed");
      assert.strictEqual(text.targets.length, 0, "targets should be empty");
    });
  });

  describe("each() computed disposal", () => {
    it("should dispose computed created from getter function", async () => {
      const tracker = createGCTracker();
      const factor = signal(2);

      (function scope() {
        const { dispose } = html`<ul>
          ${each(
            () => [1, 2, 3].map((n) => n * factor.value),
            (item) => html`<li>${item}</li>`,
          )}
        </ul>`.render();

        // The each() creates a computed for the getter.
        // The getter accesses factor.value 3 times (once per map iteration),
        // so there are 3 entries in targets (duplicates allowed for performance).
        assert.ok(
          factor.targets.length >= 1,
          "should have at least one target",
        );
        tracker.track(factor.targets[0]!, "eachComputed");
        dispose();
      })();

      await tracker.waitFor("eachComputed");
      assert.strictEqual(factor.targets.length, 0);
    });

    it("should not leak subscriptions when each() list changes", async () => {
      const items = signal([1, 2, 3]);
      let updateCount = 0;

      const { dispose } = html`<ul>
        ${each(
          items,
          (i) => i,
          (item) => html`<li>${item}</li>`,
        )}
      </ul>`.render();

      const unsub = items.subscribe(() => updateCount++);

      // Change list multiple times
      items.value = [4, 5];
      items.value = [6, 7, 8, 9];
      items.value = [];
      items.value = [10];

      assert.strictEqual(updateCount, 4, "subscriber should be called 4 times");

      dispose();

      // After dispose, our subscriber still works
      items.value = [11, 12];
      assert.strictEqual(updateCount, 5);

      unsub();
    });
  });

  describe("nested reactives in function slots", () => {
    it("should dispose nested computed when function slot re-runs", () => {
      const mode = signal(0);
      const source = signal(100);
      let nestedComputedCreated = 0;

      const { dispose } = html`<div>
        ${() => {
          nestedComputedCreated++;
          void mode.value; // track mode to trigger re-runs

          // Create a nested computed that depends on source
          const nested = computed(() => source.value * 2);

          return html`<span>${nested}</span>`;
        }}
      </div>`.render();

      assert.strictEqual(
        nestedComputedCreated,
        1,
        "should create once initially",
      );
      assert.strictEqual(
        source.targets.length,
        1,
        "source should have 1 target initially",
      );

      // Trigger re-run - previous nested computed should be disposed
      mode.value = 1;
      assert.strictEqual(
        nestedComputedCreated,
        2,
        "should create new nested on re-run",
      );
      // The old computed should be disposed, new one created
      assert.strictEqual(
        source.targets.length,
        1,
        "source should still have 1 target (old disposed, new created)",
      );

      mode.value = 2;
      assert.strictEqual(
        nestedComputedCreated,
        3,
        "should create new nested again",
      );
      assert.strictEqual(
        source.targets.length,
        1,
        "source should still have 1 target",
      );

      dispose();
      // After full dispose, no targets should remain
      assert.strictEqual(
        source.targets.length,
        0,
        "source should have 0 targets after dispose",
      );
    });

    it("should dispose nested effect when function slot re-runs", () => {
      const mode = signal("a");
      let effectRuns = 0;
      let cleanupRuns = 0;

      // Import effect dynamically to avoid circular issues

      const { dispose } = html`<div>
        ${() => {
          const currentMode = mode.value;
          effect(() => {
            effectRuns++;
            return () => {
              cleanupRuns++;
            };
          });
          return html`<span>${currentMode}</span>`;
        }}
      </div>`.render();

      assert.strictEqual(effectRuns, 1, "effect should run once initially");
      assert.strictEqual(cleanupRuns, 0, "no cleanup yet");

      // Trigger re-run - previous effect should be disposed
      mode.value = "b";
      assert.strictEqual(effectRuns, 2, "new effect should run");
      assert.strictEqual(cleanupRuns, 1, "previous effect cleanup should run");

      mode.value = "c";
      assert.strictEqual(effectRuns, 3, "another new effect");
      assert.strictEqual(cleanupRuns, 2, "another cleanup");

      dispose();
      // Final cleanup should run
      assert.strictEqual(cleanupRuns, 3, "final effect cleanup on dispose");
    });

    it("should dispose nested computed in attribute function when it re-runs", () => {
      const count = signal(0);
      let nestedCreations = 0;

      const { dispose } = html`<div
        class=${() => {
          nestedCreations++;
          // This would be unusual but should still work
          return `count-${count.value}`;
        }}
      ></div>`.render();

      assert.strictEqual(nestedCreations, 1, "should create once initially");

      count.value = 1;
      assert.strictEqual(nestedCreations, 2, "should recreate on change");

      count.value = 2;
      assert.strictEqual(nestedCreations, 3, "should recreate again");

      dispose();
    });

    it("should handle deeply nested function components with cleanup", () => {
      const outer = signal(0);
      const effectLog: string[] = [];

      const InnerComponent = (id: number) => {
        effect(() => {
          effectLog.push(`effect-${id}-run`);
          return () => effectLog.push(`effect-${id}-cleanup`);
        });
        return html`<span>inner-${id}</span>`;
      };

      const { dispose } = html`<div>
        ${() => {
          const id = outer.value;
          return InnerComponent(id);
        }}
      </div>`.render();

      assert.deepStrictEqual(effectLog, ["effect-0-run"]);

      outer.value = 1;
      assert.deepStrictEqual(effectLog, [
        "effect-0-run",
        "effect-0-cleanup",
        "effect-1-run",
      ]);

      outer.value = 2;
      assert.deepStrictEqual(effectLog, [
        "effect-0-run",
        "effect-0-cleanup",
        "effect-1-run",
        "effect-1-cleanup",
        "effect-2-run",
      ]);

      dispose();
      assert.deepStrictEqual(effectLog, [
        "effect-0-run",
        "effect-0-cleanup",
        "effect-1-run",
        "effect-1-cleanup",
        "effect-2-run",
        "effect-2-cleanup",
      ]);
    });
  });
});
