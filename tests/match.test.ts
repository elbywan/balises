import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html as baseHtml } from "../src/template.js";
import matchPlugin, { when, match } from "../src/match.js";
import eachPlugin, { each } from "../src/each.js";
import { signal, store } from "../src/signals/index.js";
import { createGCTracker } from "./gc-utils.js";

const html = baseHtml.with(matchPlugin);
const htmlWithEach = baseHtml.with(matchPlugin).with(eachPlugin);

describe("when()", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should render the truthy branch when condition is true", () => {
    const show = signal(true);
    const { fragment } = html`${when(
      () => show.value,
      [() => html`<div>Visible</div>`, () => html`<div>Hidden</div>`],
    )}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "Visible");
  });

  it("should render the falsy branch when condition is false", () => {
    const show = signal(false);
    const { fragment } = html`${when(
      () => show.value,
      [() => html`<div>Visible</div>`, () => html`<div>Hidden</div>`],
    )}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "Hidden");
  });

  it("should render nothing when condition is false and no falsy branch", () => {
    const show = signal(false);
    const { fragment } = html`<div>
      ${when(() => show.value, [() => html`<span>Visible</span>`])}
    </div>`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent?.trim(), "");

    show.value = true;
    assert.strictEqual(document.body.textContent?.trim(), "Visible");

    show.value = false;
    assert.strictEqual(document.body.textContent?.trim(), "");
  });

  it("should switch branches when condition changes", () => {
    const show = signal(true);
    const { fragment } = html`${when(
      () => show.value,
      [() => html`<div>Visible</div>`, () => html`<div>Hidden</div>`],
    )}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "Visible");

    show.value = false;
    assert.strictEqual(document.body.textContent, "Hidden");

    show.value = true;
    assert.strictEqual(document.body.textContent, "Visible");
  });

  it("should dispose branches on switch by default", () => {
    const show = signal(true);
    let trueBranchCalls = 0;
    let falseBranchCalls = 0;

    const { fragment } = html`${when(
      () => show.value,
      [
        () => {
          trueBranchCalls++;
          return html`<div>True</div>`;
        },
        () => {
          falseBranchCalls++;
          return html`<div>False</div>`;
        },
      ],
    )}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(trueBranchCalls, 1);
    assert.strictEqual(falseBranchCalls, 0);

    // Switch to false - should create false branch
    show.value = false;
    assert.strictEqual(trueBranchCalls, 1);
    assert.strictEqual(falseBranchCalls, 1);

    // Switch back to true - should recreate (not cached by default)
    show.value = true;
    assert.strictEqual(trueBranchCalls, 2);
    assert.strictEqual(falseBranchCalls, 1);

    // Switch to false again - should recreate
    show.value = false;
    assert.strictEqual(trueBranchCalls, 2);
    assert.strictEqual(falseBranchCalls, 2);
  });

  it("should cache branches and reuse DOM nodes with cache: true", () => {
    const show = signal(true);
    let trueBranchCalls = 0;
    let falseBranchCalls = 0;

    const { fragment } = html`${when(
      () => show.value,
      [
        () => {
          trueBranchCalls++;
          return html`<div>True</div>`;
        },
        () => {
          falseBranchCalls++;
          return html`<div>False</div>`;
        },
      ],
      { cache: true },
    )}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(trueBranchCalls, 1);
    assert.strictEqual(falseBranchCalls, 0);

    // Switch to false - should create false branch
    show.value = false;
    assert.strictEqual(trueBranchCalls, 1);
    assert.strictEqual(falseBranchCalls, 1);

    // Switch back to true - should reuse cached true branch (no new call)
    show.value = true;
    assert.strictEqual(trueBranchCalls, 1);
    assert.strictEqual(falseBranchCalls, 1);

    // Switch to false again - should reuse cached false branch
    show.value = false;
    assert.strictEqual(trueBranchCalls, 1);
    assert.strictEqual(falseBranchCalls, 1);
  });

  it("should not recreate branch when condition result stays the same", () => {
    const state = store({ user: { name: "Alice" } as { name: string } | null });
    let branchCalls = 0;

    const { fragment } = html`${when(
      () => !!state.user,
      [
        () => {
          branchCalls++;
          return html`<div>User: ${() => state.user!.name}</div>`;
        },
        () => html`<div>No user</div>`,
      ],
    )}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(branchCalls, 1);
    assert.strictEqual(document.body.textContent, "User: Alice");

    // Change user but keep truthy - should not recreate branch
    state.user = { name: "Bob" };
    assert.strictEqual(branchCalls, 1);
    assert.strictEqual(document.body.textContent, "User: Bob");

    // Change user again - still no recreation
    state.user = { name: "Charlie" };
    assert.strictEqual(branchCalls, 1);
    assert.strictEqual(document.body.textContent, "User: Charlie");
  });

  it("should update internal reactive bindings within cached branch", () => {
    const count = signal(0);
    const show = signal(true);

    const { fragment } = html`${when(
      () => show.value,
      [
        () => html`<span>Count: ${() => count.value}</span>`,
        () => html`<span>Hidden</span>`,
      ],
      { cache: true },
    )}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "Count: 0");

    count.value = 5;
    assert.strictEqual(document.body.textContent, "Count: 5");

    // Switch away and back - internal binding should still work (cached)
    show.value = false;
    assert.strictEqual(document.body.textContent, "Hidden");

    show.value = true;
    assert.strictEqual(document.body.textContent, "Count: 5");

    count.value = 10;
    assert.strictEqual(document.body.textContent, "Count: 10");
  });

  it("should properly dispose branches on cleanup", () => {
    const show = signal(true);
    const { fragment, dispose } = html`${when(
      () => show.value,
      [() => html`<div>True</div>`, () => html`<div>False</div>`],
    )}`.render();

    document.body.appendChild(fragment);

    // Create both branches
    show.value = false;
    show.value = true;

    // Dispose should clean up
    dispose();

    // Changing signal should not throw or cause issues
    show.value = false;
  });
});

describe("match()", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should render matching case", () => {
    const status = signal<"loading" | "success" | "error">("loading");
    const { fragment } = html`${match(() => status.value, {
      loading: () => html`<div>Loading...</div>`,
      success: () => html`<div>Success!</div>`,
      error: () => html`<div>Error!</div>`,
    })}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "Loading...");
  });

  it("should switch between cases", () => {
    const status = signal<"loading" | "success" | "error">("loading");
    const { fragment } = html`${match(() => status.value, {
      loading: () => html`<div>Loading...</div>`,
      success: () => html`<div>Success!</div>`,
      error: () => html`<div>Error!</div>`,
    })}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "Loading...");

    status.value = "success";
    assert.strictEqual(document.body.textContent, "Success!");

    status.value = "error";
    assert.strictEqual(document.body.textContent, "Error!");
  });

  it("should dispose branches on switch by default", () => {
    const status = signal<"a" | "b" | "c">("a");
    const calls: string[] = [];

    const { fragment } = html`${match(() => status.value, {
      a: () => {
        calls.push("a");
        return html`<div>A</div>`;
      },
      b: () => {
        calls.push("b");
        return html`<div>B</div>`;
      },
      c: () => {
        calls.push("c");
        return html`<div>C</div>`;
      },
    })}`.render();

    document.body.appendChild(fragment);
    assert.deepStrictEqual(calls, ["a"]);

    status.value = "b";
    assert.deepStrictEqual(calls, ["a", "b"]);

    status.value = "c";
    assert.deepStrictEqual(calls, ["a", "b", "c"]);

    // Revisit each - should recreate (not cached by default)
    status.value = "a";
    assert.deepStrictEqual(calls, ["a", "b", "c", "a"]);

    status.value = "b";
    assert.deepStrictEqual(calls, ["a", "b", "c", "a", "b"]);
  });

  it("should cache each branch separately with cache: true", () => {
    const status = signal<"a" | "b" | "c">("a");
    const calls: string[] = [];

    const { fragment } = html`${match(
      () => status.value,
      {
        a: () => {
          calls.push("a");
          return html`<div>A</div>`;
        },
        b: () => {
          calls.push("b");
          return html`<div>B</div>`;
        },
        c: () => {
          calls.push("c");
          return html`<div>C</div>`;
        },
      },
      { cache: true },
    )}`.render();

    document.body.appendChild(fragment);
    assert.deepStrictEqual(calls, ["a"]);

    status.value = "b";
    assert.deepStrictEqual(calls, ["a", "b"]);

    status.value = "c";
    assert.deepStrictEqual(calls, ["a", "b", "c"]);

    // Revisit each - no new calls (cached)
    status.value = "a";
    assert.deepStrictEqual(calls, ["a", "b", "c"]);

    status.value = "b";
    assert.deepStrictEqual(calls, ["a", "b", "c"]);

    status.value = "c";
    assert.deepStrictEqual(calls, ["a", "b", "c"]);
  });

  it("should use default _ case when no match", () => {
    const view = signal<string>("home");
    const { fragment } = html`${match(() => view.value, {
      home: () => html`<div>Home</div>`,
      about: () => html`<div>About</div>`,
      _: () => html`<div>Not Found</div>`,
    })}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "Home");

    view.value = "unknown";
    assert.strictEqual(document.body.textContent, "Not Found");

    view.value = "about";
    assert.strictEqual(document.body.textContent, "About");

    view.value = "another-unknown";
    assert.strictEqual(document.body.textContent, "Not Found");
  });

  it("should render nothing when no match and no default", () => {
    const view = signal<string>("home");
    const { fragment } = html`<div>
      ${match(() => view.value, {
        home: () => html`<span>Home</span>`,
      })}
    </div>`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent?.trim(), "Home");

    view.value = "unknown";
    assert.strictEqual(document.body.textContent?.trim(), "");
  });

  it("should work with numeric keys", () => {
    const step = signal(1);
    const { fragment } = html`${match(() => step.value, {
      1: () => html`<div>Step 1</div>`,
      2: () => html`<div>Step 2</div>`,
      3: () => html`<div>Step 3</div>`,
    })}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "Step 1");

    step.value = 2;
    assert.strictEqual(document.body.textContent, "Step 2");

    step.value = 3;
    assert.strictEqual(document.body.textContent, "Step 3");
  });

  it("should update internal reactive bindings", () => {
    const status = signal<"loading" | "data">("loading");
    const items = signal(["a", "b"]);

    const { fragment } = html`${match(() => status.value, {
      loading: () => html`<div>Loading...</div>`,
      data: () => html`<div>Items: ${() => items.value.join(", ")}</div>`,
    })}`.render();

    document.body.appendChild(fragment);
    status.value = "data";
    assert.strictEqual(document.body.textContent, "Items: a, b");

    items.value = ["x", "y", "z"];
    assert.strictEqual(document.body.textContent, "Items: x, y, z");
  });
});

describe("nested when/match", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should work with nested when()", () => {
    const outer = signal(true);
    const inner = signal(true);

    // prettier-ignore
    const { fragment } = html`${when(() => outer.value, [
      () => html`<div>Outer: ${when(() => inner.value, [
        () => html`<span>Inner True</span>`,
        () => html`<span>Inner False</span>`,
      ])}</div>`,
      () => html`<div>Outer False</div>`,
    ])}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "Outer: Inner True");

    inner.value = false;
    assert.strictEqual(document.body.textContent, "Outer: Inner False");

    outer.value = false;
    assert.strictEqual(document.body.textContent, "Outer False");

    outer.value = true;
    // Inner state should be preserved
    assert.strictEqual(document.body.textContent, "Outer: Inner False");
  });

  it("should work with match() nested in when()", () => {
    const show = signal(true);
    const status = signal<"a" | "b">("a");

    const { fragment } = html`${when(
      () => show.value,
      [
        () =>
          html`${match(() => status.value, {
            a: () => html`<div>A</div>`,
            b: () => html`<div>B</div>`,
          })}`,
        () => html`<div>Hidden</div>`,
      ],
    )}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent, "A");

    status.value = "b";
    assert.strictEqual(document.body.textContent, "B");

    show.value = false;
    assert.strictEqual(document.body.textContent, "Hidden");

    show.value = true;
    assert.strictEqual(document.body.textContent, "B");
  });
});

describe("when() is syntactic sugar for match()", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should behave the same as match with true/false keys", () => {
    const cond = signal(true);

    const whenResult = html`${when(
      () => cond.value,
      [() => html`<div>True</div>`, () => html`<div>False</div>`],
    )}`.render();

    const matchResult = html`${match(() => String(cond.value), {
      true: () => html`<div>True</div>`,
      false: () => html`<div>False</div>`,
    })}`.render();

    document.body.appendChild(whenResult.fragment);
    const whenText1 = document.body.textContent;

    document.body.innerHTML = "";
    document.body.appendChild(matchResult.fragment);
    const matchText1 = document.body.textContent;

    assert.strictEqual(whenText1, matchText1);

    whenResult.dispose();
    matchResult.dispose();
  });
});

describe("edge cases", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should handle branches with multiple siblings", () => {
    const show = signal(true);
    const { fragment } = html`<div>
      ${when(
        () => show.value,
        [
          () => html`<span>A</span><span>B</span><span>C</span>`,
          () => html`<span>X</span>`,
        ],
      )}
    </div>`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent?.trim(), "ABC");

    show.value = false;
    assert.strictEqual(document.body.textContent?.trim(), "X");

    show.value = true;
    assert.strictEqual(document.body.textContent?.trim(), "ABC");
  });

  it("should preserve DOM node identity across switches with cache: true", () => {
    const show = signal(true);
    const { fragment } = html`${when(
      () => show.value,
      [
        () => html`<div id="test">Content</div>`,
        () => html`<span>Other</span>`,
      ],
      { cache: true },
    )}`.render();

    document.body.appendChild(fragment);
    const originalDiv = document.getElementById("test");
    assert.ok(originalDiv);

    // Switch away and back
    show.value = false;
    show.value = true;

    // Should be the exact same DOM node (cached)
    const restoredDiv = document.getElementById("test");
    assert.strictEqual(originalDiv, restoredDiv);
  });

  it("should handle text-only branches", () => {
    const show = signal(true);
    const { fragment } = html`<div>
      ${when(() => show.value, [() => html`Hello`, () => html`Goodbye`])}
    </div>`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.body.textContent?.trim(), "Hello");

    show.value = false;
    assert.strictEqual(document.body.textContent?.trim(), "Goodbye");
  });

  it("should handle rapid switching with cache: true", () => {
    const key = signal<"a" | "b" | "c">("a");
    let calls = 0;

    const { fragment } = html`${match(
      () => key.value,
      {
        a: () => {
          calls++;
          return html`<div>A</div>`;
        },
        b: () => {
          calls++;
          return html`<div>B</div>`;
        },
        c: () => {
          calls++;
          return html`<div>C</div>`;
        },
      },
      { cache: true },
    )}`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(calls, 1);

    // Rapid switching
    for (let i = 0; i < 10; i++) {
      key.value = "b";
      key.value = "a";
      key.value = "c";
      key.value = "a";
    }

    // Each branch should only be created once (cached)
    assert.strictEqual(calls, 3);
    assert.strictEqual(document.body.textContent, "A");
  });
});

describe("GC after dispose()", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should GC when() selector computed after dispose", async () => {
    const tracker = createGCTracker();
    // Signal stays alive - key to valid GC test
    const show = signal(true);

    (function scope() {
      const { dispose } = html`${when(
        () => show.value,
        [() => html`<div>True</div>`, () => html`<div>False</div>`],
      )}`.render();

      // The match plugin creates a computed for the selector
      const comp = show.targets[0];
      assert.ok(comp, "computed should be in targets");
      tracker.track(comp, "selectorComputed");
      dispose();
    })();

    await tracker.waitFor("selectorComputed");
    assert.strictEqual(show.targets.length, 0, "targets should be empty");
  });

  it("should GC match() selector computed after dispose", async () => {
    const tracker = createGCTracker();
    const status = signal<"a" | "b" | "c">("a");

    (function scope() {
      const { dispose } = html`${match(() => status.value, {
        a: () => html`<div>A</div>`,
        b: () => html`<div>B</div>`,
        c: () => html`<div>C</div>`,
      })}`.render();

      const comp = status.targets[0];
      assert.ok(comp, "computed should be in targets");
      tracker.track(comp, "selectorComputed");
      dispose();
    })();

    await tracker.waitFor("selectorComputed");
    assert.strictEqual(status.targets.length, 0, "targets should be empty");
  });

  it("should GC branch internal computeds after dispose", async () => {
    const tracker = createGCTracker();
    const show = signal(true);
    const count = signal(0);

    (function scope() {
      const { dispose } = html`${when(
        () => show.value,
        [
          () => html`<div>${() => count.value}</div>`,
          () => html`<div>Hidden</div>`,
        ],
      )}`.render();

      // show.targets has the selector computed
      // count.targets has the branch's internal computed
      const selectorComp = show.targets[0];
      const branchComp = count.targets[0];
      assert.ok(selectorComp, "selector computed should exist");
      assert.ok(branchComp, "branch computed should exist");
      tracker.track(selectorComp, "selectorComputed");
      tracker.track(branchComp, "branchComputed");
      dispose();
    })();

    await tracker.waitForAll(["selectorComputed", "branchComputed"]);
    assert.strictEqual(show.targets.length, 0);
    assert.strictEqual(count.targets.length, 0);
  });

  it("should GC branches immediately on switch by default", async () => {
    const tracker = createGCTracker();
    const key = signal<"a" | "b">("a");
    const valueA = signal("A");
    const valueB = signal("B");

    const { dispose } = html`${match(() => key.value, {
      a: () => html`<div>${() => valueA.value}</div>`,
      b: () => html`<div>${() => valueB.value}</div>`,
    })}`.render();

    // Track compA in IIFE so reference goes out of scope
    (function track() {
      assert.ok(valueA.targets.length >= 1, "valueA should have target");
      tracker.track(valueA.targets[0]!, "compA");
    })();

    // Switch to "b" - creates branch B, disposes branch A (default: no caching)
    key.value = "b";
    assert.ok(valueB.targets.length >= 1, "valueB should have target now");

    // Branch A should be GC'd immediately (disposed on switch)
    await tracker.waitFor("compA");
    assert.strictEqual(
      valueA.targets.length,
      0,
      "valueA should have no targets after switch",
    );

    dispose();
  });

  it("should GC all cached branch computeds after dispose with cache: true", async () => {
    const tracker = createGCTracker();
    const key = signal<"a" | "b">("a");
    const valueA = signal("A");
    const valueB = signal("B");

    (function scope() {
      const { dispose } = html`${match(
        () => key.value,
        {
          a: () => html`<div>${() => valueA.value}</div>`,
          b: () => html`<div>${() => valueB.value}</div>`,
        },
        { cache: true },
      )}`.render();

      // Initially only "a" branch is rendered
      assert.ok(valueA.targets.length >= 1, "valueA should have target");
      assert.strictEqual(
        valueB.targets.length,
        0,
        "valueB should not have target yet",
      );
      tracker.track(valueA.targets[0]!, "compA");

      // Switch to "b" - creates branch B computed
      key.value = "b";
      assert.ok(valueB.targets.length >= 1, "valueB should have target now");
      tracker.track(valueB.targets[0]!, "compB");

      // Switch back to "a" - both branches are cached (with cache: true)
      key.value = "a";
      // compA should still exist because it's cached
      assert.ok(valueA.targets.length >= 1, "valueA should still have target");

      tracker.track(key.targets[0]!, "selectorComp");
      dispose();
    })();

    await tracker.waitForAll(["selectorComp", "compA", "compB"]);
    assert.strictEqual(key.targets.length, 0);
    assert.strictEqual(valueA.targets.length, 0);
    assert.strictEqual(valueB.targets.length, 0);
  });

  it("should GC nested when() computeds after dispose", async () => {
    const tracker = createGCTracker();
    const outer = signal(true);
    const inner = signal(true);
    const text = signal("hello");

    (function scope() {
      // prettier-ignore
      const { dispose } = html`${when(() => outer.value, [
        () => html`<div>${when(() => inner.value, [
          () => html`<span>${() => text.value}</span>`,
          () => html`<span>Inner False</span>`,
        ])}</div>`,
        () => html`<div>Outer False</div>`,
      ])}`.render();

      const outerComp = outer.targets[0];
      const innerComp = inner.targets[0];
      const textComp = text.targets[0];
      assert.ok(outerComp, "outer computed should exist");
      assert.ok(innerComp, "inner computed should exist");
      assert.ok(textComp, "text computed should exist");
      tracker.track(outerComp, "outerComp");
      tracker.track(innerComp, "innerComp");
      tracker.track(textComp, "textComp");
      dispose();
    })();

    await tracker.waitForAll(["outerComp", "innerComp", "textComp"]);
    assert.strictEqual(outer.targets.length, 0);
    assert.strictEqual(inner.targets.length, 0);
    assert.strictEqual(text.targets.length, 0);
  });

  it("should GC branches on switch by default (not cached)", async () => {
    // By default (cache: false), branches are disposed when hidden.
    const tracker = createGCTracker();
    const show = signal(true);
    const status = signal<"a" | "b">("a");
    const value = signal("test");

    const { fragment, dispose } = html`${when(
      () => show.value,
      [
        () =>
          html`${match(() => status.value, {
            a: () => html`<div>${() => value.value}</div>`,
            b: () => html`<div>B</div>`,
          })}`,
        () => html`<div>Hidden</div>`,
      ],
    )}`.render();

    document.body.appendChild(fragment);

    // Track computeds in IIFE so references go out of scope
    (function track() {
      const statusComp = status.targets[0];
      const valueComp = value.targets[0];
      assert.ok(statusComp && valueComp, "computeds should exist");
      tracker.track(statusComp, "statusComp");
      tracker.track(valueComp, "valueComp");
    })();

    // Hide outer - inner match branch is disposed (default behavior)
    show.value = false;

    // Inner computeds should be GC'd
    await tracker.waitForAll(["statusComp", "valueComp"]);
    assert.strictEqual(status.targets.length, 0);
    assert.strictEqual(value.targets.length, 0);

    dispose();
  });

  it("should keep cached branches alive when hidden with cache: true", async () => {
    // With cache: true, branches are kept in memory for fast switching.
    const tracker = createGCTracker();
    const show = signal(true);
    const status = signal<"a" | "b">("a");
    const value = signal("test");

    await (async function scope() {
      const { fragment, dispose } = html`${when(
        () => show.value,
        [
          () =>
            html`${match(
              () => status.value,
              {
                a: () => html`<div>${() => value.value}</div>`,
                b: () => html`<div>B</div>`,
              },
              { cache: true },
            )}`,
          () => html`<div>Hidden</div>`,
        ],
        { cache: true },
      )}`.render();

      document.body.appendChild(fragment);

      const showComp = show.targets[0];
      const statusComp = status.targets[0];
      const valueComp = value.targets[0];
      assert.ok(
        showComp && statusComp && valueComp,
        "all computeds should exist",
      );
      tracker.track(showComp, "showComp");
      tracker.track(statusComp, "statusComp");
      tracker.track(valueComp, "valueComp");

      // Hide outer - inner match branch is cached, NOT disposed
      show.value = false;

      // Inner computeds should still exist (cached)
      assert.strictEqual(
        status.targets.length,
        1,
        "status targets should still exist (cached)",
      );
      assert.strictEqual(
        value.targets.length,
        1,
        "value targets should still exist (cached)",
      );

      // Switch back - should reuse cached branch
      show.value = true;
      assert.strictEqual(
        status.targets[0],
        statusComp,
        "should reuse same computed",
      );

      // Full dispose - now everything should be GC'd
      dispose();
    })();

    await tracker.waitForAll(["showComp", "statusComp", "valueComp"]);
    assert.strictEqual(show.targets.length, 0);
    assert.strictEqual(status.targets.length, 0);
    assert.strictEqual(value.targets.length, 0);
  });

  it("should not leak when rapidly switching branches", async () => {
    const tracker = createGCTracker();
    const key = signal<"a" | "b" | "c">("a");

    (function scope() {
      const { dispose } = html`${match(() => key.value, {
        a: () => html`<div>A</div>`,
        b: () => html`<div>B</div>`,
        c: () => html`<div>C</div>`,
      })}`.render();

      // Rapid switching
      for (let i = 0; i < 50; i++) {
        key.value = "b";
        key.value = "c";
        key.value = "a";
      }

      // Should only have one selector computed
      assert.strictEqual(key.targets.length, 1, "should only have one target");
      tracker.track(key.targets[0]!, "selectorComp");
      dispose();
    })();

    await tracker.waitFor("selectorComp");
    assert.strictEqual(key.targets.length, 0);
  });

  it("should GC after DOM attachment and removal", async () => {
    const tracker = createGCTracker();
    const show = signal(true);
    const text = signal("hello");

    (function scope() {
      const { fragment, dispose } = html`<div id="match-gc-test">
        ${when(
          () => show.value,
          [
            () => html`<span>${() => text.value}</span>`,
            () => html`<span>Hidden</span>`,
          ],
        )}
      </div>`.render();

      document.body.appendChild(fragment);

      const showComp = show.targets[0];
      const textComp = text.targets[0];
      assert.ok(showComp && textComp, "computeds should exist");
      tracker.track(showComp, "showComp");
      tracker.track(textComp, "textComp");

      // Use the template
      show.value = false;
      show.value = true;
      text.value = "world";

      dispose();
      document.getElementById("match-gc-test")!.remove();
    })();

    await tracker.waitForAll(["showComp", "textComp"]);
    assert.strictEqual(show.targets.length, 0);
    assert.strictEqual(text.targets.length, 0);
  });

  it("should unsubscribe signal after dispose", () => {
    const show = signal(true);
    let updateCount = 0;

    const { dispose } = html`${when(
      () => show.value,
      [() => html`<div>True</div>`, () => html`<div>False</div>`],
    )}`.render();

    // Add our own subscriber
    const unsub = show.subscribe(() => updateCount++);

    show.value = false;
    assert.strictEqual(updateCount, 1);

    dispose();

    // After dispose, template subscription is gone but ours remains
    show.value = true;
    assert.strictEqual(updateCount, 2);

    unsub();
  });

  it("should stop reacting to store changes after dispose", () => {
    const state = store({ mode: "a" as "a" | "b" | "c" });
    let renderCount = 0;

    const { dispose } = html`${match(
      () => {
        renderCount++;
        return state.mode;
      },
      {
        a: () => html`<div>A</div>`,
        b: () => html`<div>B</div>`,
        c: () => html`<div>C</div>`,
      },
    )}`.render();

    assert.strictEqual(renderCount, 1);

    state.mode = "b";
    assert.strictEqual(renderCount, 2);

    dispose();

    // After dispose, updates should not trigger re-render
    state.mode = "c";
    state.mode = "a";
    assert.strictEqual(renderCount, 2, "should not re-render after dispose");
  });

  it("should handle each() nested in when() without errors when list updates while hidden", async () => {
    const show = signal(true);
    const items = signal([{ id: 1 }, { id: 2 }]);

    // IMPORTANT: each() is directly inside when() without a wrapper element.
    // This means each()'s marker nodes are direct children of the container div,
    // and when when() caches the branch, those markers get detached from the container.
    // When the list updates while hidden, each() must handle the detached state gracefully.
    const { fragment, dispose } = htmlWithEach`<div>
      ${when(
        () => show.value,
        [
          () =>
            htmlWithEach`${each(
              items,
              (i) => i.id,
              (item) => htmlWithEach`<span>${() => item.value.id}</span>`,
            )}`,
          () => htmlWithEach`<div>Hidden</div>`,
        ],
        { cache: true },
      )}
    </div>`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.querySelectorAll("span").length, 2);

    // Hide branch - each()'s markers are cached and removed from the container
    show.value = false;
    assert.strictEqual(document.querySelectorAll("span").length, 0);
    assert.strictEqual(document.body.textContent?.trim(), "Hidden");

    // Update list while hidden - this would throw before the fix
    // because each() tries to reconcile using detached marker nodes:
    // parent.insertBefore(node, marker) fails when marker is not a child of parent
    assert.doesNotThrow(() => {
      items.value = [{ id: 1 }, { id: 2 }, { id: 3 }];
    });

    // Show branch again
    show.value = true;

    // Wait for microtask to complete (orphaned nodes are inserted via queueMicrotask)
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Should render updated list
    assert.strictEqual(document.querySelectorAll("span").length, 3);

    dispose();
  });

  it("should handle each() nested in when() without cache option", () => {
    const show = signal(true);
    const items = signal([{ id: 1 }, { id: 2 }]);

    const { fragment, dispose } = htmlWithEach`<div>
      ${when(
        () => show.value,
        [
          () =>
            htmlWithEach`<ul>${each(
              items,
              (i) => i.id,
              (item) => htmlWithEach`<li>${() => item.value.id}</li>`,
            )}</ul>`,
          () => htmlWithEach`<div>Hidden</div>`,
        ],
      )}
    </div>`.render();

    document.body.appendChild(fragment);
    assert.strictEqual(document.querySelectorAll("li").length, 2);

    // Hide branch - branch is disposed
    show.value = false;
    assert.strictEqual(document.querySelectorAll("li").length, 0);

    // Update list while hidden - should not throw
    assert.doesNotThrow(() => {
      items.value = [{ id: 1 }, { id: 2 }, { id: 3 }];
    });

    // Show branch again - new branch created with updated list
    show.value = true;
    assert.strictEqual(document.querySelectorAll("li").length, 3);

    dispose();
  });
});
