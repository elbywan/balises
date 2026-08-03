import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html, signal } from "../src/index.js";
import { each } from "../src/each.js";
import { when, match } from "../src/match.js";
import { memo } from "../src/memo.js";
import { renderToString, renderToStringAsync } from "../src/ssr.js";
import { hydrate } from "../src/hydrate.js";

/** Render to a string, parse it into a container, hydrate, and
 *  return the container + the node references for identity checks. */
function setup(template: ReturnType<typeof html>, target = document.body) {
  const container = document.createElement("div");
  target.appendChild(container);
  container.innerHTML = renderToString(template);
  const nodes = [...container.querySelectorAll<Element>("*")];
  const dispose = hydrate(template, container);
  return { container, nodes, dispose };
}

describe("hydrate", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should reuse the server markup and react to signal changes", () => {
    const count = signal(0);
    const template = html`<p>Count: ${count}</p>`;
    const { container, nodes, dispose } = setup(template);
    const p = container.querySelector("p")!;
    const text = p.firstChild as Text;

    // The SSR text node is reused - no re-render.
    assert.strictEqual(p.textContent, "Count: 0");
    assert.ok(nodes.includes(p), "element identity preserved");

    // Reactivity works after hydration.
    count.value = 5;
    assert.strictEqual(p.textContent, "Count: 5");
    // The update path replaces only the dynamic part.
    assert.strictEqual(p.childNodes.length, 3);
    assert.strictEqual(text, p.firstChild, "static text node untouched");

    dispose();
  });

  it("should hydrate reactive attributes and update them", () => {
    const cls = signal("active");
    const template = html`<div class="box ${cls}"></div>`;
    const { container, dispose } = setup(template);
    const div = container.querySelector("div")!;
    assert.strictEqual(div.getAttribute("class"), "box active");

    cls.value = "inactive";
    assert.strictEqual(div.getAttribute("class"), "box inactive");
    dispose();
  });

  it("should attach event listeners that render nothing on the server", () => {
    let clicks = 0;
    const template = html`<button @click=${() => clicks++}>x</button>`;
    const { container, dispose } = setup(template);
    const button = container.querySelector("button")!;
    button.click();
    assert.strictEqual(clicks, 1);
    dispose();
  });

  it("should set properties that render nothing on the server", () => {
    const value = signal("hello");
    const template = html`<input .value=${value} />`;
    const { container, dispose } = setup(template);
    const input = container.querySelector("input")! as HTMLInputElement;
    assert.strictEqual(input.value, "hello");
    value.value = "world";
    assert.strictEqual(input.value, "world");
    dispose();
  });

  it("should hydrate nested templates", () => {
    const x = signal(1);
    const template = html`<div>${html`<span>${x}</span>`}</div>`;
    const { container, dispose } = setup(template);
    const span = container.querySelector("span")!;
    assert.strictEqual(span.textContent, "1");
    x.value = 2;
    assert.strictEqual(span.textContent, "2");
    dispose();
  });

  it("should hydrate each() rows preserving node identity", () => {
    const items = signal([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    const template = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (s) => html`<li>${() => s.value.name}</li>`,
      )}
    </ul>`;
    const { container, nodes, dispose } = setup(template);
    const lis = container.querySelectorAll("li");
    assert.strictEqual(lis.length, 2);
    assert.strictEqual(lis[0]!.textContent, "a");
    assert.ok(nodes.includes(lis[0]!), "row identity preserved");

    // In-place label updates preserve the row elements.
    items.value = [
      { id: 1, name: "A" },
      { id: 2, name: "b" },
    ];
    const lisAfter = container.querySelectorAll("li");
    assert.strictEqual(lisAfter[0]!, lis[0]!, "row DOM reused on update");
    assert.strictEqual(lisAfter[0]!.textContent, "A");

    // Appending creates new rows; the existing ones stay.
    items.value = [
      { id: 1, name: "A" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ];
    const lisAppended = container.querySelectorAll("li");
    assert.strictEqual(lisAppended.length, 3);
    assert.strictEqual(lisAppended[0]!, lis[0]!);
    assert.strictEqual(lisAppended[2]!.textContent, "c");

    // Removal disposes the row's bindings.
    items.value = [{ id: 2, name: "b" }];
    assert.strictEqual(container.querySelectorAll("li").length, 1);
    dispose();
  });

  it("should hydrate when() and match() branches", () => {
    const show = signal(true);
    const template = html`<div>
      ${when(
        () => show.value,
        [
          () => html`<span class="yes">A</span>`,
          () => html`<span class="no">B</span>`,
        ],
      )}
    </div>`;
    const { container, dispose } = setup(template);
    assert.strictEqual(container.querySelector(".yes")?.textContent, "A");

    show.value = false;
    assert.strictEqual(container.querySelector(".no")?.textContent, "B");
    assert.strictEqual(container.querySelector(".yes"), null);
    dispose();

    const mode = signal<"a" | "b">("a");
    const tmpl2 = html`<div>
      ${match(() => mode.value, {
        a: () => html`<span class="ma">A</span>`,
        b: () => html`<span class="mb">B</span>`,
      })}
    </div>`;
    const c2 = document.createElement("div");
    document.body.appendChild(c2);
    c2.innerHTML = renderToString(tmpl2);
    const maBefore = c2.querySelector(".ma")!;
    const dispose2 = hydrate(tmpl2, c2);
    assert.strictEqual(c2.querySelector(".ma"), maBefore, "branch adopted");
    assert.strictEqual(c2.querySelector(".ma")?.textContent, "A");
    mode.value = "b";
    assert.strictEqual(c2.querySelector(".mb")?.textContent, "B");
    assert.strictEqual(c2.querySelector(".ma"), null);
    dispose2();
    c2.remove();
  });

  it("should hydrate memoized components", () => {
    const Card = memo(({ name }: { name: string }) => html`<b>${name}</b>`);
    const name = signal("x");
    const template = html`<div>${() => Card({ name: name.value })}</div>`;
    const { container, dispose } = setup(template);
    assert.strictEqual(container.querySelector("b")?.textContent, "x");
    name.value = "y";
    assert.strictEqual(container.querySelector("b")?.textContent, "y");
    dispose();
  });

  it("should dispose all subscriptions", () => {
    const count = signal(0);
    const template = html`<p>${count}</p>`;
    const { container, dispose } = setup(template);
    assert.strictEqual(container.querySelector("p")?.textContent, "0");
    dispose();
    // Dispose removes the bound content (matching the client render path)
    // and stops reacting to signal changes.
    assert.strictEqual(container.querySelector("p")?.textContent, "");
    count.value = 99;
    assert.strictEqual(container.querySelector("p")?.textContent, "");
  });
});

describe("hydrate with renderToStringAsync", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should adopt the settled async content and react to signal changes", async () => {
    const userId = signal(1);
    const template = html`<div>
      ${async function* (settled?: unknown) {
        const id = userId.value;
        if (settled) return settled;
        yield html`<span>loading</span>`;
        return html`<span class="user">User ${id}</span>`;
      }}
    </div>`;

    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = await renderToStringAsync(template);
    const span = container.querySelector("span")!;
    const dispose = hydrate(template, container);
    assert.strictEqual(span.textContent, "User 1");
    assert.strictEqual(
      container.querySelector("span"),
      span,
      "settled content reused",
    );

    // Dependency change restarts the generator, which preserves the DOM.
    userId.value = 2;
    await new Promise<void>((r) => setTimeout(r, 10));
    assert.strictEqual(container.querySelector("span"), span);
    assert.strictEqual(
      span.textContent,
      "User 1",
      "preserved (settled) content",
    );

    dispose();
  });

  it("should hydrate reactive bindings inside array items", () => {
    const lang = signal("en");
    const options = ["en", "fr"].map(
      (code) =>
        html`<option value=${code} .selected=${() => lang.value === code}>
          ${code === "en" ? "English" : "Français"}
        </option>`,
    );
    const template = html`<select>
      ${options}
    </select>`;
    const { container, dispose } = setup(template);
    const select = container.querySelector("select") as HTMLSelectElement;
    assert.strictEqual(
      select.querySelector<HTMLOptionElement>('option[value="en"]')?.selected,
      true,
    );
    lang.value = "fr";
    assert.strictEqual(
      select.querySelector<HTMLOptionElement>('option[value="fr"]')?.selected,
      true,
    );
    assert.strictEqual(
      select.querySelector<HTMLOptionElement>('option[value="en"]')?.selected,
      false,
    );
    dispose();
  });

  it("should hydrate reactive bindings inside the settled async content", async () => {
    const count = signal(1);
    const template = html`<div>
      ${async function* (settled?: unknown) {
        if (settled) return settled;
        return html`<p class="card">Count: ${count}</p>`;
      }}
    </div>`;

    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = await renderToStringAsync(template);
    const p = container.querySelector("p")!;
    const dispose = hydrate(template, container);
    // The settled content's binding is live: same node, updated text.
    // Bindings attach in the hydration microtask - wait for it.
    await new Promise<void>((r) => setTimeout(r, 0));
    assert.strictEqual(p.textContent, "Count: 1");
    count.value = 7;
    assert.strictEqual(p.textContent, "Count: 7");
    assert.strictEqual(container.querySelector("p"), p);
    dispose();
  });
});
