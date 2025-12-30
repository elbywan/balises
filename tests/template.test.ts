import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html, Template, each } from "../src/template.js";
import { signal, store, computed, batch } from "../src/signals/index.js";

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
      const width = signal(50);
      const color = signal("red");
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
      const count = signal(0);
      const { fragment } = html`<div>${count}</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.textContent, "0");
      count.value = 5;
      assert.strictEqual(div.textContent, "5");
    });

    it("should update attributes when signal changes", () => {
      const className = signal("inactive");
      const { fragment } = html`<div class=${className}></div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.getAttribute("class"), "inactive");
      className.value = "active";
      assert.strictEqual(div.getAttribute("class"), "active");
    });

    it("should update properties when signal changes", () => {
      const value = signal("initial");
      const { fragment } = html`<input .value=${value} />`.render();
      const input = fragment.firstChild as HTMLInputElement;
      assert.strictEqual(input.value, "initial");
      value.value = "updated";
      assert.strictEqual(input.value, "updated");
    });

    it("should stop updating after dispose", () => {
      const count = signal(0);
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
      const innerCount = signal(0);
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

    /**
     * Edge case: Multiple dispose calls
     *
     * Calling dispose() multiple times should be safe (no errors).
     */
    it("should handle multiple dispose calls safely", () => {
      const count = signal(0);
      const { fragment, dispose } = html`<div>${count}</div>`.render();

      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      dispose();
      dispose(); // Second call should be safe
      dispose(); // Third call should also be safe

      assert.strictEqual(div.textContent, "");
      div.remove();
    });

    /**
     * Edge case: Dispose with nested each()
     *
     * Disposing a template with each() should clean up all list items.
     */
    it("should clean up each() items on dispose", () => {
      const items = signal([
        { id: 1, name: signal("Alice") },
        { id: 2, name: signal("Bob") },
      ]);

      const { fragment, dispose } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 2);

      // Nested signals should be reactive
      items.value[0]!.name.value = "Alicia";
      assert.strictEqual(ul.children[0]!.textContent, "Alicia");

      dispose();

      // All list items should be removed
      assert.strictEqual(ul.children.length, 0);

      // Updates should have no effect
      items.value[0]!.name.value = "Changed";
      items.value = [...items.value, { id: 3, name: signal("Carol") }];
      assert.strictEqual(ul.children.length, 0);

      ul.remove();
    });
  });

  /**
   * Edge case tests for template rendering
   */
  describe("edge cases", () => {
    /**
     * Edge case: Empty template
     *
     * A template with no content should render an empty fragment.
     */
    it("should render empty template", () => {
      const { fragment } = html``.render();
      assert.strictEqual(fragment.childNodes.length, 0);
    });

    /**
     * Edge case: Whitespace-only template
     *
     * Note: Uses explicit spaces to avoid prettier stripping whitespace from template literal.
     */
    it("should render whitespace-only template", () => {
      const spaces = "   ";
      const { fragment } = html`${spaces}`.render();
      assert.strictEqual(fragment.textContent, "   ");
    });

    /**
     * Edge case: Template with only interpolation
     */
    it("should render template with only interpolation", () => {
      const { fragment } = html`${"hello"}`.render();
      assert.strictEqual(fragment.textContent, "hello");
    });

    /**
     * Edge case: Interpolating 0 (falsy but valid)
     *
     * The number 0 should be rendered, not skipped.
     */
    it("should render 0 as content", () => {
      const { fragment } = html`<div>${0}</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.textContent, "0");
    });

    /**
     * Edge case: Interpolating empty string
     *
     * Empty strings should be rendered (as nothing visible).
     */
    it("should handle empty string interpolation", () => {
      const { fragment } = html`<div>before${""}after</div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.textContent, "beforeafter");
    });

    /**
     * Edge case: Deeply nested templates
     *
     * Multiple levels of template nesting should work correctly.
     */
    it("should render deeply nested templates", () => {
      const level3 = html`<span>deep</span>`;
      const level2 = html`<div>${level3}</div>`;
      const level1 = html`<section>${level2}</section>`;
      const { fragment } = level1.render();

      const section = fragment.firstChild as Element;
      const div = section.querySelector("div")!;
      const span = div.querySelector("span")!;
      assert.strictEqual(span.textContent, "deep");
    });

    /**
     * Edge case: Reactive template switching
     *
     * When a reactive value switches between different templates,
     * the old template should be disposed and new one rendered.
     */
    it("should switch between templates reactively", () => {
      const showA = signal(true);
      const templateA = html`<span>A</span>`;
      const templateB = html`<span>B</span>`;

      const current = computed(() => (showA.value ? templateA : templateB));

      const { fragment } = html`<div>${current}</div>`.render();
      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      assert.strictEqual(div.querySelector("span")!.textContent, "A");

      showA.value = false;
      assert.strictEqual(div.querySelector("span")!.textContent, "B");

      showA.value = true;
      assert.strictEqual(div.querySelector("span")!.textContent, "A");

      div.remove();
    });

    /**
     * Edge case: Conditional rendering with && pattern
     *
     * The pattern `${condition && html`...`}` should work:
     * - When condition is false, nothing is rendered
     * - When condition is true, the template is rendered
     */
    it("should handle conditional && pattern", () => {
      const show = signal(false);
      const { fragment } = html`<div>
        ${() => show.value && html`<span>Shown</span>`}
      </div>`.render();

      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      // Initially hidden (false is not rendered)
      assert.strictEqual(div.querySelector("span"), null);

      // Show it
      show.value = true;
      assert.ok(div.querySelector("span"));
      assert.strictEqual(div.querySelector("span")!.textContent, "Shown");

      // Hide it again
      show.value = false;
      assert.strictEqual(div.querySelector("span"), null);

      div.remove();
    });

    /**
     * Edge case: Attribute with special characters in value
     */
    it("should handle special characters in attribute values", () => {
      const { fragment } = html`<div
        data-json='{"key": "value"}'
      ></div>`.render();
      const div = fragment.firstChild as Element;
      assert.strictEqual(div.getAttribute("data-json"), '{"key": "value"}');
    });

    /**
     * Edge case: Dynamic attribute that becomes null then a value
     */
    it("should handle attribute transitioning null -> value -> null", () => {
      const cls = signal<string | null>(null);
      const { fragment } = html`<div class=${cls}></div>`.render();

      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      assert.strictEqual(div.hasAttribute("class"), false);

      cls.value = "active";
      assert.strictEqual(div.getAttribute("class"), "active");

      cls.value = null;
      assert.strictEqual(div.hasAttribute("class"), false);

      div.remove();
    });

    /**
     * Edge case: Event handler that modifies the DOM
     */
    it("should handle event handlers that modify state", () => {
      const count = signal(0);
      const increment = () => {
        count.value++;
      };

      const { fragment } = html`<div>
        <button @click=${increment}>+</button>
        <span>${count}</span>
      </div>`.render();

      document.body.appendChild(fragment);
      const button = document.body.querySelector("button")!;
      const span = document.body.querySelector("span")!;

      assert.strictEqual(span.textContent, "0");

      button.click();
      assert.strictEqual(span.textContent, "1");

      button.click();
      button.click();
      assert.strictEqual(span.textContent, "3");

      document.body.querySelector("div")!.remove();
    });

    /**
     * Edge case: Property binding with reactive value
     *
     * .prop=${signal} should update the property when signal changes.
     */
    it("should update property bindings reactively", () => {
      const checked = signal(false);
      const { fragment } = html`<input
        type="checkbox"
        .checked=${checked}
      />`.render();

      const input = fragment.firstChild as HTMLInputElement;
      assert.strictEqual(input.checked, false);

      checked.value = true;
      assert.strictEqual(input.checked, true);

      checked.value = false;
      assert.strictEqual(input.checked, false);
    });

    /**
     * Edge case: Multiple event bindings on same element
     */
    it("should handle multiple event bindings", () => {
      let clickCount = 0;
      let mouseOverCount = 0;

      const { fragment, dispose } = html`<button
        @click=${() => clickCount++}
        @mouseover=${() => mouseOverCount++}
      >
        Button
      </button>`.render();

      const button = fragment.firstChild as HTMLButtonElement;

      button.click();
      assert.strictEqual(clickCount, 1);

      button.dispatchEvent(new Event("mouseover"));
      assert.strictEqual(mouseOverCount, 1);

      dispose();

      // After dispose, events should not fire
      button.click();
      button.dispatchEvent(new Event("mouseover"));
      assert.strictEqual(clickCount, 1);
      assert.strictEqual(mouseOverCount, 1);
    });

    /**
     * Edge case: SVG elements
     *
     * Note: The library currently uses document.createElement() which creates
     * SVG elements are now created with proper SVG namespace.
     * This means tagNames are lowercase and attributes like viewBox are preserved correctly.
     */
    it("should render SVG elements with proper namespace", () => {
      const { fragment } = html`<svg
        width="100"
        height="100"
        viewBox="0 0 100 100"
      >
        <circle cx="50" cy="50" r="40" />
      </svg>`.render();

      const svg = fragment.firstChild as Element;
      // tagName is lowercase because createElementNS is used (SVG namespace)
      assert.strictEqual(svg.tagName, "svg");
      assert.strictEqual(svg.getAttribute("width"), "100");
      assert.strictEqual(svg.getAttribute("viewBox"), "0 0 100 100");
      assert.strictEqual(svg.namespaceURI, "http://www.w3.org/2000/svg");

      const circle = svg.querySelector("circle")!;
      assert.strictEqual(circle.tagName, "circle");
      assert.strictEqual(circle.getAttribute("r"), "40");
      assert.strictEqual(circle.namespaceURI, "http://www.w3.org/2000/svg");
    });

    /**
     * Edge case: Array of mixed content types
     *
     * Arrays can contain templates, strings, numbers mixed together.
     */
    it("should render array of mixed content", () => {
      const items = ["text", 42, html`<span>template</span>`, null, undefined];
      const { fragment } = html`<div>${items}</div>`.render();
      const div = fragment.firstChild as Element;

      // Should contain: "text", "42", <span>template</span>
      // null and undefined are skipped
      assert.ok(div.textContent!.includes("text"));
      assert.ok(div.textContent!.includes("42"));
      assert.ok(div.querySelector("span"));
    });

    /**
     * Edge case: Reactive array content
     *
     * When a signal contains an array, updates should re-render.
     */
    it("should update when array signal changes", () => {
      const items = signal(["a", "b"]);
      const { fragment } = html`<div>${items}</div>`.render();

      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      assert.strictEqual(div.textContent, "ab");

      items.value = ["x", "y", "z"];
      assert.strictEqual(div.textContent, "xyz");

      div.remove();
    });

    /**
     * Edge case: Batched updates in template
     *
     * Multiple signal updates in a batch should result in single DOM update.
     */
    it("should handle batched signal updates", () => {
      const firstName = signal("John");
      const lastName = signal("Doe");

      const { fragment } = html`<div>${firstName} ${lastName}</div>`.render();
      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      // Initial render
      assert.ok(div.textContent!.includes("John"));
      assert.ok(div.textContent!.includes("Doe"));

      // Batch update
      batch(() => {
        firstName.value = "Jane";
        lastName.value = "Smith";
      });

      assert.ok(div.textContent!.includes("Jane"));
      assert.ok(div.textContent!.includes("Smith"));

      div.remove();
    });

    /**
     * Edge case: Template with computed that depends on multiple signals
     */
    it("should work with computed values in templates", () => {
      const a = signal(5);
      const b = signal(10);
      const sum = computed(() => a.value + b.value);

      const { fragment } = html`<div>Sum: ${sum}</div>`.render();
      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      assert.strictEqual(div.textContent, "Sum: 15");

      a.value = 20;
      assert.strictEqual(div.textContent, "Sum: 30");

      b.value = 5;
      assert.strictEqual(div.textContent, "Sum: 25");

      div.remove();
    });

    /**
     * Edge case: Self-closing tags with reactive attributes
     */
    it("should handle reactive attributes on self-closing tags", () => {
      const src = signal("img1.png");
      const { fragment } = html`<img .src=${src} />`.render();

      const img = fragment.firstChild as HTMLImageElement;
      assert.strictEqual(img.src.endsWith("img1.png"), true);

      src.value = "img2.png";
      assert.strictEqual(img.src.endsWith("img2.png"), true);
    });

    /**
     * Edge case: Boolean attribute with computed value
     */
    it("should handle computed boolean attributes", () => {
      const enabled = signal(true);
      const disabled = computed(() => !enabled.value);

      const { fragment } = html`<button disabled=${disabled}>
        Click
      </button>`.render();
      const button = fragment.firstChild as HTMLButtonElement;

      assert.strictEqual(button.hasAttribute("disabled"), false);

      enabled.value = false;
      assert.strictEqual(button.hasAttribute("disabled"), true);

      enabled.value = true;
      assert.strictEqual(button.hasAttribute("disabled"), false);
    });

    /**
     * Function as reactive content - automatically wrapped in computed
     */
    it("should treat functions as reactive content", () => {
      const count = signal(1);

      const { fragment } = html`<div>${() => count.value * 2}</div>`.render();
      const div = fragment.firstChild as HTMLDivElement;

      assert.strictEqual(div.textContent, "2");

      count.value = 5;
      assert.strictEqual(div.textContent, "10");

      count.value = 0;
      assert.strictEqual(div.textContent, "0");
    });

    /**
     * Function as reactive attribute - automatically wrapped in computed
     */
    it("should treat functions as reactive attributes", () => {
      const count = signal(1);

      const { fragment } = html`<div
        class=${() => `item-${count.value}`}
      ></div>`.render();
      const div = fragment.firstChild as HTMLDivElement;

      assert.strictEqual(div.getAttribute("class"), "item-1");

      count.value = 5;
      assert.strictEqual(div.getAttribute("class"), "item-5");
    });

    /**
     * Function returning boolean for attribute
     */
    it("should handle function returning boolean for attribute", () => {
      const enabled = signal(true);

      const { fragment } = html`<button disabled=${() => !enabled.value}>
        Click
      </button>`.render();
      const button = fragment.firstChild as HTMLButtonElement;

      assert.strictEqual(button.hasAttribute("disabled"), false);

      enabled.value = false;
      assert.strictEqual(button.hasAttribute("disabled"), true);
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

  /**
   * Additional each() edge case tests
   */
  describe("each() - edge cases", () => {
    /**
     * Clear document.body before each test to prevent DOM pollution
     * from previous tests affecting subsequent ones.
     */
    beforeEach(() => {
      document.body.innerHTML = "";
    });

    /**
     * Edge case: Replacing entire list with new items
     *
     * When the list is completely replaced, old items should be disposed
     * and new items rendered.
     */
    it("should handle complete list replacement", () => {
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
      const originalNodes = [...ul.children];

      // Completely replace with different items
      items.value = [
        { id: 3, name: "Carol" },
        { id: 4, name: "Dave" },
      ];

      assert.strictEqual(ul.children.length, 2);
      // All nodes should be different (new keys)
      assert.notStrictEqual(ul.children[0], originalNodes[0]);
      assert.notStrictEqual(ul.children[1], originalNodes[1]);
      assert.strictEqual(ul.children[0]!.textContent, "Carol");
      assert.strictEqual(ul.children[1]!.textContent, "Dave");

      ul.remove();
    });

    /**
     * Edge case: Moving item from end to beginning
     *
     * This tests the reordering algorithm when an item moves
     * a significant distance in the list.
     */
    it("should handle moving item from end to beginning", () => {
      const a = { id: 1, name: "A" };
      const b = { id: 2, name: "B" };
      const c = { id: 3, name: "C" };
      const items = signal([a, b, c]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const nodeC = ul.children[2]!;

      // Move C to the beginning
      items.value = [c, a, b];

      assert.strictEqual(ul.children.length, 3);
      assert.strictEqual(ul.children[0], nodeC); // Same node, moved
      assert.strictEqual(ul.children[0]!.textContent, "C");
      assert.strictEqual(ul.children[1]!.textContent, "A");
      assert.strictEqual(ul.children[2]!.textContent, "B");

      ul.remove();
    });

    /**
     * Edge case: Shuffle list randomly
     *
     * Tests that any arbitrary reordering works correctly.
     * When the same object references are reused, nodes are reused and reordered.
     */
    it("should handle arbitrary reordering", () => {
      // Use stable object references so nodes can be reused
      const a = { id: 1, name: "A" };
      const b = { id: 2, name: "B" };
      const c = { id: 3, name: "C" };
      const d = { id: 4, name: "D" };
      const e = { id: 5, name: "E" };

      const items = signal([a, b, c, d, e]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const nodeMap = new Map<number, Element>();
      for (let i = 0; i < 5; i++) {
        nodeMap.set(i + 1, ul.children[i]!);
      }

      // Shuffle: [E, C, A, D, B] - using same object references
      items.value = [e, c, a, d, b];

      assert.strictEqual(ul.children.length, 5);
      // Each node should be the same as before, just reordered
      assert.strictEqual(ul.children[0], nodeMap.get(5));
      assert.strictEqual(ul.children[1], nodeMap.get(3));
      assert.strictEqual(ul.children[2], nodeMap.get(1));
      assert.strictEqual(ul.children[3], nodeMap.get(4));
      assert.strictEqual(ul.children[4], nodeMap.get(2));

      ul.remove();
    });

    /**
     * Edge case: Rapidly updating list multiple times
     *
     * Tests that rapid successive updates work correctly.
     */
    it("should handle rapid successive updates", () => {
      const items = signal<{ id: number; name: string }[]>([]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;

      // Rapid updates
      items.value = [{ id: 1, name: "A" }];
      items.value = [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ];
      items.value = [{ id: 2, name: "B" }];
      items.value = [];
      items.value = [
        { id: 3, name: "C" },
        { id: 4, name: "D" },
      ];

      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0]!.textContent, "C");
      assert.strictEqual(ul.children[1]!.textContent, "D");

      ul.remove();
    });

    /**
     * Edge case: Item with same key but different content
     *
     * When an item at a key changes (different object reference),
     * the old template should be disposed and new one rendered.
     */
    it("should re-render when item at same key changes", () => {
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
      const originalNode = ul.children[0]!;

      // Replace with new object having same id
      items.value = [{ id: 1, name: "Alicia" }];

      // Node is recreated because object reference changed
      assert.strictEqual(ul.children.length, 1);
      assert.notStrictEqual(ul.children[0], originalNode);
      assert.strictEqual(ul.children[0]!.textContent, "Alicia");

      ul.remove();
    });

    /**
     * Edge case: Very large list
     *
     * Performance test with a larger number of items.
     */
    it("should handle moderately large lists", () => {
      const itemCount = 100;
      const items = signal(
        Array.from({ length: itemCount }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
        })),
      );

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;

      assert.strictEqual(ul.children.length, itemCount);

      // Remove half the items
      items.value = items.value.filter((_, i) => i % 2 === 0);
      assert.strictEqual(ul.children.length, 50);

      // Reverse
      items.value = [...items.value].reverse();
      assert.strictEqual(ul.children.length, 50);

      ul.remove();
    });

    /**
     * Edge case: each() with computed list derived from store
     *
     * A computed that filters/transforms store data should work reactively.
     */
    it("should work with computed list from store", () => {
      const state = store({
        items: [
          { id: 1, name: "Alice", active: true },
          { id: 2, name: "Bob", active: false },
          { id: 3, name: "Carol", active: true },
        ],
      });

      const activeItems = computed(() => state.items.filter((i) => i.active));

      const { fragment } = html`<ul>
        ${each(
          activeItems,
          (i) => i.id,
          (i) => html`<li>${i.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;

      // Initially 2 active items
      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0]!.textContent, "Alice");
      assert.strictEqual(ul.children[1]!.textContent, "Carol");

      // Activate Bob
      state.items = state.items.map((i) =>
        i.id === 2 ? { ...i, active: true } : i,
      );

      assert.strictEqual(ul.children.length, 3);

      ul.remove();
    });

    /**
     * Edge case: each() with template that has multiple root elements
     *
     * When renderFn returns a template with multiple elements,
     * all should be tracked correctly.
     */
    it("should handle templates with multiple root elements", () => {
      const items = signal(["a", "b"]);

      const { fragment } = html`<div>
        ${each(
          items,
          (_, i) => i,
          (item) => html`<span>${item}</span><span>!</span>`,
        )}
      </div>`.render();

      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      // Each item renders 2 spans
      const spans = div.querySelectorAll("span");
      assert.strictEqual(spans.length, 4);
      assert.strictEqual(spans[0]!.textContent, "a");
      assert.strictEqual(spans[1]!.textContent, "!");
      assert.strictEqual(spans[2]!.textContent, "b");
      assert.strictEqual(spans[3]!.textContent, "!");

      // Remove first item
      items.value = ["b"];
      const updatedSpans = div.querySelectorAll("span");
      assert.strictEqual(updatedSpans.length, 2);

      div.remove();
    });

    /**
     * Edge case: Nested each() calls
     *
     * each() inside each() should work correctly.
     */
    it("should handle nested each() calls", () => {
      const groups = signal([
        { id: 1, items: signal(["a", "b"]) },
        { id: 2, items: signal(["c", "d"]) },
      ]);

      const { fragment } = html`<div>
        ${each(
          groups,
          (g) => g.id,
          (g) =>
            html`<ul>
              ${each(g.items, (item) => html`<li>${item}</li>`)}
            </ul>`,
        )}
      </div>`.render();

      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      const uls = div.querySelectorAll("ul");
      assert.strictEqual(uls.length, 2);
      assert.strictEqual(uls[0]!.children.length, 2);
      assert.strictEqual(uls[1]!.children.length, 2);

      // Update inner list
      groups.value[0]!.items.value = ["a", "b", "c"];
      assert.strictEqual(uls[0]!.children.length, 3);

      div.remove();
    });

    /**
     * Edge case: each() where keyFn returns same key for different items
     *
     * Should warn about duplicate keys and skip duplicates.
     */
    it("should warn and skip items with duplicate keys from keyFn", () => {
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => warnings.push(msg);

      try {
        // keyFn always returns the same key
        const items = signal([
          { name: "Alice" },
          { name: "Bob" },
          { name: "Carol" },
        ]);

        const { fragment } = html`<ul>
          ${each(
            items,
            () => "same-key",
            (i) => html`<li>${i.name}</li>`,
          )}
        </ul>`.render();

        const ul = fragment.querySelector("ul")!;

        // Only first item should be rendered
        assert.strictEqual(ul.children.length, 1);
        assert.strictEqual(ul.children[0]!.textContent, "Alice");

        // Warning should have been issued
        assert.strictEqual(warnings.length, 1);
        assert.ok(warnings[0]!.includes("Duplicate key"));
      } finally {
        console.warn = originalWarn;
      }
    });

    /**
     * Edge case: each() with function items (using reference as key)
     *
     * Functions should use their reference as key.
     */
    it("should use function reference as key", () => {
      const fn1 = () => "fn1";
      const fn2 = () => "fn2";
      const items = signal([fn1, fn2]);

      const { fragment } = html`<ul>
        ${each(items, (fn) => html`<li>${fn()}</li>`)}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;

      assert.strictEqual(ul.children.length, 2);
      const node1 = ul.children[0]!;

      // Swap order
      items.value = [fn2, fn1];

      // Nodes should be reused and reordered
      assert.strictEqual(ul.children[1], node1);

      ul.remove();
    });

    /**
     * Edge case: each() with items that are already signals
     *
     * Items in the list that are signals should remain reactive.
     */
    it("should preserve signal reactivity in list items", () => {
      const name1 = signal("Alice");
      const name2 = signal("Bob");
      const items = signal([
        { id: 1, name: name1 },
        { id: 2, name: name2 },
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

      assert.strictEqual(ul.children[0]!.textContent, "Alice");

      // Update signal inside item
      name1.value = "Alicia";
      assert.strictEqual(ul.children[0]!.textContent, "Alicia");

      // The list node should be the same (not re-rendered)
      const firstLi = ul.children[0]!;
      name1.value = "Alice Updated";
      assert.strictEqual(ul.children[0], firstLi);
      assert.strictEqual(ul.children[0]!.textContent, "Alice Updated");

      ul.remove();
    });
  });
});
