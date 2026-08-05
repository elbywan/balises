import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html as baseHtml } from "../src/template.js";
import { mount } from "../src/hmr.js";
import { signal } from "../src/signals/index.js";
import eachPlugin, { each } from "../src/each.js";

const htmlWithEach = baseHtml.with(eachPlugin);

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

  it("should replace even when the re-mounted template is identical", () => {
    const dispose1 = mount(container, baseHtml`<p>same</p>`);
    const p1 = container.querySelector("p");

    // Hot reload re-executes the module: same source, same (empty) values.
    const dispose2 = mount(container, baseHtml`<p>same</p>`);
    const p2 = container.querySelector("p");

    assert.notStrictEqual(p2, p1);
    assert.strictEqual(p2?.textContent, "same");
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

  it("should replace when values changed, even with identical source", () => {
    // Module-scope signal recreated by the hot reload.
    const oldCount = signal(0);
    mount(container, baseHtml`<span>${oldCount}</span>`);
    const span1 = container.querySelector("span");

    const newCount = signal(1);
    mount(container, baseHtml`<span>${newCount}</span>`);
    const span2 = container.querySelector("span");

    assert.notStrictEqual(span2, span1);
    assert.strictEqual(span2?.textContent, "1");

    // Old subscriptions are disposed: mutating the old signal is inert.
    oldCount.value = 99;
    assert.strictEqual(span2?.textContent, "1");
    newCount.value = 2;
    assert.strictEqual(span2?.textContent, "2");
  });

  it("should not keep stale event handlers after a hot reload", () => {
    // State hoisted to a non-hot module: same signal instance across reloads.
    const count = signal(0);

    mount(
      container,
      baseHtml`<button @click=${() => (count.value += 1)}>${count}</button>`,
    );
    // Handler changed in the hot module: values differ → must re-render.
    mount(
      container,
      baseHtml`<button @click=${() => (count.value += 10)}>${count}</button>`,
    );

    container.querySelector("button")!.click();
    assert.strictEqual(count.value, 10);
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

  it("should work with plugin templates (each)", () => {
    const items = signal(["a", "b"]);
    const render = (list: typeof items) =>
      htmlWithEach`<ul>${each(
        list,
        (i) => i,
        (item) => baseHtml`<li>${item}</li>`,
      )}</ul>`;

    mount(container, render(items));
    assert.strictEqual(container.querySelectorAll("li").length, 2);

    // Hot reload: new list signal instance → re-render.
    const items2 = signal(["x"]);
    mount(container, render(items2));
    const lis = container.querySelectorAll("li");
    assert.strictEqual(lis.length, 1);
    assert.strictEqual(lis[0]!.textContent, "x");

    // Old each() subscriptions are disposed.
    items.value = ["z", "w"];
    assert.strictEqual(container.querySelectorAll("li").length, 1);
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
