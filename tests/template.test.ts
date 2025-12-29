import { describe, it } from "node:test";
import assert from "node:assert";
import { html, Template, each } from "../src/template.js";
import { Signal, signal, store } from "../src/signals/index.js";

describe("html template tag", () => {
  it("should create a Template instance", () => {
    const template = html`<div>Hello</div>`;
    assert.ok(template instanceof Template);
  });
});

describe("Template.render()", () => {
  describe("static content", () => {
    it("should render simple text", () => {
      const { fragment } = html`Hello World`.render();
      assert.strictEqual(fragment.textContent, "Hello World");
    });

    it("should render a simple element", () => {
      const { fragment } = html`<div>Hello</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.tagName, "DIV");
      assert.strictEqual(div.textContent, "Hello");
    });

    it("should render nested elements", () => {
      const { fragment } = html`<div><span>Nested</span></div>`.render();
      const div = fragment.firstChild as Element;
      const span = div.firstChild as Element;
      assert.strictEqual(span.tagName, "SPAN");
      assert.strictEqual(span.textContent, "Nested");
    });

    it("should render static attributes", () => {
      const { fragment } = html`<div
        class="container"
        id="main"
      ></div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.getAttribute("class"), "container");
      assert.strictEqual(div.getAttribute("id"), "main");
    });

    it("should render self-closing elements", () => {
      const { fragment } = html`<input type="text" /><br />`.render();
      const input = fragment.firstChild as Element;
      const br = fragment.childNodes[1] as Element;
      assert.strictEqual(input.tagName, "INPUT");
      assert.strictEqual(input.getAttribute("type"), "text");
      assert.strictEqual(br.tagName, "BR");
    });

    it("should render boolean attributes", () => {
      const { fragment } = html`<input disabled />`.render();
      const input = fragment.firstChild as Element;
      assert.strictEqual(input.hasAttribute("disabled"), true);
    });
  });

  describe("interpolation - text content", () => {
    it("should render interpolated text", () => {
      const name = "World";
      const { fragment } = html`<div>Hello ${name}</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.textContent, "Hello World");
    });

    it("should render interpolated numbers", () => {
      const count = 42;
      const { fragment } = html`<div>Count: ${count}</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.textContent, "Count: 42");
    });

    it("should not render null or undefined", () => {
      const { fragment } = html`<div>${null}${undefined}</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.textContent, "");
    });

    it("should not render booleans", () => {
      const { fragment } = html`<div>${true}${false}</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.textContent, "");
    });

    it("should render arrays", () => {
      const items = ["a", "b", "c"];
      const { fragment } = html`<div>${items}</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.textContent, "abc");
    });
  });

  describe("interpolation - nested templates", () => {
    it("should render nested templates", () => {
      const inner = html`<span>Inner</span>`;
      const { fragment } = html`<div>${inner}</div>`.render();
      const div = fragment.firstChild as Element;
      const span = div.querySelector("span");
      assert.ok(span);
      assert.strictEqual(span.textContent, "Inner");
    });

    it("should render array of templates", () => {
      const items = [1, 2, 3].map((n) => html`<li>${n}</li>`);
      const { fragment } = html`<ul>
        ${items}
      </ul>`.render();
      const ul = fragment.firstChild as Element;
      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[0]!.textContent, "1");
      assert.strictEqual(ul.children[1]!.textContent, "2");
      assert.strictEqual(ul.children[2]!.textContent, "3");
    });
  });

  describe("interpolation - attributes", () => {
    it("should render dynamic attributes", () => {
      const className = "active";
      const { fragment } = html`<div class=${className}></div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.getAttribute("class"), "active");
    });

    it("should remove attribute when value is null", () => {
      const { fragment } = html`<div class=${null}></div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.hasAttribute("class"), false);
    });

    it("should remove attribute when value is false", () => {
      const { fragment } = html`<input disabled=${false} />`.render();
      const input = fragment.firstChild as Element;
      assert.strictEqual(input.hasAttribute("disabled"), false);
    });

    it("should set empty attribute when value is true", () => {
      const { fragment } = html`<input disabled=${true} />`.render();
      const input = fragment.firstChild as Element;
      assert.strictEqual(input.hasAttribute("disabled"), true);
      assert.strictEqual(input.getAttribute("disabled"), "");
    });

    it("should render multi-part attribute values", () => {
      const width = 50;
      const color = "red";
      const { fragment } = html`<div
        style="width: ${width}%; background: ${color}"
      ></div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(
        div.getAttribute("style"),
        "width: 50%; background: red",
      );
    });

    it("should update multi-part attribute values reactively", () => {
      const width = new Signal(50);
      const color = new Signal("red");
      const { fragment } = html`<div
        style="width: ${width}%; background: ${color}"
      ></div>`.render();

      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;
      assert.strictEqual(
        div.getAttribute("style"),
        "width: 50%; background: red",
      );

      width.value = 75;
      assert.strictEqual(
        div.getAttribute("style"),
        "width: 75%; background: red",
      );

      color.value = "blue";
      assert.strictEqual(
        div.getAttribute("style"),
        "width: 75%; background: blue",
      );

      div.remove();
    });

    it("should handle mixed static and dynamic parts in attributes", () => {
      const name = "world";
      const { fragment } = html`<div
        data-greeting="hello-${name}-suffix"
      ></div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(
        div.getAttribute("data-greeting"),
        "hello-world-suffix",
      );
    });
  });

  describe("interpolation - property bindings", () => {
    it("should set properties with . prefix", () => {
      const value = "test value";
      const { fragment } = html`<input .value=${value} />`.render();
      const input = fragment.firstChild as HTMLInputElement;
      assert.strictEqual(input.value, "test value");
    });
  });

  describe("interpolation - event bindings", () => {
    it("should bind events with @ prefix", () => {
      let clicked = false;
      const handleClick = () => {
        clicked = true;
      };
      const { fragment } = html`<button @click=${handleClick}>
        Click
      </button>`.render();
      const button = fragment.firstChild as HTMLButtonElement;
      button.click();
      assert.strictEqual(clicked, true);
    });

    it("should remove event listener on dispose", () => {
      let clickCount = 0;
      const handleClick = () => {
        clickCount++;
      };
      const { fragment, dispose } = html`<button @click=${handleClick}>
        Click
      </button>`.render();
      const button = fragment.firstChild as HTMLButtonElement;
      button.click();
      assert.strictEqual(clickCount, 1);
      dispose();
      button.click();
      assert.strictEqual(clickCount, 1);
    });
  });

  describe("reactive bindings", () => {
    it("should update text content when signal changes", () => {
      const count = new Signal(0);
      const { fragment } = html`<div>${count}</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.textContent, "0");
      count.value = 5;
      assert.strictEqual(div.textContent, "5");
    });

    it("should update attributes when signal changes", () => {
      const className = new Signal("inactive");
      const { fragment } = html`<div class=${className}></div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.getAttribute("class"), "inactive");
      className.value = "active";
      assert.strictEqual(div.getAttribute("class"), "active");
    });

    it("should update properties when signal changes", () => {
      const value = new Signal("initial");
      const { fragment } = html`<input .value=${value} />`.render();
      const input = fragment.firstChild as HTMLInputElement;
      assert.strictEqual(input.value, "initial");
      value.value = "updated";
      assert.strictEqual(input.value, "updated");
    });

    it("should stop updating after dispose", () => {
      const count = new Signal(0);
      const { fragment, dispose } = html`<div>Count: ${count}</div>`.render();

      // Append to document so we can query it
      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;
      assert.ok(div.textContent!.includes("0"));

      count.value = 5;
      assert.ok(div.textContent!.includes("5"));

      // Dispose removes the dynamic nodes and unsubscribes
      dispose();

      // The dynamic text node is removed, so only static text remains
      assert.strictEqual(div.textContent, "Count: ");

      // Future updates do nothing (no error, just no-op)
      count.value = 10;
      assert.strictEqual(div.textContent, "Count: ");

      // Cleanup
      div.remove();
    });
  });

  describe("dispose", () => {
    it("should clean up nested template disposers", () => {
      const innerCount = new Signal(0);
      const inner = html`<span>Value: ${innerCount}</span>`;
      const { fragment, dispose } = html`<div>${inner}</div>`.render();

      // Append to document so we can query it
      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;
      const span = div.querySelector("span")!;
      assert.ok(span.textContent!.includes("0"));

      // Verify reactivity works before dispose
      innerCount.value = 5;
      assert.ok(span.textContent!.includes("5"));

      // Dispose outer template - this removes the nested template's content too
      dispose();

      // The dynamic content is cleared
      assert.strictEqual(span.textContent, "Value: ");

      // Future updates do nothing
      innerCount.value = 10;
      assert.strictEqual(span.textContent, "Value: ");

      // Cleanup
      div.remove();
    });
  });

  describe("each() - keyed list rendering", () => {
    it("should render a list of items", () => {
      const items = signal([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      const ul = fragment.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0]!.textContent, "Alice");
      assert.strictEqual(ul.children[1]!.textContent, "Bob");
    });

    it("should append new items efficiently", () => {
      const items = signal([{ id: 1, name: "Alice" }]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const firstLi = ul.children[0]!;
      assert.strictEqual(ul.children.length, 1);

      // Append a new item
      items.value = [...items.value, { id: 2, name: "Bob" }];

      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0], firstLi); // Same node reused
      assert.strictEqual(ul.children[1]!.textContent, "Bob");

      ul.remove();
    });

    it("should remove items efficiently", () => {
      const items = signal([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Carol" },
      ]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const firstLi = ul.children[0]!;
      const thirdLi = ul.children[2]!;

      // Remove middle item
      items.value = items.value.filter((i) => i.id !== 2);

      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0], firstLi); // Same node reused
      assert.strictEqual(ul.children[1], thirdLi); // Same node reused

      ul.remove();
    });

    it("should reorder items", () => {
      const items = signal([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Carol" },
      ]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const originalNodes = [...ul.children];

      // Reverse order
      items.value = [...items.value].reverse();

      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[0], originalNodes[2]); // Carol now first
      assert.strictEqual(ul.children[1], originalNodes[1]); // Bob still middle
      assert.strictEqual(ul.children[2], originalNodes[0]); // Alice now last

      ul.remove();
    });

    it("should handle nested signals for content updates", () => {
      const items = signal([
        { id: 1, name: signal("Alice") },
        { id: 2, name: signal("Bob") },
      ]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const firstLi = ul.children[0]!;

      assert.strictEqual(firstLi.textContent, "Alice");

      // Update content via nested signal - no list reconciliation
      items.value[0]!.name.value = "Alicia";

      assert.strictEqual(ul.children[0], firstLi); // Same node
      assert.strictEqual(firstLi.textContent, "Alicia");

      ul.remove();
    });

    it("should dispose properly", () => {
      const items = signal([{ id: 1, name: signal("Alice") }]);

      const { fragment, dispose } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const li = ul.children[0]!;

      assert.strictEqual(li.textContent, "Alice");

      // Update works before dispose
      items.value[0]!.name.value = "Alicia";
      assert.strictEqual(li.textContent, "Alicia");

      dispose();

      // List nodes are removed
      assert.strictEqual(ul.children.length, 0);

      ul.remove();
    });

    it("should handle empty list", () => {
      const items = signal<{ id: number; name: string }[]>([]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      const ul = fragment.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 0);
    });

    it("should handle clearing the list", () => {
      const items = signal([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 2);

      items.value = [];
      assert.strictEqual(ul.children.length, 0);

      ul.remove();
    });
  });

  describe("each() - object reference keys (two-arg form)", () => {
    it("should render a list using object reference as key", () => {
      const alice = { name: "Alice" };
      const bob = { name: "Bob" };
      const carol = { name: "Carol" };
      const items = signal([alice, bob, carol]);

      const { fragment } = html`<ul>
        ${each(items, (item) => html`<li>${item.name}</li>`)}
      </ul>`.render();

      const ul = fragment.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[0]!.textContent, "Alice");
      assert.strictEqual(ul.children[1]!.textContent, "Bob");
      assert.strictEqual(ul.children[2]!.textContent, "Carol");
    });

    it("should append items efficiently", () => {
      const alice = { name: "Alice" };
      const bob = { name: "Bob" };
      const items = signal([alice]);

      const { fragment } = html`<ul>
        ${each(items, (item) => html`<li>${item.name}</li>`)}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const firstLi = ul.children[0]!;
      assert.strictEqual(ul.children.length, 1);

      // Append - same object reference, node is reused
      items.value = [...items.value, bob];

      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0], firstLi); // Same node reused
      assert.strictEqual(ul.children[1]!.textContent, "Bob");

      ul.remove();
    });

    it("should handle prepend correctly with object reference keys", () => {
      const alice = { name: "Alice" };
      const bob = { name: "Bob" };
      const carol = { name: "Carol" };
      const items = signal([bob, carol]);

      const { fragment } = html`<ul>
        ${each(items, (item) => html`<li>${item.name}</li>`)}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const bobNode = ul.children[0]!;
      const carolNode = ul.children[1]!;

      // Prepend - object references are preserved, nodes are reordered
      items.value = [alice, ...items.value];

      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[0]!.textContent, "Alice"); // New node
      assert.strictEqual(ul.children[1], bobNode); // Same node, reordered
      assert.strictEqual(ul.children[2], carolNode); // Same node, reordered

      ul.remove();
    });

    it("should handle reorder correctly", () => {
      const alice = { name: "Alice" };
      const bob = { name: "Bob" };
      const carol = { name: "Carol" };
      const items = signal([alice, bob, carol]);

      const { fragment } = html`<ul>
        ${each(items, (item) => html`<li>${item.name}</li>`)}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const originalNodes = [...ul.children];

      // Reverse order - same objects, nodes are reordered
      items.value = [carol, bob, alice];

      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[0], originalNodes[2]); // Carol's node
      assert.strictEqual(ul.children[1], originalNodes[1]); // Bob's node
      assert.strictEqual(ul.children[2], originalNodes[0]); // Alice's node

      ul.remove();
    });

    it("should rebuild when object is recreated", () => {
      const alice = { name: "Alice" };
      const items = signal([alice]);

      const { fragment } = html`<ul>
        ${each(items, (item) => html`<li>${item.name}</li>`)}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const originalNode = ul.children[0]!;

      // Recreate object - different reference, node is rebuilt
      items.value = [{ name: "Alice" }];

      assert.strictEqual(ul.children.length, 1);
      assert.notStrictEqual(ul.children[0], originalNode); // Different node
      assert.strictEqual(ul.children[0]!.textContent, "Alice");

      ul.remove();
    });

    it("should work with nested signals", () => {
      const alice = { name: signal("Alice") };
      const bob = { name: signal("Bob") };
      const items = signal([alice, bob]);

      const { fragment } = html`<ul>
        ${each(items, (item) => html`<li>${item.name}</li>`)}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const firstLi = ul.children[0]!;

      assert.strictEqual(firstLi.textContent, "Alice");

      // Update via nested signal - no list reconciliation
      alice.name.value = "Alicia";

      assert.strictEqual(ul.children[0], firstLi); // Same node
      assert.strictEqual(firstLi.textContent, "Alicia");

      ul.remove();
    });

    it("should handle empty list", () => {
      const items = signal<{ name: string }[]>([]);

      const { fragment } = html`<ul>
        ${each(items, (item) => html`<li>${item.name}</li>`)}
      </ul>`.render();

      const ul = fragment.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 0);
    });

    it("should use index-based keys for primitives", () => {
      const items = signal(["Alice", "Bob", "Carol"]);

      const { fragment } = html`<ul>
        ${each(items, (name) => html`<li>${name}</li>`)}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[0]!.textContent, "Alice");
      assert.strictEqual(ul.children[1]!.textContent, "Bob");
      assert.strictEqual(ul.children[2]!.textContent, "Carol");

      // Append works
      items.value = [...items.value, "Dave"];
      assert.strictEqual(ul.children.length, 4);
      assert.strictEqual(ul.children[3]!.textContent, "Dave");

      ul.remove();
    });

    it("should handle duplicate primitives without warning (index-based)", () => {
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnings.push(msg);

      try {
        // Same primitive used twice - uses index, so no duplicates
        const items = signal(["Alice", "Alice", "Bob"]);

        const { fragment } = html`<ul>
          ${each(items, (name) => html`<li>${name}</li>`)}
        </ul>`.render();

        const ul = fragment.querySelector("ul")!;
        // All 3 items rendered (index-based keys: 0, 1, 2)
        assert.strictEqual(ul.children.length, 3);
        assert.strictEqual(ul.children[0]!.textContent, "Alice");
        assert.strictEqual(ul.children[1]!.textContent, "Alice");
        assert.strictEqual(ul.children[2]!.textContent, "Bob");
        // No warning
        assert.strictEqual(warnings.length, 0);
      } finally {
        console.warn = originalWarn;
      }
    });

    it("should warn on duplicate object references", () => {
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnings.push(msg);

      try {
        const alice = { name: "Alice" };
        // Same object reference used twice
        const items = signal([alice, alice, { name: "Bob" }]);

        const { fragment } = html`<ul>
          ${each(items, (item) => html`<li>${item.name}</li>`)}
        </ul>`.render();

        const ul = fragment.querySelector("ul")!;
        // Only 2 items rendered (duplicate skipped)
        assert.strictEqual(ul.children.length, 2);
        assert.strictEqual(ul.children[0]!.textContent, "Alice");
        assert.strictEqual(ul.children[1]!.textContent, "Bob");
        // Warning was issued
        assert.strictEqual(warnings.length, 1);
        assert.ok(warnings[0]!.includes("Duplicate key"));
      } finally {
        console.warn = originalWarn;
      }
    });

    it("should accept plain arrays (static)", () => {
      const items = ["Alice", "Bob", "Carol"];

      const { fragment } = html`<ul>
        ${each(items, (name) => html`<li>${name}</li>`)}
      </ul>`.render();

      const ul = fragment.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[0]!.textContent, "Alice");
      assert.strictEqual(ul.children[1]!.textContent, "Bob");
      assert.strictEqual(ul.children[2]!.textContent, "Carol");
    });

    it("should accept plain arrays with keyFn", () => {
      const items = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (item) => html`<li>${item.name}</li>`,
        )}
      </ul>`.render();

      const ul = fragment.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0]!.textContent, "Alice");
      assert.strictEqual(ul.children[1]!.textContent, "Bob");
    });

    it("should accept getter functions for reactive store access", () => {
      const state = store({ items: [{ name: "Alice" }, { name: "Bob" }] });

      const { fragment } = html`<ul>
        ${each(
          () => state.items,
          (item) => html`<li>${item.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0]!.textContent, "Alice");

      // Update store - should react
      state.items = [...state.items, { name: "Carol" }];
      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[2]!.textContent, "Carol");

      ul.remove();
    });

    it("should accept getter functions with keyFn", () => {
      const state = store({
        items: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      });

      const { fragment } = html`<ul>
        ${each(
          () => state.items,
          (i) => i.id,
          (item) => html`<li>${item.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const firstLi = ul.children[0]!;
      assert.strictEqual(ul.children.length, 2);

      // Append - store proxies are not re-wrapped, so nodes are reused
      state.items = [...state.items, { id: 3, name: "Carol" }];
      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[0], firstLi); // Same node reused
      assert.strictEqual(ul.children[2]!.textContent, "Carol");

      ul.remove();
    });
  });
});
