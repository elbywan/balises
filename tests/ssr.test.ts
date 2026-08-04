import { describe, it } from "node:test";
import assert from "node:assert";
import { html, signal, computed } from "../src/index.js";
import { each } from "../src/each.js";
import { when, match } from "../src/match.js";
import { memo } from "../src/memo.js";
import {
  renderToString,
  renderToStringAsync,
  renderToStringStream,
  serializeState,
} from "../src/ssr.js";
import { deserializeState } from "../src/hydrate.js";
import type { AsyncGeneratorContext } from "../src/async.js";

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

describe("renderToStringStream", () => {
  const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

  it("should emit static content as a single chunk", async () => {
    const chunks: string[] = [];
    for await (const chunk of renderToStringStream(html`<p>hi</p>`)) {
      chunks.push(chunk);
    }
    assert.deepStrictEqual(chunks, ["<p>hi</p>"]);
  });

  it("should return the stream directly without state", () => {
    const stream = renderToStringStream(html`<p>hi</p>`);
    assert.strictEqual(typeof stream[Symbol.asyncIterator], "function");
  });

  it("should emit the shell before async content settles", async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const template = html`<main>
        ${async function* () {
        yield html`<p>loading</p>`;
        await gate;
        return html`<p>done</p>`;
      }}
      </main>
      <footer>foot</footer>`;

    // Manual iteration: the first chunk must arrive before the gate opens.
    const iterator = renderToStringStream(template)[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.strictEqual(first.done, false);
    assert.ok(first.value.includes("<main>"), "shell arrives first");
    assert.ok(!first.value.includes("done"), "async content not yet");

    resolve();
    let rest = "";
    for await (const chunk of iterator) rest += chunk;
    const expected = await renderToStringAsync(template); // Gate is open now.
    assert.strictEqual(first.value + rest, expected);
  });

  it("should emit chunks that are text prefixes of the final HTML", async () => {
    const template = html`<div>
      ${async function* () {
        yield html`<span>loading</span>`;
        return html`<span>done</span>`;
      }}
    </div>`;
    const expected = await renderToStringAsync(template);
    let acc = "";
    for await (const chunk of renderToStringStream(template)) {
      acc += chunk;
      assert.ok(expected.startsWith(acc), `chunk is a prefix: ${acc}`);
    }
    assert.strictEqual(acc, expected);
  });

  it("should emit async slots in order of appearance", async () => {
    const template = html`<div>
      ${async function* () {
        yield html`<span>A loading</span>`;
        await tick(30); // Slow slot: appears first in the template
        return html`<span>A</span>`;
      }}
      |
      ${async function* () {
        yield html`<span>B loading</span>`;
        await tick(5); // Fast slot: appears second in the template
        return html`<span>B</span>`;
      }}
    </div>`;
    const chunks: string[] = [];
    for await (const chunk of renderToStringStream(template)) {
      chunks.push(chunk);
    }
    assert.strictEqual(chunks.join(""), await renderToStringAsync(template));
    // Shell, then A (+ separator), then B (+ tail) - text order, not
    // resolution order.
    assert.strictEqual(chunks.length, 3);
    assert.ok(chunks[1]!.includes("<span>A</span>"));
    assert.ok(chunks[2]!.includes("<span>B</span>"));
  });

  it("should resolve nested generators", async () => {
    const template = html`<div>
      ${async function* () {
        yield html`<p>outer loading</p>`;
        return html`<section>
          ${async function* () {
            yield html`<i>inner loading</i>`;
            return html`<b>inner done</b>`;
          }}
        </section>`;
      }}
    </div>`;
    const chunks: string[] = [];
    for await (const chunk of renderToStringStream(template)) {
      chunks.push(chunk);
    }
    const htmlString = chunks.join("");
    assert.strictEqual(htmlString, await renderToStringAsync(template));
    // Outer shell, then the outer settled content (which introduces the
    // inner placeholder), then the inner content + tail.
    assert.ok(chunks.length >= 3);
    assert.ok(htmlString.includes("<b>inner done</b>"));
  });

  it("should match renderToStringAsync output for mixed content", async () => {
    const items = signal([{ id: 1 }, { id: 2 }]);
    const template = html`<ul>
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
    </ul>`;
    const expected = await renderToStringAsync(template);
    let htmlString = "";
    for await (const chunk of renderToStringStream(template)) {
      htmlString += chunk;
    }
    assert.strictEqual(htmlString, expected);
  });

  it("should return the payload with the state option", async () => {
    const user = signal("ada");
    const result = renderToStringStream(html`<p>${user}</p>`, {
      state: { user },
    });
    assert.strictEqual(typeof result.stream[Symbol.asyncIterator], "function");
    assert.deepStrictEqual(JSON.parse(result.payload), { user: "ada" });
    let htmlString = "";
    for await (const chunk of result.stream) htmlString += chunk;
    assert.strictEqual(htmlString, "<p><!--b-->ada<!--/b--></p>");
  });

  it("should pass a context with a live signal to generators", async () => {
    let seen: AbortSignal | undefined;
    let abortedDuringRun: boolean | undefined;
    const htmlString = await renderToStringAsync(
      html`<p>
        ${async function* (settled?: unknown, ctx?: AsyncGeneratorContext) {
        void settled;
        seen = ctx?.signal;
        abortedDuringRun = ctx?.signal.aborted;
        yield html`<span>ok</span>`;
      }}
      </p>`,
    );
    assert.ok(seen, "generator received a context");
    assert.strictEqual(abortedDuringRun, false);
    assert.strictEqual(typeof seen!.addEventListener, "function");
    // The render's signal aborts once the render completes (or is
    // cancelled), releasing anything wired to it.
    assert.strictEqual(seen!.aborted, true);
    assert.ok(htmlString.includes("ok"));
  });

  it("should abort in-flight generators when the consumer stops early", async () => {
    let aborted = false;
    const stream = renderToStringStream(
      html`<div>
        ${async function* (settled?: unknown, ctx?: AsyncGeneratorContext) {
        void settled;
        yield html`<p>loading</p>`;
        await new Promise<void>((resolve, reject) => {
          ctx!.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
        return html`<p>done</p>`;
      }}
      </div>`,
    );
    for await (const chunk of stream) {
      assert.ok(chunk.includes("<div>"));
      break; // Stop iterating: the render must cancel in-flight work.
    }
    await tick(20);
    assert.strictEqual(aborted, true);
  });
});
