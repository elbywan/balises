import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html as baseHtml } from "../src/template.js";
import memoPlugin, { memo } from "../src/memo.js";
import { signal, type Signal } from "../src/signals/index.js";
import { createGCTracker } from "./gc-utils.js";

const html = baseHtml.with(memoPlugin);

describe("memo", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should render a memoized component", () => {
    let renderCount = 0;
    const Counter = memo(({ label }: { label: string }) => {
      renderCount++;
      return html`<span>${label}</span>`;
    });

    const { fragment, dispose } = html`
      <div>${Counter({ label: "hello" })}</div>
    `.render();
    document.body.appendChild(fragment);

    assert.strictEqual(renderCount, 1);
    assert.strictEqual(document.querySelector("span")?.textContent, "hello");

    dispose();
  });

  it("should skip re-render when props are shallowly equal in reactive context", () => {
    let renderCount = 0;
    const Label = memo(({ text }: { text: string }) => {
      renderCount++;
      return html`<span>${text}</span>`;
    });

    const toggle = signal(true);

    // The function accesses toggle.value (tracked dependency),
    // then calls Label with stable props.
    // When toggle changes, the computed re-evaluates, but memo()
    // returns the same descriptor reference (shallow-equal props),
    // so computed skips via Object.is without notifying subscribers.
    const { fragment, dispose } = html`
      <div>${() => (toggle.value, Label({ text: "stable" }))}</div>
    `.render();
    document.body.appendChild(fragment);

    // Initial render
    assert.strictEqual(renderCount, 1);
    assert.strictEqual(document.querySelector("span")?.textContent, "stable");

    // Toggle the signal - computed re-evaluates, but memo() returns
    // the same descriptor reference (equal props), so Object.is skips
    toggle.value = false;
    assert.strictEqual(renderCount, 1);

    // Toggle again - same props, still skips
    toggle.value = true;
    assert.strictEqual(renderCount, 1);

    dispose();
  });

  it("should re-render when props change in reactive context", () => {
    let renderCount = 0;
    const Label = memo(({ text }: { text: string }) => {
      renderCount++;
      return html`<span>${text}</span>`;
    });

    const text = signal("hello");

    const { fragment, dispose } = html`
      <div>${() => Label({ text: text.value })}</div>
    `.render();
    document.body.appendChild(fragment);

    assert.strictEqual(renderCount, 1);
    assert.strictEqual(document.querySelector("span")?.textContent, "hello");

    // Change the text - props change, should re-render
    text.value = "world";
    assert.strictEqual(renderCount, 2);
    assert.strictEqual(document.querySelector("span")?.textContent, "world");

    // Set to the same value - signal uses Object.is so computed won't even re-evaluate
    text.value = "world";
    assert.strictEqual(renderCount, 2);

    dispose();
  });

  it("should use custom comparator when provided", () => {
    let renderCount = 0;

    const Counter = memo(
      ({ count }: { count: number }) => {
        renderCount++;
        return html`<span>${count}</span>`;
      },
      (prev, next) => {
        // Consider props equal if count differs by 5 or less
        return Math.abs(prev.count - next.count) <= 5;
      },
    );

    const count = signal(0);

    const { fragment, dispose } = html`
      <div>${() => Counter({ count: count.value })}</div>
    `.render();
    document.body.appendChild(fragment);

    assert.strictEqual(renderCount, 1);
    assert.strictEqual(document.querySelector("span")?.textContent, "0");

    // Change by 1 - within tolerance, should NOT re-render
    count.value = 1;
    assert.strictEqual(renderCount, 1);
    assert.strictEqual(document.querySelector("span")?.textContent, "0");

    // Change to 10 - exceeds tolerance from last rendered (0), should re-render
    count.value = 10;
    assert.strictEqual(renderCount, 2);
    assert.strictEqual(document.querySelector("span")?.textContent, "10");

    dispose();
  });

  it("should work with reactive bindings inside the component", () => {
    let renderCount = 0;
    const count = signal(0);

    const Counter = memo(({ count }: { count: Signal<number> }) => {
      renderCount++;
      return html`<span>Count: ${() => count.value}</span>`;
    });

    const { fragment, dispose } = html`
      <div>${Counter({ count })}</div>
    `.render();
    document.body.appendChild(fragment);

    // Component renders once
    assert.strictEqual(renderCount, 1);
    assert.strictEqual(document.querySelector("span")?.textContent, "Count: 0");

    // Signal changes - reactive bindings inside the template update,
    // but the component function is NOT re-called
    count.value = 5;
    assert.strictEqual(renderCount, 1);
    assert.strictEqual(document.querySelector("span")?.textContent, "Count: 5");

    dispose();
  });

  it("should clean up subscriptions on dispose", () => {
    let renderCount = 0;
    const text = signal("hello");

    const Label = memo(({ text }: { text: string }) => {
      renderCount++;
      return html`<span>${text}</span>`;
    });

    const { fragment, dispose } = html`
      <div>${() => Label({ text: text.value })}</div>
    `.render();
    document.body.appendChild(fragment);

    assert.strictEqual(renderCount, 1);

    dispose();

    // After dispose, signal changes should not trigger re-render
    text.value = "world";
    assert.strictEqual(renderCount, 1);
  });

  it("should handle multiple independent memoized components", () => {
    let counterRenders = 0;
    let labelRenders = 0;

    const Counter = memo(({ count }: { count: number }) => {
      counterRenders++;
      return html`<span class="counter">${count}</span>`;
    });

    const Label = memo(({ text }: { text: string }) => {
      labelRenders++;
      return html`<span class="label">${text}</span>`;
    });

    const count = signal(0);
    const text = signal("hello");

    const { fragment, dispose } = html`
      <div>
        ${() => Counter({ count: count.value })}
        ${() => Label({ text: text.value })}
      </div>
    `.render();
    document.body.appendChild(fragment);

    assert.strictEqual(counterRenders, 1);
    assert.strictEqual(labelRenders, 1);

    // Change count - only Counter should re-render
    count.value = 1;
    assert.strictEqual(counterRenders, 2);
    assert.strictEqual(labelRenders, 1);

    // Change text - only Label should re-render
    text.value = "world";
    assert.strictEqual(counterRenders, 2);
    assert.strictEqual(labelRenders, 2);

    dispose();
  });

  it("should handle component returning non-template values", () => {
    let renderCount = 0;

    const TextComp = memo(({ text }: { text: string }) => {
      renderCount++;
      return text;
    });

    const text = signal("hello");

    const { fragment, dispose } = html`
      <div>${() => TextComp({ text: text.value })}</div>
    `.render();
    document.body.appendChild(fragment);

    assert.strictEqual(renderCount, 1);
    assert.ok(document.querySelector("div")?.textContent?.includes("hello"));

    text.value = "world";
    assert.strictEqual(renderCount, 2);
    assert.ok(document.querySelector("div")?.textContent?.includes("world"));

    dispose();
  });

  it("should handle component returning null", () => {
    let renderCount = 0;
    const show = signal(true);

    const MaybeContent = memo(({ show }: { show: boolean }) => {
      renderCount++;
      return show ? html`<span>visible</span>` : null;
    });

    const { fragment, dispose } = html`
      <div>${() => MaybeContent({ show: show.value })}</div>
    `.render();
    document.body.appendChild(fragment);

    assert.strictEqual(renderCount, 1);
    assert.strictEqual(document.querySelector("span")?.textContent, "visible");

    show.value = false;
    assert.strictEqual(renderCount, 2);
    assert.strictEqual(document.querySelector("span"), null);

    show.value = true;
    assert.strictEqual(renderCount, 3);
    assert.strictEqual(document.querySelector("span")?.textContent, "visible");

    dispose();
  });

  it("should handle transition between memo and non-memo values", () => {
    let renderCount = 0;

    const Label = memo(({ text }: { text: string }) => {
      renderCount++;
      return html`<span class="memo">${text}</span>`;
    });

    const useMemo = signal(true);
    const text = signal("hello");

    const { fragment, dispose } = html`
      <div>
        ${() =>
          useMemo.value
            ? Label({ text: text.value })
            : html`<em class="plain">${text.value}</em>`}
      </div>
    `.render();
    document.body.appendChild(fragment);

    // Initial render - memo path
    assert.strictEqual(renderCount, 1);
    assert.strictEqual(document.querySelector(".memo")?.textContent, "hello");
    assert.strictEqual(document.querySelector(".plain"), null);

    // Switch to non-memo path - pluginCleanup runs, memo DOM removed
    useMemo.value = false;
    assert.strictEqual(document.querySelector(".memo"), null);
    assert.strictEqual(document.querySelector(".plain")?.textContent, "hello");
    assert.strictEqual(renderCount, 1); // memo component not re-called

    // Update text in non-memo path
    text.value = "world";
    assert.strictEqual(document.querySelector(".plain")?.textContent, "world");

    // Switch back to memo path - renders fresh
    useMemo.value = true;
    assert.strictEqual(renderCount, 2);
    assert.strictEqual(document.querySelector(".memo")?.textContent, "world");
    assert.strictEqual(document.querySelector(".plain"), null);

    dispose();
  });

  it("should maintain independent caches for the same component in multiple slots", () => {
    let renderCount = 0;

    const Label = memo(({ text }: { text: string }) => {
      renderCount++;
      return html`<span class="label">${text}</span>`;
    });

    const textA = signal("A");
    const textB = signal("B");

    // Same memoized component used in two different reactive slots
    const { fragment, dispose } = html`
      <div>
        ${() => Label({ text: textA.value })}
        ${() => Label({ text: textB.value })}
      </div>
    `.render();
    document.body.appendChild(fragment);

    // Both slots render initially
    assert.strictEqual(renderCount, 2);
    const spans = document.querySelectorAll(".label");
    assert.strictEqual(spans.length, 2);
    assert.strictEqual(spans[0]?.textContent, "A");
    assert.strictEqual(spans[1]?.textContent, "B");

    // Update slot A only - slot B should NOT re-render
    textA.value = "A2";
    assert.strictEqual(renderCount, 3);

    const spansAfter = document.querySelectorAll(".label");
    assert.strictEqual(spansAfter.length, 2);
    assert.strictEqual(spansAfter[0]?.textContent, "A2");
    assert.strictEqual(spansAfter[1]?.textContent, "B");

    // Update slot B only - slot A should NOT re-render
    textB.value = "B2";
    assert.strictEqual(renderCount, 4);

    const spansFinal = document.querySelectorAll(".label");
    assert.strictEqual(spansFinal.length, 2);
    assert.strictEqual(spansFinal[0]?.textContent, "A2");
    assert.strictEqual(spansFinal[1]?.textContent, "B2");

    // Update both with same values - neither should re-render
    textA.value = "A2";
    textB.value = "B2";
    assert.strictEqual(renderCount, 4);

    dispose();
  });

  it("should return same descriptor reference for equal props (Object.is optimization)", () => {
    const Label = memo(({ text }: { text: string }) => {
      return html`<span>${text}</span>`;
    });

    const desc1 = Label({ text: "hello" });
    const desc2 = Label({ text: "hello" });

    // Same props -> same descriptor reference (Object.is will skip)
    assert.strictEqual(desc1, desc2);

    const desc3 = Label({ text: "world" });
    // Different props -> different descriptor reference
    assert.notStrictEqual(desc2, desc3);
  });

  it("should render DX warning string when used without plugin", () => {
    const Label = memo(({ text }: { text: string }) => {
      return html`<span>${text}</span>`;
    });

    const desc = Label({ text: "hello" });
    assert.ok(String(desc).includes("memoPlugin"));
  });

  describe("GC after dispose()", () => {
    it("should GC computed in memo reactive binding after dispose", async () => {
      const tracker = createGCTracker();
      const text = signal("hello");

      (function scope() {
        const Label = memo(({ text }: { text: string }) => {
          return html`<span>${text}</span>`;
        });

        const { dispose } = html`
          <div>${() => Label({ text: text.value })}</div>
        `.render();

        const comp = text.targets[0];
        assert.ok(comp, "computed should be in targets");
        tracker.track(comp, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(text.targets.length, 0, "targets should be empty");
    });

    it("should GC inner computed from memo component after dispose", async () => {
      const tracker = createGCTracker();
      const count = signal(0);

      (function scope() {
        const Counter = memo(({ count }: { count: Signal<number> }) => {
          return html`<span>${() => count.value}</span>`;
        });

        const { dispose } = html` <div>${Counter({ count })}</div> `.render();

        // The inner computed (from the reactive binding inside the component)
        const comp = count.targets[0];
        assert.ok(comp, "computed should be in targets");
        tracker.track(comp, "computed");
        dispose();
      })();

      await tracker.waitFor("computed");
      assert.strictEqual(count.targets.length, 0, "targets should be empty");
    });

    it("should GC computed when memo component is conditionally removed", async () => {
      const tracker = createGCTracker();
      const text = signal("hello");
      const show = signal(true);

      await (async function scope() {
        const Label = memo(({ text }: { text: string }) => {
          return html`<span>${text}</span>`;
        });

        const { fragment, dispose } = html`
          <div>${() => (show.value ? Label({ text: text.value }) : null)}</div>
        `.render();
        document.body.appendChild(fragment);

        // The outer computed tracks both show and text
        assert.ok(show.targets.length >= 1, "should have computed target");
        tracker.track(show.targets[0]!, "outerComputed");

        // Hide the component
        show.value = false;

        dispose();
        fragment.firstElementChild?.remove();
      })();

      await tracker.waitFor("outerComputed");
      assert.strictEqual(show.targets.length, 0, "targets should be empty");
    });

    it("should stop reacting to signal changes after dispose", () => {
      let renderCount = 0;
      const text = signal("hello");

      const Label = memo(({ text }: { text: string }) => {
        renderCount++;
        return html`<span>${text}</span>`;
      });

      const { dispose } = html`
        <div>${() => Label({ text: text.value })}</div>
      `.render();

      assert.strictEqual(renderCount, 1);

      dispose();

      // After dispose, signal changes should not trigger re-render
      text.value = "world";
      text.value = "again";
      assert.strictEqual(renderCount, 1, "should not re-render after dispose");
    });

    it("should GC computeds from multiple memo slots sharing a signal", async () => {
      const tracker = createGCTracker();
      const shared = signal("shared");

      (function scope() {
        const LabelA = memo(({ text }: { text: string }) => {
          return html`<span class="a">${text}</span>`;
        });

        const LabelB = memo(({ text }: { text: string }) => {
          return html`<span class="b">${text}</span>`;
        });

        const { dispose } = html`
          <div>
            ${() => LabelA({ text: shared.value })}
            ${() => LabelB({ text: shared.value })}
          </div>
        `.render();

        assert.strictEqual(shared.targets.length, 2);
        tracker.track(shared.targets[0]!, "comp1");
        tracker.track(shared.targets[1]!, "comp2");
        dispose();
      })();

      await tracker.waitForAll(["comp1", "comp2"]);
      assert.strictEqual(shared.targets.length, 0, "targets should be empty");
    });
  });
});
