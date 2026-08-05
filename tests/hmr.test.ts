import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html as baseHtml } from "../src/template.js";
import { mount } from "../src/hmr.js";
import {
  signal,
  computed,
  type Signal,
  type Computed,
} from "../src/signals/index.js";
import eachPlugin, { each } from "../src/each.js";
import memoPlugin, { memo } from "../src/memo.js";

const htmlWithEach = baseHtml.with(eachPlugin);
const htmlWithAll = baseHtml.with(eachPlugin, memoPlugin);

describe("hmr", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("should render a template into the container and stay reactive", () => {
    const text = signal("hello");
    const dispose = mount(container, baseHtml`<p>${text}</p>`);

    assert.strictEqual(container.querySelector("p")?.textContent, "hello");

    text.value = "world";
    assert.strictEqual(container.querySelector("p")?.textContent, "world");

    dispose();
    assert.strictEqual(container.childElementCount, 0);
  });

  it("should dispose subscriptions and remove nodes on unmount", () => {
    const text = signal("a");
    const dispose = mount(container, baseHtml`<p>${text}</p>`);

    dispose();
    text.value = "b";
    assert.strictEqual(container.innerHTML, "");

    // Unmount is idempotent
    dispose();
    assert.strictEqual(container.innerHTML, "");
  });

  it("should re-mount after unmount", () => {
    const dispose1 = mount(container, baseHtml`<p>one</p>`);
    dispose1();
    const dispose = mount(container, baseHtml`<p>two</p>`);
    assert.strictEqual(container.querySelector("p")?.textContent, "two");
    dispose();
  });

  it("should keep the existing DOM when re-mounting an identical template", () => {
    const dispose1 = mount(container, baseHtml`<p>same</p>`);
    const p1 = container.querySelector("p");

    // Hot reload re-executes the module: same source, same (empty) values.
    const dispose2 = mount(container, baseHtml`<p>same</p>`);

    assert.strictEqual(container.querySelector("p"), p1);
    assert.strictEqual(container.childElementCount, 1);
    dispose1();
    dispose2();
  });

  it("should replace in place when the template source changed", () => {
    const dispose1 = mount(container, baseHtml`<p>one</p>`);
    const p1 = container.querySelector("p");

    const dispose2 = mount(container, baseHtml`<p>two</p>`);
    const p2 = container.querySelector("p");

    assert.notStrictEqual(p2, p1);
    assert.strictEqual(p2?.textContent, "two");
    assert.strictEqual(container.childElementCount, 1);
    dispose1();
    dispose2();
  });

  it("should preserve signal state across a hot reload (state wins)", () => {
    let count = signal(0);
    mount(container, baseHtml`<span>${count}</span>`);

    count.value = 7; // user interaction before the reload
    count = signal(0); // module re-executes: fresh instance
    mount(container, baseHtml`<span>${count}</span>`);

    assert.strictEqual(container.querySelector("span")?.textContent, "7");

    // The new instance is live.
    count.value = 8;
    assert.strictEqual(container.querySelector("span")?.textContent, "8");
  });

  it("should chain state across repeated hot reloads", () => {
    let count = signal(1);
    const render = () => baseHtml`<span>${count}</span>`;

    mount(container, render());
    count.value = 2;
    count = signal(0);
    mount(container, render());
    count = signal(0);
    mount(container, render());

    assert.strictEqual(container.querySelector("span")?.textContent, "2");
  });

  it("should keep the same signal instance bound (no-op re-mount)", () => {
    const count = signal(3);
    const render = () => baseHtml`<span>${count}</span>`;

    mount(container, render());
    mount(container, render());

    assert.strictEqual(container.querySelector("span")?.textContent, "3");
    count.value = 4;
    assert.strictEqual(container.querySelector("span")?.textContent, "4");
  });

  it("should not transfer computed values (they recompute)", () => {
    let count = signal(1);
    let doubled = computed(() => count.value * 2);
    mount(container, baseHtml`<span>${doubled}</span>`);

    count.value = 5;
    assert.strictEqual(container.querySelector("span")?.textContent, "10");

    // Hot reload: fresh computed over a fresh signal.
    count = signal(1);
    doubled = computed(() => count.value * 2);
    mount(container, baseHtml`<span>${doubled}</span>`);

    assert.strictEqual(container.querySelector("span")?.textContent, "2");
  });

  it("should re-bind event handlers without replacing the node", () => {
    let n = 0;
    mount(container, baseHtml`<button @click=${() => (n += 1)}>x</button>`);
    const button = container.querySelector("button")!;

    // Handler changed in the hot module: values differ → re-bind in place.
    mount(container, baseHtml`<button @click=${() => (n += 10)}>x</button>`);

    assert.strictEqual(container.querySelector("button"), button);
    button.click();
    assert.strictEqual(n, 10);
  });

  it("should re-bind attributes in place and preserve signal state", () => {
    let cls = signal("a");
    const render = () => baseHtml`<div class=${cls}></div>`;

    mount(container, render());
    const div = container.querySelector("div")!;

    cls.value = "b";
    cls = signal("c"); // hot reload
    mount(container, render());

    assert.strictEqual(container.querySelector("div"), div);
    assert.strictEqual(div.getAttribute("class"), "b");
    cls.value = "d";
    assert.strictEqual(div.getAttribute("class"), "d");
  });

  it("should preserve hoisted child templates (same instance)", () => {
    // Child template from a non-hot component module: same instance.
    const child = baseHtml`<p>child</p>`;
    const render = () => baseHtml`<div>${child}</div>`;

    mount(container, render());
    const p = container.querySelector("p");

    mount(container, render());

    assert.strictEqual(container.querySelector("p"), p);
  });

  it("should recurse into nested templates and preserve their state", () => {
    // Module-scope child component with its own signal.
    let search = signal("abc");
    const render = () =>
      baseHtml`<div>${baseHtml`<input .value=${search}>`}</div>`;

    mount(container, render());
    const input = container.querySelector("input")!;
    assert.strictEqual(input.value, "abc");

    search = signal(""); // hot reload: new child template, new signal
    mount(container, render());

    // Same input node, state preserved through the recursion.
    assert.strictEqual(container.querySelector("input"), input);
    assert.strictEqual(input.value, "abc");
    search.value = "xyz";
    assert.strictEqual(input.value, "xyz");
  });

  it("should replace a nested template whose source changed", () => {
    const render = () =>
      baseHtml`<span id="a">A</span><div>${baseHtml`<p>old</p>`}</div>`;

    mount(container, render());
    const spanA = container.querySelector("#a");
    const p = container.querySelector("p");

    const render2 = () =>
      baseHtml`<span id="a">A</span><div>${baseHtml`<p>new</p>`}</div>`;
    mount(container, render2());

    // Only the nested slot re-rendered; siblings are untouched.
    assert.strictEqual(container.querySelector("#a"), spanA);
    assert.notStrictEqual(container.querySelector("p"), p);
    assert.strictEqual(container.querySelector("p")?.textContent, "new");
  });

  it("should re-render plugin slots in place (each)", () => {
    let items = signal(["a", "b"]);
    const render = (list: Signal<string[]>) =>
      htmlWithEach`<ul>${each(
        list,
        (i) => i,
        (item) => baseHtml`<li>${item}</li>`,
      )}</ul>`;

    mount(container, render(items));
    assert.strictEqual(container.querySelectorAll("li").length, 2);

    // Hot reload: new each descriptor, new list signal → slot re-renders.
    const oldItems = items;
    items = signal(["x"]);
    mount(container, render(items));
    const lis = container.querySelectorAll("li");
    assert.strictEqual(lis.length, 1);
    assert.strictEqual(lis[0]!.textContent, "x");

    // Old each() subscriptions are disposed: mutating the old list is inert.
    oldItems.value = ["z", "w"];
    assert.strictEqual(container.querySelectorAll("li").length, 1);
    // The new each() is live on the new list.
    items.value = ["y"];
    assert.strictEqual(container.querySelectorAll("li").length, 1);
    assert.strictEqual(container.querySelector("li")?.textContent, "y");
  });

  it("should preserve hoisted memoized components", () => {
    let renderCount = 0;
    const Counter = memo(({ x }: { x: number }) => {
      renderCount++;
      return baseHtml`<span>${x}</span>`;
    });
    // Descriptor hoisted in a non-hot module: same instance across reloads.
    const desc = Counter({ x: 1 });
    const render = () => htmlWithAll`<div>${desc}</div>`;

    mount(container, render());
    const span = container.querySelector("span");
    assert.strictEqual(renderCount, 1);

    mount(container, render());

    assert.strictEqual(container.querySelector("span"), span);
    assert.strictEqual(renderCount, 1);
  });

  it("should preserve sibling nodes outside the mounted region", () => {
    container.innerHTML = "<h1>title</h1>";
    const h1 = container.querySelector("h1");

    mount(container, baseHtml`<p>one</p>`);
    mount(container, baseHtml`<p>two</p>`);

    assert.strictEqual(container.querySelector("h1"), h1);
    assert.strictEqual(container.querySelector("p")?.textContent, "two");
    assert.strictEqual(container.childElementCount, 2);
  });

  it("should re-bind multi-slot attributes and preserve signal state", () => {
    let a = signal("a"),
      b = signal("b");
    const render = (x: typeof a, y: typeof b) =>
      baseHtml`<div class="pre ${x} mid ${y} post"></div>`;

    mount(container, render(a, b));
    const div = container.querySelector("div")!;

    // Hot reload: both slots get fresh signal instances, both transferred.
    a = signal("a2");
    b = signal("b2");
    mount(container, render(a, b));

    assert.strictEqual(div.getAttribute("class"), "pre a mid b post");
    // The new instances are live.
    a.value = "zz";
    assert.strictEqual(div.getAttribute("class"), "pre zz mid b post");
    b.value = "q";
    assert.strictEqual(div.getAttribute("class"), "pre zz mid q post");
  });

  it("should transfer a computed's last value into a new signal", () => {
    let c = signal(2);
    let d: Signal<number> | Computed<number> = computed(() => c.value * 10);
    mount(container, baseHtml`<p>${d}</p>`);

    c.value = 5; // d = 50

    // Hot reload: the module switched from a computed to a plain signal.
    c = signal(1);
    d = signal(0);
    mount(container, baseHtml`<p>${d}</p>`);

    assert.strictEqual(container.querySelector("p")?.textContent, "50");
    d.value = 1;
    assert.strictEqual(container.querySelector("p")?.textContent, "1");
  });

  it("should keep containers independent", () => {
    const other = document.createElement("div");
    document.body.appendChild(other);

    mount(container, baseHtml`<p>a</p>`);
    mount(other, baseHtml`<p>b</p>`);
    // Hot reload of one module only re-mounts its own container.
    mount(container, baseHtml`<p>a2</p>`);

    assert.strictEqual(container.querySelector("p")?.textContent, "a2");
    assert.strictEqual(other.querySelector("p")?.textContent, "b");
  });

  it("should recover when the container was cleared externally", () => {
    mount(container, baseHtml`<p>one</p>`);
    container.innerHTML = "";

    mount(container, baseHtml`<p>two</p>`);
    assert.strictEqual(container.querySelector("p")?.textContent, "two");
    assert.strictEqual(container.childElementCount, 1);
  });

  it("should dispose re-bound renders on unmount", () => {
    let count = signal(1);
    const dispose = mount(container, baseHtml`<p>${count}</p>`);

    count = signal(2); // hot reload → state preserved, re-bind in place
    mount(container, baseHtml`<p>${count}</p>`);
    assert.strictEqual(container.querySelector("p")?.textContent, "1");

    // A dispose from any mount call tears down the current registration.
    dispose();
    assert.strictEqual(container.childElementCount, 0);
    count.value = 3;
    assert.strictEqual(container.innerHTML, "");
  });

  it("should handle an empty template", () => {
    const dispose = mount(container, baseHtml``);
    assert.strictEqual(container.childElementCount, 0);

    mount(container, baseHtml``);
    mount(container, baseHtml`<p>x</p>`);
    assert.strictEqual(container.querySelector("p")?.textContent, "x");

    dispose();
    assert.strictEqual(container.childElementCount, 0);
  });
});
