import { describe, it } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Simulate a production build environment: bundlers replace
// `process.env.NODE_ENV` with `"production"` before minification, so the
// development-mode guard folds to `false` and the HMR machinery degrades
// to plain replace semantics.
process.env.NODE_ENV = "production";

describe("hmr (production)", () => {
  it("should degrade to plain renders and full replaces", async () => {
    const { html } = await import("../src/template.js");
    const { mount } = await import("../src/hmr.js");
    const { signal } = await import("../src/signals/index.js");

    const container = document.createElement("div");
    document.body.appendChild(container);

    // renderTracked degrades to a plain render: no re-binding slots.
    const result = html`<p>${signal(1)}</p>`.renderTracked();
    assert.strictEqual(result.slots.length, 0);

    // rebind() refuses: every re-mount is a full replace, no state transfer.
    let count = signal(5);
    mount(container, html`<p>${count}</p>`);
    const p1 = container.querySelector("p");
    count.value = 7;

    count = signal(0);
    mount(container, html`<p>${count}</p>`);
    const p2 = container.querySelector("p");
    assert.notStrictEqual(p2, p1); // full replace
    assert.strictEqual(p2?.textContent, "0"); // no state transfer
  });

  it("should not crash without a process global (unbundled bundles)", () => {
    // The raw dist/esm keeps the `process.env.NODE_ENV` guard for each
    // consumer's bundler to replace — it requires a bundler. The pre-built
    // bundles have the guard folded at build time and must evaluate in a
    // bare browser (no `process`, no bundler). Built by `yarn build` (CI
    // runs build before test).
    const bundle = fileURLToPath(
      new URL("../dist/balises.esm.js", import.meta.url),
    );
    if (!existsSync(bundle)) return;

    const out = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `globalThis.process = undefined; await import(${JSON.stringify(bundle)});`,
      ],
      // Drop inherited loader flags (PnP preloads break without `process`).
      { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } },
    );
    assert.strictEqual(out, "");
  });
});
