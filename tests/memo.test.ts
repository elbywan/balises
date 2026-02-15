import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html as baseHtml } from "../src/template.js";
import memoPlugin, { memo } from "../src/memo.js";
import eachPlugin, { each } from "../src/each.js";
import { signal, batch, type Signal } from "../src/signals/index.js";
import { createGCTracker } from "./gc-utils.js";

const html = baseHtml.with(memoPlugin);
const htmlWithEach = baseHtml.with(memoPlugin, eachPlugin);

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

  describe("shallowEqual edge cases", () => {
    it("should skip re-render with empty props objects", () => {
      let renderCount = 0;
      const Comp = memo((props: Record<string, never>) => {
        renderCount++;
        void props;
        return html`<span>empty</span>`;
      });

      const toggle = signal(true);

      const { fragment, dispose } = html`
        <div>${() => (toggle.value, Comp({}))}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);

      // Re-trigger computed with new empty object - shallowEqual({}, {}) is true
      toggle.value = false;
      assert.strictEqual(renderCount, 1);

      dispose();
    });

    it("should treat NaN props as equal via Object.is", () => {
      let renderCount = 0;
      const Comp = memo(({ x }: { x: number }) => {
        renderCount++;
        return html`<span>${String(x)}</span>`;
      });

      const toggle = signal(true);

      const { fragment, dispose } = html`
        <div>${() => (toggle.value, Comp({ x: NaN }))}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);

      // Object.is(NaN, NaN) is true, so shallowEqual should return true
      toggle.value = false;
      assert.strictEqual(renderCount, 1);

      dispose();
    });

    it("should distinguish undefined value from missing key", () => {
      let renderCount = 0;
      const Comp = memo((props: Record<string, unknown>) => {
        renderCount++;
        return html`<span>${Object.keys(props).length}</span>`;
      });

      const phase = signal(0);

      const { fragment, dispose } = html`
        <div>
          ${() => {
            const p = phase.value;
            if (p === 0) return Comp({ a: 1, b: undefined });
            if (p === 1) return Comp({ a: 1 });
            return Comp({ a: 1, b: undefined });
          }}
        </div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);

      // { a: 1, b: undefined } vs { a: 1 } - key count differs, should re-render
      phase.value = 1;
      assert.strictEqual(renderCount, 2);

      // { a: 1 } vs { a: 1, b: undefined } - reverse direction, should re-render
      phase.value = 2;
      assert.strictEqual(renderCount, 3);

      dispose();
    });

    it("should detect asymmetric key sets", () => {
      let renderCount = 0;
      const Comp = memo((props: Record<string, number>) => {
        renderCount++;
        return html`<span>${JSON.stringify(props)}</span>`;
      });

      const phase = signal(0);

      const { fragment, dispose } = html`
        <div>
          ${() => {
            const p = phase.value;
            if (p === 0) return Comp({ a: 1 });
            if (p === 1) return Comp({ a: 1, b: 2 });
            return Comp({ a: 1, c: 2 });
          }}
        </div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);

      // { a: 1 } vs { a: 1, b: 2 } - different key count
      phase.value = 1;
      assert.strictEqual(renderCount, 2);

      // { a: 1, b: 2 } vs { a: 1, c: 2 } - same count, different keys
      phase.value = 2;
      assert.strictEqual(renderCount, 3);

      dispose();
    });
  });

  describe("component return value edge cases", () => {
    it("should handle component returning undefined", () => {
      let renderCount = 0;
      const Comp = memo((props: { x: number }) => {
        renderCount++;
        void props;
        return undefined;
      });

      const val = signal(0);

      const { fragment, dispose } = html`
        <div>${() => Comp({ x: val.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);
      // div should have no meaningful text content (just whitespace/empty)
      const div = document.querySelector("div")!;
      assert.strictEqual(div.textContent?.trim(), "");

      // Change props - should re-render without errors
      val.value = 1;
      assert.strictEqual(renderCount, 2);

      dispose();
    });

    it("should handle falsy return values correctly", () => {
      let renderCount = 0;
      const Comp = memo(({ val }: { val: unknown }) => {
        renderCount++;
        return val;
      });

      const phase = signal(0);
      const values = [false, 0, ""];

      const { fragment, dispose } = html`
        <div id="target">${() => Comp({ val: values[phase.value] })}</div>
      `.render();
      document.body.appendChild(fragment);
      const div = document.getElementById("target")!;

      // false renders nothing (boolean filtered out by renderValue)
      assert.strictEqual(renderCount, 1);
      assert.strictEqual(div.textContent?.trim(), "");

      // 0 renders "0"
      phase.value = 1;
      assert.strictEqual(renderCount, 2);
      assert.ok(div.textContent?.includes("0"));

      // "" renders empty text node
      phase.value = 2;
      assert.strictEqual(renderCount, 3);

      dispose();
    });

    it("should handle component returning an array", () => {
      let renderCount = 0;
      const List = memo((props: { x: number }) => {
        renderCount++;
        void props;
        return [
          html`<span class="item">A</span>`,
          html`<span class="item">B</span>`,
        ];
      });

      const { fragment, dispose } = html`
        <div>${List({ x: 1 })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);
      const items = document.querySelectorAll(".item");
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0]?.textContent, "A");
      assert.strictEqual(items[1]?.textContent, "B");

      dispose();
    });
  });

  describe("custom comparator edge cases", () => {
    it("should never re-render when comparator always returns true", () => {
      let renderCount = 0;
      const Comp = memo(
        ({ count }: { count: number }) => {
          renderCount++;
          return html`<span>${count}</span>`;
        },
        () => true,
      );

      const count = signal(0);

      const { fragment, dispose } = html`
        <div>${() => Comp({ count: count.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);
      assert.strictEqual(document.querySelector("span")?.textContent, "0");

      // Change props - comparator says equal, should not re-render
      count.value = 100;
      assert.strictEqual(renderCount, 1);
      // DOM still shows initial value
      assert.strictEqual(document.querySelector("span")?.textContent, "0");

      dispose();
    });

    it("should always re-render when comparator always returns false", () => {
      let renderCount = 0;
      const Comp = memo(
        ({ count }: { count: number }) => {
          renderCount++;
          return html`<span>${count}</span>`;
        },
        () => false,
      );

      const toggle = signal(true);

      const { fragment, dispose } = html`
        <div>${() => (toggle.value, Comp({ count: 42 }))}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);

      // Same props but comparator says not equal - should re-render
      toggle.value = false;
      assert.strictEqual(renderCount, 2);

      toggle.value = true;
      assert.strictEqual(renderCount, 3);

      dispose();
    });

    it("should propagate errors from custom comparator", () => {
      const Comp = memo(
        ({ x }: { x: number }) => {
          return html`<span>${x}</span>`;
        },
        () => {
          throw new Error("comparator error");
        },
      );

      const val = signal(0);

      const { fragment, dispose } = html`
        <div>${() => Comp({ x: val.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      // First render works (comparator not called - no previous props)
      assert.strictEqual(document.querySelector("span")?.textContent, "0");

      // Second evaluation calls comparator which throws
      assert.throws(() => {
        val.value = 1;
      }, /comparator error/);

      dispose();
    });
  });

  describe("composition and multi-slot", () => {
    it("should handle nested memo components", () => {
      let outerRenders = 0;
      let innerRenders = 0;

      const Inner = memo(({ text }: { text: string }) => {
        innerRenders++;
        return html`<span class="inner">${text}</span>`;
      });

      const Outer = memo(
        ({ label, detail }: { label: string; detail: string }) => {
          outerRenders++;
          return html`<div class="outer">
            ${label}: ${Inner({ text: detail })}
          </div>`;
        },
      );

      const label = signal("Title");
      const detail = signal("info");

      const { fragment, dispose } = html`
        <div>${() => Outer({ label: label.value, detail: detail.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(outerRenders, 1);
      assert.strictEqual(innerRenders, 1);
      assert.strictEqual(document.querySelector(".inner")?.textContent, "info");

      // Change detail - both outer and inner re-render (outer props changed)
      detail.value = "updated";
      assert.strictEqual(outerRenders, 2);
      assert.strictEqual(innerRenders, 2);

      // Change label only - outer re-renders, inner props unchanged so
      // inner's memo-level cache returns same descriptor, and renderValue
      // gets the same Template reference. Inner does NOT re-render.
      label.value = "New Title";
      assert.strictEqual(outerRenders, 3);
      // Inner's memo() returns same descriptor (detail didn't change),
      // but since outer re-rendered, a new template is created with new
      // markers. The per-marker cache misses on the fresh marker (no entry),
      // so inner re-renders. This is expected: outer re-render creates new DOM.
      assert.strictEqual(innerRenders, 3);

      dispose();
    });

    it("should handle same component called twice in one reactive slot", () => {
      let renderCount = 0;
      const Label = memo(({ text }: { text: string }) => {
        renderCount++;
        return html`<span class="label">${text}</span>`;
      });

      const textA = signal("A");

      // Same component used twice in a template returned from a reactive function
      const { fragment, dispose } = html`
        <div>
          ${() =>
            html`${Label({ text: textA.value })}${Label({ text: "static" })}`}
        </div>
      `.render();
      document.body.appendChild(fragment);

      // Both instances render
      assert.strictEqual(renderCount, 2);
      const spans = document.querySelectorAll(".label");
      assert.strictEqual(spans.length, 2);
      assert.strictEqual(spans[0]?.textContent, "A");
      assert.strictEqual(spans[1]?.textContent, "static");

      // Changing textA re-evaluates the outer computed, which creates
      // a new template. Both Label calls run again. "static" props
      // match memo-level cache, but since the template is recreated
      // with new markers, the per-marker cache misses and both re-render.
      textA.value = "A2";
      assert.strictEqual(renderCount, 4);

      dispose();
    });

    it("should re-render when callback props change identity", () => {
      let renderCount = 0;
      const Button = memo(({ onClick }: { onClick: () => void }) => {
        renderCount++;
        return html`<button @click=${onClick}>Click</button>`;
      });

      const count = signal(0);

      // Each evaluation creates a new arrow function - Object.is fails.
      // The function reads count.value to create a dependency, then
      // passes a new closure as onClick prop.
      const { fragment, dispose } = html`
        <div>
          ${() => {
            const c = count.value;
            return Button({ onClick: () => console.log(c) });
          }}
        </div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);

      // Trigger re-evaluation - new arrow function means new props identity
      count.value = 1;
      assert.strictEqual(renderCount, 2);

      count.value = 2;
      assert.strictEqual(renderCount, 3);

      dispose();
    });
  });

  describe("batching and lifecycle", () => {
    it("should re-render only once during batch", () => {
      let renderCount = 0;
      const Comp = memo(({ a, b }: { a: number; b: number }) => {
        renderCount++;
        return html`<span>${a + b}</span>`;
      });

      const sigA = signal(0);
      const sigB = signal(0);

      const { fragment, dispose } = html`
        <div>${() => Comp({ a: sigA.value, b: sigB.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);
      assert.strictEqual(document.querySelector("span")?.textContent, "0");

      // Batch: both signals change, but subscriber only fires once
      batch(() => {
        sigA.value = 10;
        sigB.value = 20;
      });

      assert.strictEqual(renderCount, 2);
      assert.strictEqual(document.querySelector("span")?.textContent, "30");

      dispose();
    });

    it("should skip comparison via same object reference fast path", () => {
      let renderCount = 0;
      const Comp = memo(({ data }: { data: { x: number } }) => {
        renderCount++;
        return html`<span>${data.x}</span>`;
      });

      const stableProps = { data: { x: 42 } };
      const toggle = signal(true);

      const { fragment, dispose } = html`
        <div>${() => (toggle.value, Comp(stableProps))}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);

      // Re-trigger computed - same object reference passed to Comp
      // shallowEqual's prev === next fast path returns true immediately
      toggle.value = false;
      assert.strictEqual(renderCount, 1);

      toggle.value = true;
      assert.strictEqual(renderCount, 1);

      dispose();
    });
  });

  describe("error handling", () => {
    it("should propagate component errors and recover on subsequent valid update", () => {
      let renderCount = 0;
      const shouldThrow = signal(false);

      const Comp = memo(({ x }: { x: number }) => {
        renderCount++;
        if (x === 42) throw new Error("component error");
        return html`<span class="comp">${x}</span>`;
      });

      const val = signal(0);

      const { fragment, dispose } = html`
        <div>${() => Comp({ x: shouldThrow.value ? 42 : val.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);
      assert.strictEqual(document.querySelector(".comp")?.textContent, "0");

      // Trigger component throw
      assert.throws(() => {
        shouldThrow.value = true;
      }, /component error/);
      assert.strictEqual(renderCount, 2);

      // With binder-first ordering, clear() doesn't run when binder throws,
      // so old content is preserved rather than leaving an empty slot
      assert.strictEqual(document.querySelector(".comp")?.textContent, "0");

      // Recover: set valid props again — per-marker cache still has the last
      // successful render props ({ x: 0 }), so it's a cache hit and re-render
      // is skipped (old content already shows the correct state)
      shouldThrow.value = false;
      assert.strictEqual(renderCount, 2);

      // Further updates should work normally
      val.value = 5;
      assert.strictEqual(renderCount, 3);
      assert.strictEqual(document.querySelector(".comp")?.textContent, "5");

      dispose();
    });

    it("should not leak DOM nodes when component throws", () => {
      const Comp = memo(({ x }: { x: number }) => {
        if (x < 0) throw new Error("invalid");
        return html`<span class="leak-test">${x}</span>`;
      });

      const val = signal(1);

      const { fragment, dispose } = html`
        <div id="leak-test">${() => Comp({ x: val.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      const container = document.getElementById("leak-test")!;
      assert.strictEqual(container.querySelectorAll(".leak-test").length, 1);

      // Throw — binder-first ordering preserves old content
      assert.throws(() => {
        val.value = -1;
      }, /invalid/);

      // Old content preserved (clear() didn't run because binder threw)
      assert.strictEqual(container.querySelectorAll(".leak-test").length, 1);
      assert.strictEqual(
        container.querySelector(".leak-test")?.textContent,
        "1",
      );

      // Recover — per-marker cache misses ({ x: 1 } vs { x: 2 }), renders fresh
      val.value = 2;
      assert.strictEqual(container.querySelectorAll(".leak-test").length, 1);
      assert.strictEqual(
        container.querySelector(".leak-test")?.textContent,
        "2",
      );

      dispose();
    });
  });

  describe("inner reactive bindings lifecycle", () => {
    it("should dispose inner reactive bindings when memo component re-renders", () => {
      const innerCount = signal(0);
      let renderCount = 0;

      const Comp = memo(({ label }: { label: string }) => {
        renderCount++;
        return html`<span>${label}: ${() => innerCount.value}</span>`;
      });

      const label = signal("v1");

      const { fragment, dispose } = html`
        <div>${() => Comp({ label: label.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);
      assert.ok(document.querySelector("span")?.textContent?.includes("v1: 0"));

      // Inner reactive binding works
      innerCount.value = 1;
      assert.ok(document.querySelector("span")?.textContent?.includes("v1: 1"));

      // Track targets before re-render
      const targetsBefore = innerCount.targets.length;
      assert.ok(targetsBefore >= 1, "innerCount should have at least 1 target");

      // Re-render by changing label props
      label.value = "v2";
      assert.strictEqual(renderCount, 2);
      assert.ok(document.querySelector("span")?.textContent?.includes("v2: 1"));

      // Old computed should be disposed, new one subscribed
      // Target count should stay the same (1 old removed, 1 new added)
      assert.strictEqual(innerCount.targets.length, targetsBefore);

      // Inner reactive binding still works with new template
      innerCount.value = 2;
      assert.ok(document.querySelector("span")?.textContent?.includes("v2: 2"));

      // Full dispose should remove all targets
      dispose();
      assert.strictEqual(innerCount.targets.length, 0);

      // Signal changes after dispose should not affect anything
      innerCount.value = 999;
      assert.strictEqual(renderCount, 2);
    });

    it("should dispose nested effects when memo component re-renders", () => {
      let effectRunCount = 0;

      const Comp = memo(({ label }: { label: string }) => {
        return html`<span>${label}</span>`;
      });

      const label = signal("v1");
      const innerVal = signal(0);

      // Use a separate effect signal to track cleanup
      const { fragment, dispose } = html`
        <div>
          ${() => {
            const l = label.value;
            // The scope() wrapping from wrapFn will auto-dispose this
            // computed on re-evaluation
            const _track = innerVal.value;
            void _track;
            effectRunCount++;
            return Comp({ label: l });
          }}
        </div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(effectRunCount, 1);

      // Trigger re-evaluation via innerVal - same label props, memo skips
      innerVal.value = 1;
      assert.strictEqual(effectRunCount, 2);

      // Trigger re-evaluation via label - different props, memo re-renders
      label.value = "v2";
      assert.strictEqual(effectRunCount, 3);

      dispose();
    });
  });

  describe("rapid updates", () => {
    it("should handle multiple rapid synchronous signal changes without batching", () => {
      let renderCount = 0;
      const Comp = memo(({ x }: { x: number }) => {
        renderCount++;
        return html`<span class="rapid">${x}</span>`;
      });

      const val = signal(0);

      const { fragment, dispose } = html`
        <div>${() => Comp({ x: val.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);

      // Rapid changes without batching - each triggers synchronous update
      val.value = 1;
      val.value = 2;
      val.value = 3;

      // Each change triggers a full update cycle
      assert.strictEqual(renderCount, 4);
      // Final DOM should show the last value
      assert.strictEqual(document.querySelector(".rapid")?.textContent, "3");

      // No leftover DOM nodes
      assert.strictEqual(document.querySelectorAll(".rapid").length, 1);

      dispose();
    });

    it("should not leak DOM nodes during rapid updates", () => {
      const Comp = memo(({ x }: { x: number }) => {
        return html`<span class="node-leak">${x}</span>`;
      });

      const val = signal(0);

      const { fragment, dispose } = html`
        <div id="rapid-container">${() => Comp({ x: val.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      const container = document.getElementById("rapid-container")!;

      // Rapid fire 20 updates
      for (let i = 1; i <= 20; i++) {
        val.value = i;
      }

      // Should only have 1 span, not 20+
      assert.strictEqual(container.querySelectorAll(".node-leak").length, 1);
      assert.strictEqual(
        container.querySelector(".node-leak")?.textContent,
        "20",
      );

      dispose();
    });
  });

  describe("cache isolation across render calls", () => {
    it("should maintain independent behavior across separate render() calls sharing a memo function", () => {
      let renderCount = 0;
      const Label = memo(({ text }: { text: string }) => {
        renderCount++;
        return html`<span class="label">${text}</span>`;
      });

      const textA = signal("A");
      const textB = signal("B");

      // Two separate render() calls using the same memoized component
      const renderA = html`
        <div class="a">${() => Label({ text: textA.value })}</div>
      `.render();
      document.body.appendChild(renderA.fragment);

      const renderB = html`
        <div class="b">${() => Label({ text: textB.value })}</div>
      `.render();
      document.body.appendChild(renderB.fragment);

      assert.strictEqual(renderCount, 2);
      assert.strictEqual(document.querySelector(".a .label")?.textContent, "A");
      assert.strictEqual(document.querySelector(".b .label")?.textContent, "B");

      // Dispose render A - render B should be unaffected
      renderA.dispose();

      // B still works
      textB.value = "B2";
      assert.strictEqual(renderCount, 3);
      assert.strictEqual(
        document.querySelector(".b .label")?.textContent,
        "B2",
      );

      // A's signal changes should have no effect
      textA.value = "A2";
      assert.strictEqual(renderCount, 3);

      renderB.dispose();
    });

    it("should not corrupt cache when same memo function is used across renders with interleaved updates", () => {
      let renderCount = 0;
      const Comp = memo(({ n }: { n: number }) => {
        renderCount++;
        return html`<span class="interleaved">${n}</span>`;
      });

      const valA = signal(1);
      const valB = signal(100);

      const renderA = html`
        <div class="ra">${() => Comp({ n: valA.value })}</div>
      `.render();
      document.body.appendChild(renderA.fragment);

      const renderB = html`
        <div class="rb">${() => Comp({ n: valB.value })}</div>
      `.render();
      document.body.appendChild(renderB.fragment);

      assert.strictEqual(renderCount, 2);

      // Interleaved updates
      valA.value = 2;
      assert.strictEqual(renderCount, 3);
      assert.strictEqual(
        document.querySelector(".ra .interleaved")?.textContent,
        "2",
      );
      assert.strictEqual(
        document.querySelector(".rb .interleaved")?.textContent,
        "100",
      );

      valB.value = 200;
      assert.strictEqual(renderCount, 4);
      assert.strictEqual(
        document.querySelector(".ra .interleaved")?.textContent,
        "2",
      );
      assert.strictEqual(
        document.querySelector(".rb .interleaved")?.textContent,
        "200",
      );

      // Same value as A's last render - signal won't fire since value hasn't changed
      valA.value = 2; // same value, signal won't fire (per-marker cache is a secondary guard)
      assert.strictEqual(renderCount, 4);

      renderA.dispose();
      renderB.dispose();
    });
  });

  describe("memo->non-memo->memo transitions with reactive verification", () => {
    it("should properly clean up and restore signal targets during transitions", () => {
      let memoRenders = 0;
      const Label = memo(({ text }: { text: string }) => {
        memoRenders++;
        return html`<span class="memo-trans">${text}</span>`;
      });

      const useMemo = signal(true);
      const text = signal("hello");

      const { fragment, dispose } = html`
        <div>
          ${() =>
            useMemo.value
              ? Label({ text: text.value })
              : html`<em class="plain-trans">${text.value}</em>`}
        </div>
      `.render();
      document.body.appendChild(fragment);

      // Initial: memo path, text has 1 target (the outer computed)
      assert.strictEqual(memoRenders, 1);
      const initialTargets = text.targets.length;
      assert.ok(initialTargets >= 1);

      // Switch to plain path
      useMemo.value = false;
      assert.strictEqual(document.querySelector(".memo-trans"), null);
      assert.strictEqual(
        document.querySelector(".plain-trans")?.textContent,
        "hello",
      );
      // text still has targets (the outer computed still tracks it)
      assert.strictEqual(text.targets.length, initialTargets);

      // Update text in plain path
      text.value = "updated";
      assert.strictEqual(
        document.querySelector(".plain-trans")?.textContent,
        "updated",
      );
      assert.strictEqual(memoRenders, 1); // memo not called

      // Switch back to memo path
      useMemo.value = true;
      assert.strictEqual(memoRenders, 2);
      assert.strictEqual(
        document.querySelector(".memo-trans")?.textContent,
        "updated",
      );
      assert.strictEqual(document.querySelector(".plain-trans"), null);

      // Verify reactivity works after round-trip
      text.value = "final";
      assert.strictEqual(memoRenders, 3);
      assert.strictEqual(
        document.querySelector(".memo-trans")?.textContent,
        "final",
      );

      dispose();

      // After dispose, no lingering targets
      assert.strictEqual(text.targets.length, 0);
      assert.strictEqual(useMemo.targets.length, 0);
    });
  });

  describe("dispose idempotency", () => {
    it("should handle dispose being called after content was already cleared by an update", () => {
      let renderCount = 0;
      const Comp = memo(({ x }: { x: number }) => {
        renderCount++;
        return html`<span class="idem">${x}</span>`;
      });

      const val = signal(1);

      const { fragment, dispose } = html`
        <div>${() => Comp({ x: val.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);

      // Trigger update - clears old content, renders new
      val.value = 2;
      assert.strictEqual(renderCount, 2);

      // Now dispose - the old pluginCleanup was already consumed by the update,
      // dispose should clean up the current content without errors
      dispose();

      // No leftover spans
      assert.strictEqual(document.querySelectorAll(".idem").length, 0);

      // Signal changes do nothing
      val.value = 3;
      assert.strictEqual(renderCount, 2);
    });

    it("should handle static render dispose cleanly", () => {
      const Comp = memo(({ x }: { x: number }) => {
        return html`<span class="static-disp">${x}</span>`;
      });

      const { fragment, dispose } = html`
        <div id="static-dispose">${Comp({ x: 42 })}</div>
      `.render();
      document.body.appendChild(fragment);

      const container = document.getElementById("static-dispose")!;
      assert.strictEqual(container.querySelectorAll(".static-disp").length, 1);
      assert.strictEqual(
        container.querySelector(".static-disp")?.textContent,
        "42",
      );

      dispose();

      // DOM nodes should be cleaned up by the disposer
      assert.strictEqual(container.querySelectorAll(".static-disp").length, 0);
    });
  });

  describe("memo with each() plugin", () => {
    it("should work inside each() rendered list items", () => {
      let renderCount = 0;
      const ItemComp = memo(({ name }: { name: string }) => {
        renderCount++;
        return html`<span class="each-item">${name}</span>`;
      });

      const items = signal([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);

      const { fragment, dispose } = htmlWithEach`
        <ul>
          ${each(
            items,
            (i) => i.id,
            (itemSignal) =>
              html`<li>${() => ItemComp({ name: itemSignal.value.name })}</li>`,
          )}
        </ul>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 2);
      const spans = document.querySelectorAll(".each-item");
      assert.strictEqual(spans.length, 2);
      assert.strictEqual(spans[0]?.textContent, "Alice");
      assert.strictEqual(spans[1]?.textContent, "Bob");

      // Update one item's name - each() updates both item signals, but
      // per-marker cache detects Bob's props haven't changed for its slot
      items.value = [
        { id: 1, name: "Alice Updated" },
        { id: 2, name: "Bob" },
      ];
      assert.strictEqual(renderCount, 3); // only Alice re-renders (per-marker cache skips Bob)
      const spansAfter = document.querySelectorAll(".each-item");
      assert.strictEqual(spansAfter[0]?.textContent, "Alice Updated");
      assert.strictEqual(spansAfter[1]?.textContent, "Bob");

      // Add an item
      items.value = [
        { id: 1, name: "Alice Updated" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Charlie" },
      ];

      const spansAdded = document.querySelectorAll(".each-item");
      assert.strictEqual(spansAdded.length, 3);
      assert.strictEqual(spansAdded[2]?.textContent, "Charlie");

      // Remove an item
      items.value = [
        { id: 2, name: "Bob" },
        { id: 3, name: "Charlie" },
      ];

      const spansRemoved = document.querySelectorAll(".each-item");
      assert.strictEqual(spansRemoved.length, 2);

      dispose();
    });
  });

  describe("detached DOM", () => {
    it("should handle dispose when parent element was removed from DOM first", () => {
      let renderCount = 0;
      const Comp = memo(({ x }: { x: number }) => {
        renderCount++;
        return html`<span class="detach">${x}</span>`;
      });

      const val = signal(1);

      const { fragment, dispose } = html`
        <div id="detach-parent">${() => Comp({ x: val.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(renderCount, 1);
      assert.ok(document.getElementById("detach-parent"));

      // Remove the parent from DOM before dispose (simulates disconnectedCallback
      // where element is removed from DOM tree)
      document.getElementById("detach-parent")!.remove();

      // dispose() should not throw even though nodes are detached
      assert.doesNotThrow(() => dispose());

      // Signal changes should not trigger re-render
      val.value = 2;
      assert.strictEqual(renderCount, 1);
    });

    it("should handle reactive update after parent detachment", () => {
      let renderCount = 0;
      const Comp = memo(({ x }: { x: number }) => {
        renderCount++;
        return html`<span>${x}</span>`;
      });

      const val = signal(1);

      const wrapper = document.createElement("div");
      const { fragment, dispose } = html`
        <div>${() => Comp({ x: val.value })}</div>
      `.render();
      wrapper.appendChild(fragment);
      document.body.appendChild(wrapper);

      assert.strictEqual(renderCount, 1);

      // Remove wrapper from body (nodes become detached)
      wrapper.remove();

      // Signal change should still work without throwing
      // (the computed still runs, plugin still renders, just into detached tree)
      assert.doesNotThrow(() => {
        val.value = 2;
      });

      dispose();
    });
  });

  describe("deeply nested reactive memo", () => {
    it("should handle reactive memo inside reactive memo template", () => {
      let outerRenders = 0;
      let innerRenders = 0;

      const Inner = memo(({ count }: { count: number }) => {
        innerRenders++;
        return html`<span class="deep-inner">${count}</span>`;
      });

      const Outer = memo(({ label }: { label: string }) => {
        outerRenders++;
        // Inner is used inside a reactive binding within Outer's template
        return html`<div class="deep-outer">
          ${label}: ${() => Inner({ count: innerCount.value })}
        </div>`;
      });

      const innerCount = signal(0);
      const label = signal("Outer");

      const { fragment, dispose } = html`
        <div>${() => Outer({ label: label.value })}</div>
      `.render();
      document.body.appendChild(fragment);

      assert.strictEqual(outerRenders, 1);
      assert.strictEqual(innerRenders, 1);
      assert.strictEqual(
        document.querySelector(".deep-inner")?.textContent,
        "0",
      );

      // Changing innerCount should only re-render Inner (via its reactive binding),
      // NOT Outer (Outer's props haven't changed)
      innerCount.value = 5;
      assert.strictEqual(outerRenders, 1);
      assert.strictEqual(innerRenders, 2);
      assert.strictEqual(
        document.querySelector(".deep-inner")?.textContent,
        "5",
      );

      // Changing Outer's label re-renders Outer, which creates a new template
      // with a new reactive binding for Inner. The old Inner computed is disposed.
      label.value = "Changed";
      assert.strictEqual(outerRenders, 2);
      // Inner re-renders because it's in a fresh template with new markers
      assert.strictEqual(innerRenders, 3);

      // Inner reactive binding still works after Outer re-render
      innerCount.value = 10;
      assert.strictEqual(outerRenders, 2);
      assert.strictEqual(innerRenders, 4);
      assert.strictEqual(
        document.querySelector(".deep-inner")?.textContent,
        "10",
      );

      // After dispose, innerCount targets should be empty
      dispose();
      assert.strictEqual(innerCount.targets.length, 0);
    });
  });

  describe("rendering without plugin", () => {
    it("should render warning text in DOM when memo is used without plugin", () => {
      const Comp = memo(({ x }: { x: number }) => {
        return html`<span>${x}</span>`;
      });

      // Use baseHtml (no plugin) to render a memo descriptor
      const { fragment, dispose } = baseHtml`
        <div id="no-plugin">${Comp({ x: 42 })}</div>
      `.render();
      document.body.appendChild(fragment);

      const div = document.getElementById("no-plugin")!;
      // The MemoDescriptor's toString() should be rendered as text
      assert.ok(
        div.textContent?.includes("memoPlugin"),
        "Should contain warning about memoPlugin",
      );
      // The actual component should NOT have rendered
      assert.strictEqual(div.querySelector("span"), null);

      dispose();
    });
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
