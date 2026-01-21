import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html as baseHtml, Template } from "../src/template.js";
import eachPlugin, { each } from "../src/each.js";
import asyncPlugin, {
  type AsyncGeneratorContext,
  type RenderedContent,
} from "../src/async.js";
import { signal, store, computed, batch } from "../src/signals/index.js";

// Compose html with plugins for tests that use each() and async generators
const html = baseHtml.with(eachPlugin, asyncPlugin);

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
    beforeEach(() => {
      document.body.innerHTML = "";
    });

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
    beforeEach(() => {
      document.body.innerHTML = "";
    });

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
    beforeEach(() => {
      document.body.innerHTML = "";
    });

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
          (i) => html`<li>${i.value.name}</li>`,
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
    beforeEach(() => {
      document.body.innerHTML = "";
    });

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
    beforeEach(() => {
      document.body.innerHTML = "";
    });

    it("should render a list of items", () => {
      const items = signal([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
     * With the three-arg form of each(), items are wrapped in ReadonlySignal<T>.
     * When an item at a key changes (different object reference but same key),
     * the template is reused and the signal's value is updated. To make the
     * content reactive, use a function wrapper: `${() => item.value.name}`.
     */
    it("should update item signal when item at same key changes", () => {
      const items = signal([{ id: 1, name: "Alice" }]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${() => i.value.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const originalNode = ul.children[0]!;

      assert.strictEqual(originalNode.textContent, "Alice");

      // Replace with new object having same id
      items.value = [{ id: 1, name: "Alicia" }];

      // Node is reused (same key), content updates via signal
      assert.strictEqual(ul.children.length, 1);
      assert.strictEqual(ul.children[0], originalNode); // Same node reused
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (i) => html`<li>${i.value.name}</li>`,
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
          (item) => html`<span>${item.value}</span><span>!</span>`,
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
     * Edge case: reordering entries with multiple root nodes
     *
     * When entries have multiple DOM nodes and are reordered,
     * the internal order of nodes within each entry must be preserved.
     * This tests the LIS-based reordering algorithm.
     */
    it("should preserve internal node order when reordering multi-node entries", () => {
      const a = { id: "a" };
      const b = { id: "b" };
      const items = signal([a, b]);

      const { fragment } = html`<div>
        ${each(
          items,
          (i) => i.id,
          (item) =>
            html`<span>${item.value.id}1</span><span>${item.value.id}2</span>`,
        )}
      </div>`.render();

      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      // Initial order: a1, a2, b1, b2
      let spans = div.querySelectorAll("span");
      assert.strictEqual(spans.length, 4);
      assert.strictEqual(spans[0]!.textContent, "a1");
      assert.strictEqual(spans[1]!.textContent, "a2");
      assert.strictEqual(spans[2]!.textContent, "b1");
      assert.strictEqual(spans[3]!.textContent, "b2");

      // Swap order: [b, a]
      items.value = [b, a];

      // After swap: b1, b2, a1, a2 (internal order preserved)
      spans = div.querySelectorAll("span");
      assert.strictEqual(spans.length, 4);
      assert.strictEqual(spans[0]!.textContent, "b1");
      assert.strictEqual(spans[1]!.textContent, "b2");
      assert.strictEqual(spans[2]!.textContent, "a1");
      assert.strictEqual(spans[3]!.textContent, "a2");

      div.remove();
    });

    /**
     * Edge case: reordering with mix of new and existing multi-node entries
     *
     * When new entries are added while existing multi-node entries are reordered,
     * all nodes should end up in the correct order.
     */
    it("should handle reordering multi-node entries with new items", () => {
      const a = { id: "a" };
      const b = { id: "b" };
      const c = { id: "c" };
      const items = signal([a, b]);

      const { fragment } = html`<div>
        ${each(
          items,
          (i) => i.id,
          (item) =>
            html`<span>${item.value.id}1</span><span>${item.value.id}2</span>`,
        )}
      </div>`.render();

      document.body.appendChild(fragment);
      const div = document.body.querySelector("div")!;

      // Initial: a1, a2, b1, b2
      let spans = div.querySelectorAll("span");
      assert.strictEqual(spans[0]!.textContent, "a1");
      assert.strictEqual(spans[3]!.textContent, "b2");

      // Add c at beginning and swap a,b: [c, b, a]
      items.value = [c, b, a];

      // Expected: c1, c2, b1, b2, a1, a2
      spans = div.querySelectorAll("span");
      assert.strictEqual(spans.length, 6);
      assert.strictEqual(spans[0]!.textContent, "c1");
      assert.strictEqual(spans[1]!.textContent, "c2");
      assert.strictEqual(spans[2]!.textContent, "b1");
      assert.strictEqual(spans[3]!.textContent, "b2");
      assert.strictEqual(spans[4]!.textContent, "a1");
      assert.strictEqual(spans[5]!.textContent, "a2");

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
              ${each(
                g.value.items,
                (item, i) => i,
                (item) => html`<li>${() => item.value}</li>`,
              )}
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
            (i) => html`<li>${i.value.name}</li>`,
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
     * Edge case: each() with function items
     *
     * Functions should work as list items with explicit key.
     */
    it("should handle function items with explicit key", () => {
      const fn1 = () => "fn1";
      const fn2 = () => "fn2";
      const items = signal([
        { id: 1, fn: fn1 },
        { id: 2, fn: fn2 },
      ]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${() => i.value.fn()}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;

      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0]!.textContent, "fn1");
      const node1 = ul.children[0]!;

      // Swap order
      items.value = [
        { id: 2, fn: fn2 },
        { id: 1, fn: fn1 },
      ];

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
          (i) => html`<li>${i.value.name}</li>`,
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

  /**
   * each() keyed list behavior tests
   *
   * These tests demonstrate the key behaviors of each().
   */
  describe("each() - keyed list behavior", () => {
    beforeEach(() => {
      document.body.innerHTML = "";
    });

    /**
     * DOM is preserved when key matches, even with different object reference.
     */
    it("should preserve DOM when key matches with new object", () => {
      const items = signal([{ id: 1, name: "Alice" }]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li data-id=${i.value.id}>${() => i.value.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const originalNode = ul.children[0]!;

      assert.strictEqual(originalNode.textContent, "Alice");

      // Replace with new object having same key - DOM is preserved!
      items.value = [{ id: 1, name: "Alicia" }];

      assert.strictEqual(ul.children.length, 1);
      assert.strictEqual(ul.children[0], originalNode); // Same node!
      assert.strictEqual(ul.children[0]!.textContent, "Alicia"); // Content updated
    });

    /**
     * Signal updates propagate to the template
     */
    it("should update content reactively via signal", () => {
      const items = signal([{ id: 1, name: "Alice" }]);

      let renderCount = 0;
      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => {
            renderCount++;
            return html`<li>${() => i.value.name}</li>`;
          },
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;

      assert.strictEqual(renderCount, 1);
      assert.strictEqual(ul.children[0]!.textContent, "Alice");

      // Update with same key - render function NOT called again
      items.value = [{ id: 1, name: "Bob" }];

      assert.strictEqual(renderCount, 1); // Still 1 - not re-rendered
      assert.strictEqual(ul.children[0]!.textContent, "Bob"); // But content updated

      ul.remove();
    });

    /**
     * New keys still create new DOM
     */
    it("should create new DOM for new keys", () => {
      const items = signal([{ id: 1, name: "Alice" }]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${() => i.value.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const originalNode = ul.children[0]!;

      // Add item with new key
      items.value = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];

      assert.strictEqual(ul.children.length, 2);
      assert.strictEqual(ul.children[0], originalNode); // First node preserved
      assert.strictEqual(ul.children[1]!.textContent, "Bob"); // New node created

      ul.remove();
    });

    /**
     * Removed keys dispose their templates
     */
    it("should dispose templates when keys are removed", () => {
      const items = signal([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${() => i.value.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;
      const secondNode = ul.children[1]!;

      assert.strictEqual(ul.children.length, 2);

      // Remove first item
      items.value = [{ id: 2, name: "Bob" }];

      assert.strictEqual(ul.children.length, 1);
      assert.strictEqual(ul.children[0], secondNode); // Second node preserved and moved
      assert.strictEqual(ul.children[0]!.textContent, "Bob");

      ul.remove();
    });

    /**
     * peek() should read without tracking
     */
    it("peek() should read without tracking", () => {
      const items = signal([{ id: 1, name: "Alice" }]);
      const clickedIds: number[] = [];

      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) =>
            html`<li @click=${() => clickedIds.push(i.peek().id)}>
              ${() => i.value.name}
            </li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;

      // Simulate click
      (ul.children[0] as HTMLElement).click();
      assert.deepStrictEqual(clickedIds, [1]);

      // Update item - click handler still works with current value
      items.value = [{ id: 1, name: "Alicia" }];
      (ul.children[0] as HTMLElement).click();
      assert.deepStrictEqual(clickedIds, [1, 1]);

      ul.remove();
    });
  });

  describe("async generator templates", () => {
    /**
     * Helper to wait for async updates to complete
     */
    const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

    beforeEach(() => {
      document.body.innerHTML = "";
    });

    it("should render yielded content", async () => {
      const { fragment } = html`<div>
        ${async function* () {
          yield html`<span>Hello</span>`;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      const div = document.body.querySelector("div")!;
      assert.strictEqual(div.querySelector("span")?.textContent, "Hello");
    });

    it("should update DOM on each yield", async () => {
      const { fragment } = html`<div>
        ${async function* () {
          yield html`<span>Loading...</span>`;
          await tick(50);
          yield html`<span>Done!</span>`;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick(5);

      const div = document.body.querySelector("div")!;
      assert.strictEqual(div.querySelector("span")?.textContent, "Loading...");

      await tick(100);
      assert.strictEqual(div.querySelector("span")?.textContent, "Done!");
    });

    it("should use return value over last yield when return value defined", async () => {
      const { fragment } = html`<div>
        ${async function* () {
          yield html`<span>Loading...</span>`;
          await tick(5);
          return html`<span>Final!</span>`;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick(20);

      const div = document.body.querySelector("div")!;
      assert.strictEqual(div.querySelector("span")?.textContent, "Final!");
    });

    it("should render null/undefined as empty", async () => {
      const { fragment } = html`<div>
        ${async function* () {
          yield null;
          await tick(50);
          yield html`<span>Done</span>`;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick(5);

      const div = document.body.querySelector("div")!;
      // Initially empty (null rendered as nothing)
      assert.strictEqual(div.querySelector("span"), null);

      await tick(100);
      assert.strictEqual(div.querySelector("span")?.textContent, "Done");
    });

    it("should render strings", async () => {
      const { fragment } = html`<div>
        ${async function* () {
          yield "Hello World";
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      const div = document.body.querySelector("div")!;
      assert.ok(div.textContent?.includes("Hello World"));
    });

    it("should render numbers", async () => {
      const { fragment } = html`<div>
        ${async function* () {
          yield 42;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      const div = document.body.querySelector("div")!;
      assert.ok(div.textContent?.includes("42"));
    });

    it("should track signal dependencies and restart on change", async () => {
      const userId = signal(1);
      const renderCount = { value: 0 };

      const { fragment } = html`<div>
        ${async function* () {
          renderCount.value++;
          yield html`<span>Loading user ${userId.value}...</span>`;
          await tick(50);
          yield html`<span>User ${userId.value} loaded</span>`;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick(100);

      const div = document.body.querySelector("div")!;
      assert.strictEqual(
        div.querySelector("span")?.textContent,
        "User 1 loaded",
      );
      assert.strictEqual(renderCount.value, 1);

      // Change signal - should restart generator
      userId.value = 2;
      await tick(5);

      // Should show loading for new user
      assert.strictEqual(
        div.querySelector("span")?.textContent,
        "Loading user 2...",
      );

      await tick(100);
      assert.strictEqual(
        div.querySelector("span")?.textContent,
        "User 2 loaded",
      );
      assert.strictEqual(renderCount.value, 2);
    });

    it("should provide a persistent context object across restarts", async () => {
      const userId = signal(1);
      const contexts: AsyncGeneratorContext<{ lastId?: number }>[] = [];
      const lastIds: (number | undefined)[] = [];

      const { fragment } = html`<div>
        ${async function* (
          settled?: RenderedContent,
          ctx?: AsyncGeneratorContext<{ lastId?: number }>,
        ) {
          void settled;
          assert.ok(ctx);
          contexts.push(ctx);
          lastIds.push(ctx.lastId);
          const id = userId.value;
          ctx.lastId = id;
          yield html`<span>${id}</span>`;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      assert.strictEqual(lastIds[0], undefined);

      userId.value = 2;
      await tick();

      assert.strictEqual(lastIds[1], 1);
      assert.strictEqual(contexts[1], contexts[0]);
    });

    it("should call generator.return() on dispose", async () => {
      let finallyRan = false;

      const { fragment, dispose } = html`<div>
        ${async function* () {
          try {
            yield html`<span>Step 1</span>`;
            await tick(50);
            yield html`<span>Step 2</span>`;
          } finally {
            finallyRan = true;
          }
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      const div = document.body.querySelector("div")!;
      assert.strictEqual(div.querySelector("span")?.textContent, "Step 1");
      assert.strictEqual(finallyRan, false);

      // Dispose while generator is awaiting tick(50)
      dispose();
      // Wait for the tick(50) to complete so finally can run
      await tick(100);

      // Finally block runs when generator.return() is called
      assert.strictEqual(finallyRan, true);
    });

    it("should run finally block on restart", async () => {
      const userId = signal(1);
      const finallyIds: number[] = [];

      const { fragment, dispose } = html`<div>
        ${async function* () {
          const id = userId.value;
          try {
            yield html`<span>User ${id}</span>`;
            await tick(50);
            yield html`<span>Done ${id}</span>`;
            await tick(1000); // Long wait - won't complete during test
          } finally {
            finallyIds.push(id);
          }
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      assert.deepStrictEqual(finallyIds, []);

      // Change signal while generator is awaiting - should restart and run finally
      userId.value = 2;
      // Wait for the old generator's tick(50) to complete so its finally runs
      await tick(100);

      // Old generator's finally should have run (id=1)
      assert.deepStrictEqual(finallyIds, [1]);

      // Clean up
      dispose();
    });

    it("should abort in-flight requests via AbortController pattern", async () => {
      const userId = signal(1);
      const abortedIds: number[] = [];

      const { fragment, dispose } = html`<div>
        ${async function* () {
          const id = userId.value;
          const controller = new AbortController();
          controller.signal.addEventListener("abort", () => {
            abortedIds.push(id);
          });
          try {
            yield html`<span>User ${id}</span>`;
            await tick(50);
            yield html`<span>Done ${id}</span>`;
            await tick(1000); // Long wait - won't complete during test
          } finally {
            controller.abort();
          }
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      assert.deepStrictEqual(abortedIds, []);

      // Change signal - should restart and abort old generator
      userId.value = 2;
      await tick(100);

      // Old generator's finally should have aborted (id=1)
      assert.deepStrictEqual(abortedIds, [1]);

      // Clean up
      dispose();
    });

    it("should handle nested async generators", async () => {
      const { fragment } = html`<div>
        ${async function* () {
          yield html`<div class="outer">
            ${async function* () {
              yield html`<span>Inner Loading...</span>`;
              await tick(20);
              yield html`<span>Inner Done!</span>`;
            }}
          </div>`;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      const div = document.body.querySelector("div")!;
      const outer = div.querySelector(".outer");
      assert.ok(outer);
      assert.strictEqual(
        outer!.querySelector("span")?.textContent,
        "Inner Loading...",
      );

      await tick(50);
      assert.strictEqual(
        outer!.querySelector("span")?.textContent,
        "Inner Done!",
      );
    });

    // Errors thrown in generators become unhandled rejections.
    // When disposed, errors are suppressed.
    it("should suppress errors when disposed before error is thrown", async () => {
      let beforeError = false;

      const { fragment, dispose } = html`<div>
        ${async function* () {
          yield html`<span>Before error</span>`;
          beforeError = true;
          await tick(50); // Longer wait
          throw new Error("Test error");
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      // First yield should work
      const div = document.body.querySelector("div")!;
      assert.strictEqual(
        div.querySelector("span")?.textContent,
        "Before error",
      );
      assert.strictEqual(beforeError, true);

      // Dispose before the error is thrown
      dispose();
      // Don't wait for the error - it should be suppressed because disposed
    });

    it("should handle generator that yields once and returns", async () => {
      const { fragment } = html`<div>
        ${async function* () {
          yield html`<span>Only yield</span>`;
          return undefined;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      const div = document.body.querySelector("div")!;
      // Should use last yielded since return is undefined
      assert.strictEqual(div.querySelector("span")?.textContent, "Only yield");
    });

    it("should handle generator that only returns (no yields)", async () => {
      const { fragment } = html`<div>
        ${
          // eslint-disable-next-line require-yield
          async function* () {
            await tick(5);
            return html`<span>Direct return</span>`;
          }
        }
      </div>`.render();

      document.body.appendChild(fragment);
      await tick(20);

      const div = document.body.querySelector("div")!;
      assert.strictEqual(
        div.querySelector("span")?.textContent,
        "Direct return",
      );
    });

    it("should ignore stale iterations after restart", async () => {
      const userId = signal(1);

      const { fragment } = html`<div>
        ${async function* () {
          const id = userId.value;
          yield html`<span>Loading ${id}...</span>`;
          // Longer delay for user 1
          await tick(id === 1 ? 50 : 5);
          yield html`<span>User ${id}</span>`;
        }}
      </div>`.render();

      document.body.appendChild(fragment);
      await tick();

      const div = document.body.querySelector("div")!;
      assert.strictEqual(
        div.querySelector("span")?.textContent,
        "Loading 1...",
      );

      // Quickly change before first request completes
      userId.value = 2;
      await tick(30);

      // User 2 should complete first (faster) and be displayed
      assert.strictEqual(div.querySelector("span")?.textContent, "User 2");

      // Wait for user 1 to "complete" - DOM should still show User 2
      await tick(50);
      assert.strictEqual(div.querySelector("span")?.textContent, "User 2");
    });

    it("should handle async generator inside each()", async () => {
      const items = signal([1, 2]);

      const { fragment } = html`<ul>
        ${each(
          items,
          (id) => id,
          (id) =>
            html`<li>
              ${async function* () {
                yield html`<span>Loading ${id.value}...</span>`;
                await tick(5);
                yield html`<span>Item ${id.value}</span>`;
              }}
            </li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      await tick();

      const ul = document.body.querySelector("ul")!;
      assert.strictEqual(ul.children.length, 2);

      await tick(20);
      assert.strictEqual(
        ul.children[0]!.querySelector("span")?.textContent,
        "Item 1",
      );
      assert.strictEqual(
        ul.children[1]!.querySelector("span")?.textContent,
        "Item 2",
      );
    });

    describe("DOM preservation (settled parameter)", () => {
      it("should pass undefined as settled on first run", async () => {
        let receivedSettled: RenderedContent | undefined = undefined;
        let called = false;

        const { fragment } = html`<div>
          ${async function* (settled?: RenderedContent) {
            called = true;
            receivedSettled = settled;
            yield html`<span>Done</span>`;
          }}
        </div>`.render();

        document.body.appendChild(fragment);
        await tick();

        assert.strictEqual(called, true);
        assert.strictEqual(receivedSettled, undefined);
      });

      it("should pass previous settled content on restart", async () => {
        const userId = signal(1);
        const settledValues: (RenderedContent | undefined)[] = [];

        const { fragment } = html`<div>
          ${async function* (settled?: RenderedContent) {
            settledValues.push(settled);
            const id = userId.value;
            yield html`<span>User ${id}</span>`;
          }}
        </div>`.render();

        document.body.appendChild(fragment);
        await tick();

        assert.strictEqual(settledValues.length, 1);
        assert.strictEqual(settledValues[0], undefined);

        userId.value = 2;
        await tick();

        assert.strictEqual(settledValues.length, 2);
        assert.notStrictEqual(settledValues[1], undefined);
        assert.ok(typeof settledValues[1] === "object");
      });

      it("should preserve DOM when returning settled", async () => {
        const userId = signal(1);
        let spanElement: Element | null = null;

        const { fragment } = html`<div>
          ${async function* (settled?: RenderedContent) {
            const id = userId.value;

            if (settled) {
              // Return settled to preserve DOM
              return settled;
            }

            yield html`<span data-id="${id}">User ${id}</span>`;
          }}
        </div>`.render();

        document.body.appendChild(fragment);
        await tick();

        const div = document.body.querySelector("div")!;
        spanElement = div.querySelector("span");
        assert.ok(spanElement);
        assert.strictEqual(spanElement.getAttribute("data-id"), "1");

        // Change signal - should preserve DOM
        userId.value = 2;
        await tick();

        // Same DOM node should still be there
        const currentSpan = div.querySelector("span");
        assert.strictEqual(currentSpan, spanElement); // Same reference!
        // data-id is still "1" because we preserved, not re-rendered
        assert.strictEqual(currentSpan!.getAttribute("data-id"), "1");
      });

      it("should allow surgical updates via reactive bindings when preserving DOM", async () => {
        const userId = signal(1);
        const userName = signal("Alice");
        let spanElement: Element | null = null;

        const { fragment } = html`<div>
          ${async function* (settled?: RenderedContent) {
            const id = userId.value;

            if (settled) {
              // Update state, preserve DOM
              await tick(5);
              userName.value = id === 2 ? "Bob" : "Charlie";
              return settled;
            }

            // First render with reactive binding
            yield html`<span>${userName}</span>`;
          }}
        </div>`.render();

        document.body.appendChild(fragment);
        await tick();

        const div = document.body.querySelector("div")!;
        spanElement = div.querySelector("span");
        assert.strictEqual(spanElement!.textContent, "Alice");

        // Change signal - should preserve DOM but update via reactive binding
        userId.value = 2;
        await tick(20);

        // Same DOM node
        assert.strictEqual(div.querySelector("span"), spanElement);
        // But text updated via reactive binding
        assert.strictEqual(spanElement!.textContent, "Bob");
      });

      it("should replace DOM when not returning settled", async () => {
        const userId = signal(1);

        const { fragment } = html`<div>
          ${async function* (settled?: RenderedContent) {
            void settled; // Ignore settled, always yield new content
            const id = userId.value;
            yield html`<span data-id="${id}">User ${id}</span>`;
          }}
        </div>`.render();

        document.body.appendChild(fragment);
        await tick();

        const div = document.body.querySelector("div")!;
        const span1 = div.querySelector("span");
        assert.strictEqual(span1!.getAttribute("data-id"), "1");

        userId.value = 2;
        await tick();

        const span2 = div.querySelector("span");
        assert.notStrictEqual(span2, span1); // Different element!
        assert.strictEqual(span2!.getAttribute("data-id"), "2");
      });

      it("should handle multiple restarts with preservation", async () => {
        const userId = signal(1);
        let renderCount = 0;

        const { fragment } = html`<div>
          ${async function* (settled?: RenderedContent) {
            renderCount++;
            const id = userId.value;

            if (settled) return settled;

            yield html`<span>${id}</span>`;
          }}
        </div>`.render();

        document.body.appendChild(fragment);
        await tick();

        const div = document.body.querySelector("div")!;
        const originalSpan = div.querySelector("span");
        assert.strictEqual(renderCount, 1);

        // Multiple restarts
        userId.value = 2;
        await tick();
        userId.value = 3;
        await tick();
        userId.value = 4;
        await tick();

        assert.strictEqual(renderCount, 4);
        // Same DOM element throughout
        assert.strictEqual(div.querySelector("span"), originalSpan);
      });

      it("should clean up properly on dispose when using preservation", async () => {
        const userId = signal(1);
        const userName = signal("Alice");

        const { fragment, dispose } = html`<div>
          ${async function* (settled?: RenderedContent) {
            void userId.value; // Track dependency

            if (settled) return settled;

            // Create a reactive binding to track
            yield html`<span>${userName}</span>`;
          }}
        </div>`.render();

        document.body.appendChild(fragment);
        await tick();

        const div = document.body.querySelector("div")!;
        assert.strictEqual(div.querySelector("span")?.textContent, "Alice");

        // Trigger a restart with preservation
        userId.value = 2;
        await tick();

        // Verify reactive binding still works after preservation
        userName.value = "Bob";
        assert.strictEqual(div.querySelector("span")?.textContent, "Bob");

        // Dispose everything
        dispose();

        // After dispose, changing the signal should not cause issues
        // (no errors thrown, binding is cleaned up)
        userName.value = "Charlie";
        // The span should still show "Bob" (no update after dispose)
        // Note: The DOM might be removed depending on implementation
      });

      it("should support switching from preservation back to new content", async () => {
        const userId = signal(1);
        const forceRefresh = signal(false);

        const { fragment } = html`<div>
          ${async function* (settled?: RenderedContent) {
            const id = userId.value;
            const refresh = forceRefresh.value;

            if (settled && !refresh) {
              return settled;
            }

            // Reset refresh flag if it was set
            if (refresh) {
              forceRefresh.value = false;
            }

            yield html`<span data-id="${id}">User ${id}</span>`;
          }}
        </div>`.render();

        document.body.appendChild(fragment);
        await tick();

        const div = document.body.querySelector("div")!;
        const span1 = div.querySelector("span");
        assert.strictEqual(span1!.getAttribute("data-id"), "1");

        // Normal restart with preservation
        userId.value = 2;
        await tick();
        assert.strictEqual(div.querySelector("span"), span1); // Same element
        assert.strictEqual(span1!.getAttribute("data-id"), "1"); // Old value

        // Force refresh - should create new DOM
        forceRefresh.value = true;
        await tick();

        const span2 = div.querySelector("span");
        assert.notStrictEqual(span2, span1); // Different element!
        // The span should reflect the current userId
        assert.strictEqual(span2!.getAttribute("data-id"), "2");
      });

      it("should clean up generators on dispose with preservation", async () => {
        const userId = signal(1);
        const finallyCalledFor: number[] = [];

        const { fragment, dispose } = html`<div>
          ${async function* (settled?: RenderedContent) {
            const id = userId.value;

            try {
              if (settled) {
                // Preserve DOM, do a short operation
                await tick(20);
                return settled;
              }
              yield html`<span>${id}</span>`;
              await tick(20);
            } finally {
              finallyCalledFor.push(id);
            }
          }}
        </div>`.render();

        document.body.appendChild(fragment);
        await tick(50);

        // First generator completed
        assert.deepStrictEqual(finallyCalledFor, [1]);

        // Trigger restart with preservation
        userId.value = 2;
        await tick(50);

        // Second generator also completed (returned settled)
        assert.deepStrictEqual(finallyCalledFor, [1, 2]);

        // Dispose
        dispose();
        await tick();

        // Everything cleaned up
        assert.deepStrictEqual(finallyCalledFor, [1, 2]);
      });
    });
  });

  describe("template caching", () => {
    beforeEach(() => {
      document.body.innerHTML = "";
    });

    it("should reuse cached prototype for same template strings", () => {
      // Use the same tagged template literal twice
      function createTemplate() {
        return html`<div class="cached"><span>Hello</span></div>`;
      }

      const t1 = createTemplate();
      const t2 = createTemplate();

      const { fragment: f1, dispose: d1 } = t1.render();
      const { fragment: f2, dispose: d2 } = t2.render();

      // Both should produce valid DOM
      assert.strictEqual((f1.firstChild as Element).className, "cached");
      assert.strictEqual((f2.firstChild as Element).className, "cached");

      // They should be separate instances
      assert.notStrictEqual(f1.firstChild, f2.firstChild);

      d1();
      d2();
    });

    it("should isolate instances - mutations should not affect cached prototype", () => {
      function createTemplate() {
        return html`<div class="original"><span>Text</span></div>`;
      }

      // Render first instance and mutate it
      const { fragment: f1, dispose: d1 } = createTemplate().render();
      const div1 = f1.firstChild as HTMLDivElement;
      div1.className = "mutated";
      div1.textContent = "Changed!";

      // Render second instance - should have original content
      const { fragment: f2, dispose: d2 } = createTemplate().render();
      const div2 = f2.firstChild as HTMLDivElement;

      assert.strictEqual(div2.className, "original");
      assert.strictEqual(div2.querySelector("span")?.textContent, "Text");

      d1();
      d2();
    });

    it("should maintain reactivity across cached renders", () => {
      document.body.innerHTML = "";
      const count = signal(0);

      function createTemplate() {
        return html`<div>${() => count.value}</div>`;
      }

      const { fragment: f1, dispose: d1 } = createTemplate().render();
      const { fragment: f2, dispose: d2 } = createTemplate().render();

      document.body.appendChild(f1);
      document.body.appendChild(f2);

      const div1 = document.body.children[0] as HTMLDivElement;
      const div2 = document.body.children[1] as HTMLDivElement;

      assert.strictEqual(div1.textContent, "0");
      assert.strictEqual(div2.textContent, "0");

      // Update signal - both should react
      count.value = 42;

      assert.strictEqual(div1.textContent, "42");
      assert.strictEqual(div2.textContent, "42");

      // Dispose one, other should still work
      d1();
      count.value = 100;

      assert.strictEqual(div2.textContent, "100");

      d2();
      document.body.innerHTML = "";
    });

    it("should handle multiple bindings per cached template", () => {
      document.body.innerHTML = "";
      const name = signal("World");
      const cls = signal("greeting");

      function createTemplate() {
        return html`<div class=${() => cls.value}>
          <span>Hello, ${() => name.value}!</span>
        </div>`;
      }

      const { fragment: f1, dispose: d1 } = createTemplate().render();
      const { fragment: f2, dispose: d2 } = createTemplate().render();

      document.body.appendChild(f1);
      document.body.appendChild(f2);

      const div1 = document.body.children[0] as HTMLDivElement;
      const div2 = document.body.children[1] as HTMLDivElement;

      assert.strictEqual(div1.className, "greeting");
      assert.strictEqual(div2.className, "greeting");
      assert.ok(div1.textContent?.includes("Hello, World!"));
      assert.ok(div2.textContent?.includes("Hello, World!"));

      // Update signals
      name.value = "Cached";
      cls.value = "updated";

      assert.strictEqual(div1.className, "updated");
      assert.strictEqual(div2.className, "updated");
      assert.ok(div1.textContent?.includes("Hello, Cached!"));
      assert.ok(div2.textContent?.includes("Hello, Cached!"));

      d1();
      d2();
      document.body.innerHTML = "";
    });

    it("should preserve SVG namespace after cloning", () => {
      function createTemplate() {
        return html`<svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" />
        </svg>`;
      }

      const { fragment: f1, dispose: d1 } = createTemplate().render();
      const { fragment: f2, dispose: d2 } = createTemplate().render();

      const svg1 = f1.firstChild as SVGSVGElement;
      const svg2 = f2.firstChild as SVGSVGElement;
      const circle1 = svg1.querySelector("circle");
      const circle2 = svg2.querySelector("circle");

      // Both should have SVG namespace
      assert.strictEqual(svg1.namespaceURI, "http://www.w3.org/2000/svg");
      assert.strictEqual(svg2.namespaceURI, "http://www.w3.org/2000/svg");
      assert.strictEqual(circle1?.namespaceURI, "http://www.w3.org/2000/svg");
      assert.strictEqual(circle2?.namespaceURI, "http://www.w3.org/2000/svg");

      d1();
      d2();
    });

    it("should handle event bindings in cached templates", () => {
      document.body.innerHTML = "";
      let clickCount1 = 0;
      let clickCount2 = 0;

      function createTemplate(onClick: () => void) {
        return html`<button @click=${onClick}>Click</button>`;
      }

      const { fragment: f1, dispose: d1 } = createTemplate(
        () => clickCount1++,
      ).render();
      const { fragment: f2, dispose: d2 } = createTemplate(
        () => clickCount2++,
      ).render();

      document.body.appendChild(f1);
      document.body.appendChild(f2);

      const btn1 = document.body.children[0] as HTMLButtonElement;
      const btn2 = document.body.children[1] as HTMLButtonElement;

      btn1.click();
      assert.strictEqual(clickCount1, 1);
      assert.strictEqual(clickCount2, 0);

      btn2.click();
      btn2.click();
      assert.strictEqual(clickCount1, 1);
      assert.strictEqual(clickCount2, 2);

      d1();
      d2();
      document.body.innerHTML = "";
    });

    it("should handle property bindings in cached templates", () => {
      function createTemplate(value: string) {
        return html`<input .value=${value} />`;
      }

      const { fragment: f1, dispose: d1 } = createTemplate("first").render();
      const { fragment: f2, dispose: d2 } = createTemplate("second").render();

      const input1 = f1.firstChild as HTMLInputElement;
      const input2 = f2.firstChild as HTMLInputElement;

      assert.strictEqual(input1.value, "first");
      assert.strictEqual(input2.value, "second");

      d1();
      d2();
    });

    it("should handle nested templates with caching", () => {
      const show = signal(true);

      function createInner() {
        return html`<span class="inner">Inner</span>`;
      }

      function createOuter() {
        return html`<div class="outer">
          ${() => (show.value ? createInner() : null)}
        </div>`;
      }

      const { fragment: f1, dispose: d1 } = createOuter().render();
      const { fragment: f2, dispose: d2 } = createOuter().render();

      document.body.appendChild(f1);
      document.body.appendChild(f2);

      // Both should show inner
      assert.strictEqual(document.querySelectorAll(".inner").length, 2);

      // Toggle off
      show.value = false;
      assert.strictEqual(document.querySelectorAll(".inner").length, 0);

      // Toggle on
      show.value = true;
      assert.strictEqual(document.querySelectorAll(".inner").length, 2);

      d1();
      d2();
      document.body.innerHTML = "";
    });

    it("should handle multi-part attribute bindings with caching", () => {
      const part1 = signal("hello");
      const part2 = signal("world");

      function createTemplate() {
        return html`<div
          class="static ${() => part1.value} ${() => part2.value}"
        ></div>`;
      }

      const { fragment: f1, dispose: d1 } = createTemplate().render();
      const { fragment: f2, dispose: d2 } = createTemplate().render();

      document.body.appendChild(f1);
      document.body.appendChild(f2);

      const div1 = document.body.children[0] as HTMLDivElement;
      const div2 = document.body.children[1] as HTMLDivElement;

      assert.strictEqual(div1.className, "static hello world");
      assert.strictEqual(div2.className, "static hello world");

      part1.value = "foo";
      assert.strictEqual(div1.className, "static foo world");
      assert.strictEqual(div2.className, "static foo world");

      part2.value = "bar";
      assert.strictEqual(div1.className, "static foo bar");
      assert.strictEqual(div2.className, "static foo bar");

      d1();
      d2();
      document.body.innerHTML = "";
    });

    it("should work with each() plugin and caching", () => {
      document.body.innerHTML = "";
      const items = signal([
        { id: 1, name: "A" },
        { id: 2, name: "B" },
        { id: 3, name: "C" },
      ]);

      function createTemplate() {
        return html`<ul>
          ${each(
            items,
            (i) => i.id,
            (item) => html`<li>${() => item.value.name}</li>`,
          )}
        </ul>`;
      }

      const { fragment: f1, dispose: d1 } = createTemplate().render();
      const { fragment: f2, dispose: d2 } = createTemplate().render();

      document.body.appendChild(f1);
      document.body.appendChild(f2);

      const ul1 = document.body.children[0] as HTMLUListElement;
      const ul2 = document.body.children[1] as HTMLUListElement;

      assert.strictEqual(ul1.querySelectorAll("li").length, 3);
      assert.strictEqual(ul2.querySelectorAll("li").length, 3);

      // Update items
      items.value = [
        { id: 2, name: "B-updated" },
        { id: 1, name: "A-updated" },
      ];

      assert.strictEqual(ul1.querySelectorAll("li").length, 2);
      assert.strictEqual(ul2.querySelectorAll("li").length, 2);

      // Check content updated
      assert.strictEqual(ul1.children[0]?.textContent, "B-updated");
      assert.strictEqual(ul1.children[1]?.textContent, "A-updated");
      assert.strictEqual(ul2.children[0]?.textContent, "B-updated");
      assert.strictEqual(ul2.children[1]?.textContent, "A-updated");

      d1();
      d2();
      document.body.innerHTML = "";
    });

    it("should create different cache entries for different template strings", () => {
      // These have different static parts, so should be cached separately
      const t1 = html`<div class="first">A</div>`;
      const t2 = html`<div class="second">B</div>`;

      const { fragment: f1, dispose: d1 } = t1.render();
      const { fragment: f2, dispose: d2 } = t2.render();

      assert.strictEqual((f1.firstChild as Element).className, "first");
      assert.strictEqual((f2.firstChild as Element).className, "second");

      d1();
      d2();
    });

    it("should handle boolean/null/undefined values in cached templates", () => {
      const show = signal<boolean | null | undefined>(true);

      function createTemplate() {
        return html`<div>
          ${() => show.value && html`<span>Visible</span>`}
        </div>`;
      }

      const { fragment, dispose } = createTemplate().render();
      document.body.appendChild(fragment);

      const div = document.body.firstChild as HTMLDivElement;
      assert.strictEqual(div.querySelector("span")?.textContent, "Visible");

      show.value = false;
      assert.strictEqual(div.querySelector("span"), null);

      show.value = null;
      assert.strictEqual(div.querySelector("span"), null);

      show.value = undefined;
      assert.strictEqual(div.querySelector("span"), null);

      show.value = true;
      assert.strictEqual(div.querySelector("span")?.textContent, "Visible");

      dispose();
      document.body.innerHTML = "";
    });

    it("should properly dispose all bindings from cached templates", () => {
      const count = signal(0);
      let computedCalls = 0;

      function createTemplate() {
        return html`<div>
          ${() => {
            computedCalls++;
            return count.value;
          }}
        </div>`;
      }

      const { dispose } = createTemplate().render();

      // Initial render
      assert.strictEqual(computedCalls, 1);

      // Should still react
      count.value = 1;
      assert.strictEqual(computedCalls, 2);

      // Dispose
      dispose();

      // Should not react anymore
      count.value = 2;
      assert.strictEqual(computedCalls, 2);
    });

    it("should handle rendering same Template instance multiple times", () => {
      document.body.innerHTML = "";
      const cls = signal("a");
      const count = signal(0);

      // Create a single template instance with multi-part attribute
      const template = html`<div class="prefix ${() => cls.value} suffix">
        ${() => count.value}
      </div>`;

      // Render it twice from the same template instance
      const { fragment: f1, dispose: d1 } = template.render();
      const { fragment: f2, dispose: d2 } = template.render();

      document.body.appendChild(f1);
      document.body.appendChild(f2);

      const div1 = document.body.children[0] as HTMLDivElement;
      const div2 = document.body.children[1] as HTMLDivElement;

      // Both should have correct initial values
      assert.strictEqual(div1.className, "prefix a suffix");
      assert.strictEqual(div2.className, "prefix a suffix");
      assert.ok(div1.textContent?.includes("0"));
      assert.ok(div2.textContent?.includes("0"));

      // Update signals - both should react
      cls.value = "b";
      count.value = 42;

      assert.strictEqual(div1.className, "prefix b suffix");
      assert.strictEqual(div2.className, "prefix b suffix");
      assert.ok(div1.textContent?.includes("42"));
      assert.ok(div2.textContent?.includes("42"));

      d1();
      d2();
      document.body.innerHTML = "";
    });

    it("should keep second render reactive after first render is disposed", () => {
      document.body.innerHTML = "";
      const cls = signal("a");

      // Create a single template instance with multi-part attribute
      const template = html`<div
        class="prefix ${() => cls.value} middle ${() => cls.value} suffix"
      ></div>`;

      // Render it twice from the same template instance
      const { fragment: f1, dispose: d1 } = template.render();
      const { fragment: f2, dispose: d2 } = template.render();

      document.body.appendChild(f1);
      document.body.appendChild(f2);

      const div1 = document.body.children[0] as HTMLDivElement;
      const div2 = document.body.children[1] as HTMLDivElement;

      // Both should have correct initial values
      assert.strictEqual(div1.className, "prefix a middle a suffix");
      assert.strictEqual(div2.className, "prefix a middle a suffix");

      // Dispose the first render
      d1();

      // Update signal - second should still react!
      cls.value = "b";

      // Second render should still be reactive
      assert.strictEqual(div2.className, "prefix b middle b suffix");

      d2();
      document.body.innerHTML = "";
    });
  });

  describe("GridCell-style component pattern", () => {
    it("should render cells with conditional special badges", () => {
      const cells = signal([
        { id: 1, specialLabel: "×2", value: signal(10) },
        { id: 2, specialLabel: null as string | null, value: signal(20) },
        { id: 3, specialLabel: "MAX", value: signal(30) },
      ]);

      function GridCell(props: {
        cell: {
          id: number;
          specialLabel: string | null;
          value: ReturnType<typeof signal<number>>;
        };
      }) {
        const { cell } = props;
        const displayValue = cell.value;
        const cellClass = computed(() => "cell");

        return html`
          <div class=${cellClass} data-cell-id=${cell.id}>
            ${cell.specialLabel
              ? html`<div class="special-badge">${cell.specialLabel}</div>`
              : ""}
            <div class="cell-value">${displayValue}</div>
          </div>
        `;
      }

      const template = html`
        <div class="grid">
          ${each(
            cells,
            (cell) => cell.id,
            (cell) => GridCell({ cell: cell.value }),
          )}
        </div>
      `;

      const { fragment, dispose } = template.render();
      const grid = fragment.firstElementChild;
      assert.ok(grid, "grid should exist");

      // Check we have 3 cells
      const cellDivs = grid.querySelectorAll("[data-cell-id]");
      assert.strictEqual(cellDivs.length, 3, "should have 3 cells");

      // Check first cell has special badge
      const cell1 = grid.querySelector('[data-cell-id="1"]');
      const badge1 = cell1?.querySelector(".special-badge");
      assert.ok(badge1, "cell 1 should have special badge");
      assert.strictEqual(badge1?.textContent, "×2");

      // Check second cell has no special badge
      const cell2 = grid.querySelector('[data-cell-id="2"]');
      const badge2 = cell2?.querySelector(".special-badge");
      assert.ok(!badge2, "cell 2 should not have special badge");

      // Check third cell has special badge
      const cell3 = grid.querySelector('[data-cell-id="3"]');
      const badge3 = cell3?.querySelector(".special-badge");
      assert.ok(badge3, "cell 3 should have special badge");
      assert.strictEqual(badge3?.textContent, "MAX");

      dispose();
    });
  });

  describe("path resolution edge cases", () => {
    it("should handle multiple consecutive slots", () => {
      const a = signal("A");
      const b = signal("B");
      const c = signal("C");

      const template = html`<div>${a}${b}${c}</div>`;
      const { fragment, dispose } = template.render();

      const div = fragment.firstChild as HTMLDivElement;
      assert.strictEqual(div.textContent, "ABC");

      a.value = "X";
      b.value = "Y";
      c.value = "Z";
      assert.strictEqual(div.textContent, "XYZ");

      dispose();
    });

    it("should handle slot followed by element with slot", () => {
      const outer = signal("outer");
      const inner = signal("inner");

      const template = html`<div>${outer}<span>${inner}</span></div>`;
      const { fragment, dispose } = template.render();

      const div = fragment.firstChild as HTMLDivElement;
      assert.ok(div.textContent?.includes("outer"));
      assert.ok(div.querySelector("span")?.textContent?.includes("inner"));

      outer.value = "OUTER";
      inner.value = "INNER";
      assert.ok(div.textContent?.includes("OUTER"));
      assert.ok(div.querySelector("span")?.textContent?.includes("INNER"));

      dispose();
    });

    it("should handle deeply nested slots with siblings", () => {
      const a = signal("A");
      const b = signal("B");
      const c = signal("C");
      const d = signal("D");

      const template = html`
        <div>
          ${a}
          <div>
            ${b}
            <div>
              ${c}
              <span>${d}</span>
            </div>
          </div>
        </div>
      `;
      const { fragment, dispose } = template.render();

      const div = fragment.firstElementChild as HTMLDivElement;
      assert.ok(div.textContent?.includes("A"));
      assert.ok(div.textContent?.includes("B"));
      assert.ok(div.textContent?.includes("C"));
      assert.ok(div.textContent?.includes("D"));

      a.value = "1";
      b.value = "2";
      c.value = "3";
      d.value = "4";

      assert.ok(div.textContent?.includes("1"));
      assert.ok(div.textContent?.includes("2"));
      assert.ok(div.textContent?.includes("3"));
      assert.ok(div.textContent?.includes("4"));

      dispose();
    });

    it("should handle multiple elements each with slots", () => {
      const vals = [signal("A"), signal("B"), signal("C")];

      const template = html`
        <div>
          <span class="first">${vals[0]}</span>
          <span class="second">${vals[1]}</span>
          <span class="third">${vals[2]}</span>
        </div>
      `;
      const { fragment, dispose } = template.render();

      const div = fragment.firstElementChild as HTMLDivElement;
      assert.strictEqual(div.querySelector(".first")?.textContent, "A");
      assert.strictEqual(div.querySelector(".second")?.textContent, "B");
      assert.strictEqual(div.querySelector(".third")?.textContent, "C");

      vals[0]!.value = "X";
      vals[1]!.value = "Y";
      vals[2]!.value = "Z";

      assert.strictEqual(div.querySelector(".first")?.textContent, "X");
      assert.strictEqual(div.querySelector(".second")?.textContent, "Y");
      assert.strictEqual(div.querySelector(".third")?.textContent, "Z");

      dispose();
    });

    it("should handle slot inserting template before element with slot", () => {
      const showBadge = signal(true);
      const value = signal(42);

      const template = html`
        <div>
          ${() =>
            showBadge.value ? html`<span class="badge">Badge</span>` : ""}
          <div class="value">${value}</div>
        </div>
      `;
      const { fragment, dispose } = template.render();

      const div = fragment.firstElementChild as HTMLDivElement;
      assert.ok(div.querySelector(".badge"), "badge should exist");
      assert.strictEqual(div.querySelector(".value")?.textContent, "42");

      // Toggle badge off
      showBadge.value = false;
      assert.ok(!div.querySelector(".badge"), "badge should be gone");
      assert.strictEqual(div.querySelector(".value")?.textContent, "42");

      // Update value while badge is off
      value.value = 100;
      assert.strictEqual(div.querySelector(".value")?.textContent, "100");

      // Toggle badge back on
      showBadge.value = true;
      assert.ok(div.querySelector(".badge"), "badge should be back");
      assert.strictEqual(div.querySelector(".value")?.textContent, "100");

      dispose();
    });

    it("should handle array of templates followed by element with slot", () => {
      const items = signal(["A", "B"]);
      const footer = signal("Footer");

      const template = html`
        <div>
          ${() => items.value.map((i) => html`<span class="item">${i}</span>`)}
          <div class="footer">${footer}</div>
        </div>
      `;
      const { fragment, dispose } = template.render();

      const div = fragment.firstElementChild as HTMLDivElement;
      assert.strictEqual(div.querySelectorAll(".item").length, 2);
      assert.strictEqual(div.querySelector(".footer")?.textContent, "Footer");

      // Update array
      items.value = ["X", "Y", "Z"];
      assert.strictEqual(div.querySelectorAll(".item").length, 3);
      assert.strictEqual(div.querySelector(".footer")?.textContent, "Footer");

      // Update footer
      footer.value = "End";
      assert.strictEqual(div.querySelector(".footer")?.textContent, "End");

      dispose();
    });
  });
});
