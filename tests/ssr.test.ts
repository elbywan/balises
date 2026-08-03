import { describe, it } from "node:test";
import assert from "node:assert";
import { html, signal, computed } from "../src/index.js";
import { each } from "../src/each.js";
import { when, match } from "../src/match.js";
import { memo } from "../src/memo.js";
import {
  renderToString,
  renderToStringAsync,
  serializeState,
} from "../src/ssr.js";
import { deserializeState } from "../src/hydrate.js";

describe("renderToString", () => {
  it("should export the state serialization helpers", () => {
    assert.strictEqual(typeof serializeState, "function");
    assert.strictEqual(serializeState({ a: 1 }), '{"a":1}');
    // "<" is escaped so a hostile string cannot break out of a script tag.
    assert.ok(serializeState({ x: "</script>" }).includes("\\u003c"));
    const el = document.createElement("script");
    el.textContent = serializeState({ a: 1 });
    assert.deepStrictEqual(deserializeState(el), { a: 1 });
    assert.strictEqual(deserializeState(null), null);
    el.textContent = "{broken";
    assert.strictEqual(deserializeState(el), null);
  });

  it("should render static content", () => {
    assert.strictEqual(
      renderToString(html`<div>Hello</div>`),
      "<div>Hello</div>",
    );
    assert.strictEqual(renderToString(html`Hello World`), "Hello World");
  });

  it("should render text content slots with current values", () => {
    const count = signal(0);
    assert.strictEqual(
      renderToString(html`<p>Count: ${count}</p>`),
      "<p>Count: <!--b-->0<!--/b--></p>",
    );
    count.value = 42;
    assert.strictEqual(
      renderToString(html`<p>Count: ${count}</p>`),
      "<p>Count: <!--b-->42<!--/b--></p>",
    );
  });

  it("should render computed and function values once", () => {
    const a = signal(2);
    const doubled = computed(() => a.value * 2);
    assert.strictEqual(
      renderToString(html`<p>${doubled}</p>`),
      "<p><!--b-->4<!--/b--></p>",
    );
    assert.strictEqual(
      renderToString(html`<p>${() => a.value + 1}</p>`),
      "<p><!--b-->3<!--/b--></p>",
    );
  });

  it("should render nothing for null, undefined and booleans", () => {
    assert.strictEqual(
      renderToString(html`<p>${null}${undefined}${true}${false}</p>`),
      "<p><!--b--><!--/b--><!--b--><!--/b--><!--b--><!--/b--><!--b--><!--/b--></p>",
    );
  });

  it("should render static and reactive attributes", () => {
    const cls = signal("active");
    assert.strictEqual(
      renderToString(html`<div class="box ${cls}" id="main"></div>`),
      '<div class="box active" id="main"></div>',
    );
    assert.strictEqual(
      renderToString(html`<div data-n=${5}></div>`),
      '<div data-n="5"></div>',
    );
  });

  it("should skip event and property bindings", () => {
    assert.strictEqual(
      renderToString(html`<button @click=${() => {}}>x</button>`),
      "<button>x</button>",
    );
    assert.strictEqual(
      renderToString(html`<input .value=${"v"} />`),
      "<input>",
    );
  });

  it("should escape text and attribute values", () => {
    assert.strictEqual(
      renderToString(html`<p>${"<b>&amp;"}</p>`),
      "<p><!--b-->&lt;b&gt;&amp;amp;<!--/b--></p>",
    );
    assert.strictEqual(
      renderToString(html`<div title=${'"quoted"'}></div>`),
      '<div title="&quot;quoted&quot;"></div>',
    );
  });

  it("should render nested templates and arrays", () => {
    const x = signal(5);
    assert.strictEqual(
      renderToString(html`<div>${html`<span>${x}</span>`}</div>`),
      "<div><!--b--><span><!--b-->5<!--/b--></span><!--/b--></div>",
    );
    assert.strictEqual(
      renderToString(html`<p>${[html`<i>1</i>`, "two"]}</p>`),
      "<p><!--b--><i>1</i>two<!--/b--></p>",
    );
  });

  it("should render void elements without closing tags", () => {
    assert.strictEqual(
      renderToString(html`<div>a<br />b<img src="x" /></div>`),
      '<div>a<br>b<img src="x"></div>',
    );
  });

  it("should render keyed each() lists with row markers", () => {
    const items = signal([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    assert.strictEqual(
      renderToString(
        html`<ul>
          ${each(
            items,
            (i) => i.id,
            (s) => html`<li>${s.value.name}</li>`,
          )}
        </ul>`,
      ),
      "<ul>\n          <!--b--><!--k--><li><!--b-->a<!--/b--></li><!--k--><li><!--b-->b<!--/b--></li><!--/b-->\n        </ul>",
    );
  });

  it("should render when() and match() branches", () => {
    const show = signal(true);
    assert.strictEqual(
      renderToString(
        html`<div>
          ${when(
            () => show.value,
            [() => html`<span>A</span>`, () => html`<span>B</span>`],
          )}
        </div>`,
      ),
      "<div>\n          <!--b--><span>A</span><!--/b-->\n        </div>",
    );
    const mode = signal<"a" | "b">("b");
    assert.strictEqual(
      renderToString(
        html`<div>
          ${match(() => mode.value, {
            a: () => html`<span>A</span>`,
            b: () => html`<span>B</span>`,
          })}
        </div>`,
      ),
      "<div>\n          <!--b--><span>B</span><!--/b-->\n        </div>",
    );
  });

  it("should not treat Object.prototype keys as match cases", () => {
    const key = signal<string>("nope");
    const template = html`<div>
      ${match(() => key.value, {
        a: () => html`<span class="ma">A</span>`,
        _: () => html`<span class="fallback">F</span>`,
      })}
    </div>`;
    // "toString" is on Object.prototype - must hit the default case,
    // not crash by calling the inherited function as a factory.
    assert.strictEqual(
      renderToString(template),
      '<div>\n      <!--b--><span class="fallback">F</span><!--/b-->\n    </div>',
    );
    key.value = "toString";
    assert.strictEqual(
      renderToString(template),
      '<div>\n      <!--b--><span class="fallback">F</span><!--/b-->\n    </div>',
    );
    key.value = "a";
    assert.strictEqual(
      renderToString(template),
      '<div>\n      <!--b--><span class="ma">A</span><!--/b-->\n    </div>',
    );
  });

  it("should render memoized components", () => {
    const Card = memo(({ name }: { name: string }) => html`<b>${name}</b>`);
    assert.strictEqual(
      renderToString(html`<div>${Card({ name: "x" })}</div>`),
      "<div><!--b--><b><!--b-->x<!--/b--></b><!--/b--></div>",
    );
  });

  it("should throw on async generators in sync mode", () => {
    assert.throws(() => {
      renderToString(
        html`<div>
          ${async function* () {
            yield html`<span>loading</span>`;
            return html`<span>done</span>`;
          }}
        </div>`,
      );
    }, /renderToStringAsync/);
  });
});

describe("renderToStringAsync", () => {
  it("should render the final content of an async generator", async () => {
    const htmlString = await renderToStringAsync(
      html`<div>
        ${async function* () {
          yield html`<span>loading</span>`;
          return html`<span>done</span>`;
        }}
      </div>`,
    );
    assert.strictEqual(
      htmlString,
      "<div>\n        <!--b--><span>done</span><!--/b-->\n      </div>",
    );
  });

  it("should use the last yield when the generator returns undefined", async () => {
    const htmlString = await renderToStringAsync(
      html`<div>
        ${async function* () {
          yield html`<span>first</span>`;
          yield html`<span>second</span>`;
        }}
      </div>`,
    );
    assert.strictEqual(
      htmlString,
      "<div>\n        <!--b--><span>second</span><!--/b-->\n      </div>",
    );
  });

  it("should handle async generators nested in each() rows", async () => {
    const items = signal([{ id: 1 }, { id: 2 }]);
    const htmlString = await renderToStringAsync(
      html`<ul>
        ${each(
          items,
          (i) => i.id,
          (s) =>
            html`<li>
              ${async function* () {
                yield s.value.id;
              }}
            </li>`,
        )}
      </ul>`,
    );
    assert.strictEqual(
      htmlString,
      "<ul>\n        <!--b--><!--k--><li>\n              <!--b-->1<!--/b-->\n            </li><!--k--><li>\n              <!--b-->2<!--/b-->\n            </li><!--/b-->\n      </ul>",
    );
  });

  it("should mix sync and async slots", async () => {
    const count = signal(7);
    const htmlString = await renderToStringAsync(
      html`<p>
        ${count}|${async function* () {
          yield html`<b>async</b>`;
        }}
      </p>`,
    );
    assert.strictEqual(
      htmlString,
      "<p>\n        <!--b-->7<!--/b-->|<!--b--><b>async</b><!--/b-->\n      </p>",
    );
  });
});
