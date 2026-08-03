/**
 * SSR examples end-to-end smoke.
 *
 * Loads the GENERATED pages + the BUILT bundle in jsdom (the exact path a
 * browser takes) and asserts the SSR invariants: markup adoption with zero
 * requests on matching URLs, single-card rendering on URL-mismatched
 * reloads (the doubling race), branch switching, and the client-only
 * fallback. Fetches are delayed to widen the hydration race windows.
 *
 * Run: yarn ssr:smoke
 */

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const FAILURES = [];
const results = [];

function check(label, ok, detail = "") {
  results.push(label);
  if (!ok) FAILURES.push(`${label} — ${detail}`);
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`,
  );
}

/** Fetch stub: delayed responses widen the hydration race windows. */
function makeFetch(requests) {
  return async (input) => {
    const u = String(input);
    requests.push(u);
    const m = /\/pokemon-species\/(\d+)/.exec(u) ?? /\/pokemon\/(\d+)/.exec(u);
    const id = Number(m?.[1] ?? 0);
    await new Promise((r) => setTimeout(r, 120 + (id % 5) * 25));
    if (u.includes("pokemon-species")) {
      return {
        ok: true,
        json: async () => ({
          names: [{ language: { name: "en" }, name: `Stub ${id}` }],
        }),
      };
    }
    if (u.includes("/pokemon/")) {
      return {
        ok: true,
        json: async () => ({
          id,
          name: `stub-${id}`,
          displayName: `Stub ${id}`,
          localizedNames: { en: `Stub ${id}` },
          sprites: { front_default: `s${id}.png`, front_shiny: `s${id}.png` },
          types: [{ type: { name: "normal", url: "" } }],
          stats: [
            "hp",
            "attack",
            "defense",
            "special-attack",
            "special-defense",
            "speed",
          ].map((n) => ({ base_stat: id, stat: { name: n } })),
          height: 7,
          weight: 69,
          cries: { latest: "cry.mp3" },
          species: { url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
        }),
      };
    }
    return { ok: true, json: async () => ({ results: [] }) };
  };
}

async function boot(page, url, requests) {
  const dom = new JSDOM(page, { url, runScripts: "outside-only" });
  const { window } = dom;
  for (const k of [
    "Node",
    "Comment",
    "Element",
    "HTMLElement",
    "Text",
    "DocumentFragment",
    "HTMLInputElement",
    "HTMLSelectElement",
    "CustomEvent",
    "Event",
    "customElements",
    "ShadowRoot",
    "CustomElementRegistry",
  ]) {
    globalThis[k] = window[k];
  }
  globalThis.document = window.document;
  globalThis.window = window;
  globalThis.history = window.history;
  globalThis.localStorage = window.localStorage;
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  globalThis.Audio = class {
    volume = 0;
    preload = "";
    addEventListener() {}
    removeEventListener() {}
    pause() {}
    load() {}
    play() {
      return Promise.resolve();
    }
  };
  globalThis.fetch = makeFetch(requests);
  // Cache-bust so each page load re-evaluates the bundle.
  await import(`../examples/pokemon/pokemon.js?smoke=${Math.random()}`);
  // Let the hydration microtasks, delayed fetches and re-renders settle.
  await new Promise((r) => setTimeout(r, 900));
  return dom;
}

const ssrPage = readFileSync("./examples/pokemon-ssr/index.html", "utf8");
const clientPage = readFileSync("./examples/pokemon/index.html", "utf8");

const cardState = () => {
  const cards = document.querySelectorAll(".pokemon-card").length;
  const wrappers = document.querySelectorAll(".pokemon-card-wrapper").length;
  const name = document.querySelector(".pokemon-main h3")?.textContent.trim();
  return { cards, wrappers, name };
};

// 1. Matching URL: adopted, no requests, single card.
{
  const requests = [];
  const dom = await boot(ssrPage, "http://localhost/pokemon-ssr/", requests);
  const s = dom.window.eval(`(${cardState})()`);
  check(
    "ssr default URL: adopted without requests",
    s.cards === 1 &&
      s.wrappers === 1 &&
      requests.length === 0 &&
      s.name === "Bulbasaur",
    `${s.cards} cards, ${requests.length} requests, ${s.name}`,
  );
}

// 2. URL-mismatched reloads: exactly one card and one wrapper (the
// doubling race), repeated to hit the interleavings.
for (const id of ["4", "25", "150", "774"]) {
  for (let i = 0; i < 3; i++) {
    const requests = [];
    const dom = await boot(
      ssrPage,
      `http://localhost/pokemon-ssr/#pokedex/${id}`,
      requests,
    );
    const s = dom.window.eval(`(${cardState})()`);
    check(
      `ssr #pokedex/${id} reload ${i + 1}: single card`,
      s.cards === 1 && s.wrappers === 1 && s.name === `Stub ${id}`,
      `${s.cards} cards, ${s.wrappers} wrappers, ${s.name}`,
    );
  }
}

// 3. Battle branch reload: one battle containing its splash, no pokedex.
{
  const requests = [];
  const dom = await boot(
    ssrPage,
    "http://localhost/pokemon-ssr/#battle",
    requests,
  );
  const s = dom.window.eval(`(() => {
    const battles = document.querySelectorAll(".pokemon-battle").length;
    const splash = document.querySelectorAll(".pokemon-battle .splash-screen").length;
    const viewers = document.querySelectorAll(".pokemon-viewer").length;
    return { battles, splash, viewers };
  })()`);
  check(
    "ssr #battle: one battle with its splash",
    s.battles === 1 && s.splash === 1 && s.viewers === 0,
    `battles=${s.battles} splash=${s.splash} viewers=${s.viewers}`,
  );
}

// 4. Client-only page: renders fresh and fetches.
{
  const requests = [];
  const dom = await boot(clientPage, "http://localhost/pokemon/", requests);
  const s = dom.window.eval(`(${cardState})()`);
  check(
    "client-only page: renders fresh with a fetch",
    s.cards === 1 &&
      s.wrappers === 1 &&
      requests.some((u) => u.includes("/pokemon/1")),
    `${s.cards} cards, ${requests.length} requests`,
  );
}

// 5. Post-hydration navigation keeps a single card.
{
  const requests = [];
  const dom = await boot(
    ssrPage,
    "http://localhost/pokemon-ssr/#pokedex/774",
    requests,
  );
  const next = dom.window.eval(
    `[...document.querySelectorAll("button")].find(b => b.textContent === "→")`,
  );
  next.click();
  await new Promise((r) => setTimeout(r, 900));
  const s = dom.window.eval(`(${cardState})()`);
  check(
    "navigation after mismatched load: single card",
    s.cards === 1 && s.wrappers === 1,
    `${s.cards} cards, ${s.wrappers} wrappers`,
  );
}

console.log(
  `\n${results.length - FAILURES.length}/${results.length} checks passed`,
);
if (FAILURES.length) {
  console.error("\nFAILURES:");
  for (const f of FAILURES) console.error(" -", f);
  process.exitCode = 1;
}
