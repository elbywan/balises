import { describe, it } from "node:test";
import assert from "node:assert";
import { html as baseHtml } from "../src/template.js";
import eachPlugin, { each } from "../src/each.js";
import { signal } from "../src/signals/index.js";

const html = baseHtml.with(eachPlugin);

describe("each() edge cases - potential bugs", () => {
  // BUG 1: undefined as a valid key
  // The algorithm uses undefined as a sentinel, so this could cause issues
  it("should handle undefined as a key value (degenerates to all duplicates)", () => {
    const items = signal([
      { id: undefined, name: "A" },
      { id: undefined, name: "B" },
      { id: undefined, name: "C" },
    ]);

    // All items have undefined as key - should warn and only render first
    const warnCalls: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnCalls.push(msg);

    try {
      const { fragment } = html`<ul>
        ${each(
          items,
          (i) => i.id,
          (i) => html`<li>${() => i.value.name}</li>`,
        )}
      </ul>`.render();

      document.body.appendChild(fragment);
      const ul = document.body.querySelector("ul")!;

      // Should only render first item (others are duplicates)
      assert.strictEqual(ul.children.length, 1);
      assert.strictEqual(ul.children[0]!.textContent, "A");
      assert.ok(warnCalls.some((w) => w.includes("Duplicate key")));

      ul.remove();
    } finally {
      console.warn = originalWarn;
    }
  });

  // BUG 2: null as a key (distinct from undefined)
  it("should handle null as a key value", () => {
    const items = signal([
      { id: null, name: "NullItem" },
      { id: 1, name: "One" },
    ]);

    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (i) =>
          html`<li data-id="${String(i.peek().id)}">${() => i.value.name}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    assert.strictEqual(ul.children.length, 2);
    assert.strictEqual(ul.children[0]!.getAttribute("data-id"), "null");
    assert.strictEqual(ul.children[0]!.textContent, "NullItem");

    // Update - swap order
    items.value = [
      { id: 1, name: "One" },
      { id: null, name: "NullItem" },
    ];

    assert.strictEqual(ul.children.length, 2);
    assert.strictEqual(ul.children[0]!.getAttribute("data-id"), "1");
    assert.strictEqual(ul.children[1]!.getAttribute("data-id"), "null");

    ul.remove();
  });

  // BUG 3: Empty template (no nodes)
  it("should handle renderFn returning empty content", () => {
    const items = signal([
      { id: 1, show: false },
      { id: 2, show: true },
      { id: 3, show: false },
    ]);

    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (i) => (i.peek().show ? html`<li>${i.peek().id}</li>` : html``),
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    // Only item 2 should have visible content
    assert.strictEqual(ul.querySelectorAll("li").length, 1);
    assert.strictEqual(ul.querySelector("li")!.textContent, "2");

    // Reorder - this exercises getFirstNode/getNodeAfter with empty entries
    items.value = [
      { id: 3, show: false },
      { id: 1, show: false },
      { id: 2, show: true },
    ];

    assert.strictEqual(ul.querySelectorAll("li").length, 1);
    assert.strictEqual(ul.querySelector("li")!.textContent, "2");

    ul.remove();
  });

  // BUG 4: Multiple consecutive inserts at the end
  it("should handle multiple new items appended at once", () => {
    const items = signal([{ id: 1, name: "A" }]);

    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (i) => html`<li data-id="${i.peek().id}">${() => i.value.name}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    // Append multiple items
    items.value = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 3, name: "C" },
      { id: 4, name: "D" },
    ];

    const result = [...ul.children].map((c) => c.getAttribute("data-id"));
    assert.deepStrictEqual(result, ["1", "2", "3", "4"]);

    ul.remove();
  });

  // BUG 5: Multiple consecutive inserts at the beginning
  it("should handle multiple new items prepended at once", () => {
    const items = signal([{ id: 4, name: "D" }]);

    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (i) => html`<li data-id="${i.peek().id}">${() => i.value.name}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    // Prepend multiple items
    items.value = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 3, name: "C" },
      { id: 4, name: "D" },
    ];

    const result = [...ul.children].map((c) => c.getAttribute("data-id"));
    assert.deepStrictEqual(result, ["1", "2", "3", "4"]);

    ul.remove();
  });

  // BUG 6: Multiple consecutive inserts in the middle
  it("should handle multiple new items inserted in the middle", () => {
    const items = signal([
      { id: 1, name: "A" },
      { id: 5, name: "E" },
    ]);

    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (i) => html`<li data-id="${i.peek().id}">${() => i.value.name}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    // Insert multiple items in middle
    items.value = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 3, name: "C" },
      { id: 4, name: "D" },
      { id: 5, name: "E" },
    ];

    const result = [...ul.children].map((c) => c.getAttribute("data-id"));
    assert.deepStrictEqual(result, ["1", "2", "3", "4", "5"]);

    ul.remove();
  });

  // BUG 7: Object keys (reference equality)
  it("should handle object keys correctly", () => {
    const keyA = { type: "a" };
    const keyB = { type: "b" };
    const keyC = { type: "c" };

    const items = signal([
      { key: keyA, name: "A" },
      { key: keyB, name: "B" },
      { key: keyC, name: "C" },
    ]);

    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.key,
        (i) => html`<li>${() => i.value.name}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;
    const originalNodes = [...ul.children];

    assert.strictEqual(ul.children.length, 3);

    // Reverse using same key objects
    items.value = [
      { key: keyC, name: "C" },
      { key: keyB, name: "B" },
      { key: keyA, name: "A" },
    ];

    // Nodes should be reused (same object references as keys)
    assert.strictEqual(ul.children[0], originalNodes[2]);
    assert.strictEqual(ul.children[1], originalNodes[1]);
    assert.strictEqual(ul.children[2], originalNodes[0]);

    ul.remove();
  });

  // BUG 8: Symbol keys
  it("should handle Symbol keys correctly", () => {
    const symA = Symbol("a");
    const symB = Symbol("b");

    const items = signal([
      { key: symA, name: "A" },
      { key: symB, name: "B" },
    ]);

    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.key,
        (i) => html`<li>${() => i.value.name}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    assert.strictEqual(ul.children.length, 2);
    assert.strictEqual(ul.children[0]!.textContent, "A");
    assert.strictEqual(ul.children[1]!.textContent, "B");

    // Swap
    items.value = [
      { key: symB, name: "B" },
      { key: symA, name: "A" },
    ];

    assert.strictEqual(ul.children[0]!.textContent, "B");
    assert.strictEqual(ul.children[1]!.textContent, "A");

    ul.remove();
  });

  // BUG 9: NaN keys (NaN !== NaN, but Map uses SameValueZero)
  it("should handle NaN keys correctly", () => {
    const items = signal([
      { id: NaN, name: "NaN1" },
      { id: 1, name: "One" },
    ]);

    // NaN === NaN is false, but Map uses SameValueZero which treats NaN === NaN
    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (i) => html`<li>${() => i.value.name}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    assert.strictEqual(ul.children.length, 2);
    assert.strictEqual(ul.children[0]!.textContent, "NaN1");

    // Update NaN item
    items.value = [
      { id: NaN, name: "NaN-Updated" },
      { id: 1, name: "One" },
    ];

    // Should reuse the node (Map handles NaN correctly)
    assert.strictEqual(ul.children[0]!.textContent, "NaN-Updated");

    ul.remove();
  });

  // BUG 10: Very large list
  it("should handle large lists without stack overflow", () => {
    const size = 10000;
    const initialItems = Array.from({ length: size }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
    }));

    const items = signal(initialItems);

    const { fragment, dispose } = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (i) => html`<li>${i.peek().id}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    assert.strictEqual(ul.children.length, size);

    // Reverse the entire list
    items.value = [...initialItems].reverse();

    assert.strictEqual(ul.children.length, size);
    assert.strictEqual(ul.children[0]!.textContent, String(size - 1));
    assert.strictEqual(ul.children[size - 1]!.textContent, "0");

    dispose();
    ul.remove();
  });

  // BUG 11: Removing all and re-adding
  it("should handle clear then re-add", () => {
    const items = signal([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);

    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (i) => html`<li data-id="${i.peek().id}">${() => i.value.name}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    // Clear
    items.value = [];
    assert.strictEqual(ul.children.length, 0);

    // Re-add same keys
    items.value = [
      { id: 1, name: "A-new" },
      { id: 2, name: "B-new" },
    ];

    assert.strictEqual(ul.children.length, 2);
    assert.strictEqual(ul.children[0]!.textContent, "A-new");
    assert.strictEqual(ul.children[1]!.textContent, "B-new");

    ul.remove();
  });

  // BUG 12: Single item list operations
  it("should handle single item list correctly", () => {
    const items = signal([{ id: 1, name: "Only" }]);

    const { fragment } = html`<ul>
      ${each(
        items,
        (i) => i.id,
        (i) => html`<li>${() => i.value.name}</li>`,
      )}
    </ul>`.render();

    document.body.appendChild(fragment);
    const ul = document.body.querySelector("ul")!;

    assert.strictEqual(ul.children.length, 1);

    // Replace single item with different key
    items.value = [{ id: 2, name: "New" }];
    assert.strictEqual(ul.children.length, 1);
    assert.strictEqual(ul.children[0]!.textContent, "New");

    // Back to original
    items.value = [{ id: 1, name: "Back" }];
    assert.strictEqual(ul.children[0]!.textContent, "Back");

    ul.remove();
  });
});
