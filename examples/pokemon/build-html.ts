/**
 * Build-time static generation for the pokemon examples.
 *
 * Renders the exact same app the client runs (createAppStores +
 * buildAppTemplate) with renderToStringAsync, then writes:
 * - examples/pokemon/index.html:      client-only shell (no pre-render)
 * - examples/pokemon-ssr/index.html:  shell + pre-rendered markup + state
 *
 * Run as part of `yarn examples:build`:
 *   node --import tsx/esm examples/pokemon/build-html.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { renderToStringAsync } from "../../src/ssr.js";
import { PokemonService } from "./services/pokemon-service.js";
import {
  buildAppTemplate,
  createAppStores,
  defaultRoute,
  serializeSsrState,
} from "./pokemon.js";

const dir = fileURLToPath(new URL(".", import.meta.url));
// The hand-written shell is the single source of truth for the page
// layout; both examples are generated from it.
const shellPath = `${dir}shell.html`;
const clientPath = `${dir}index.html`;
const ssrDir = `${dir.replace(/pokemon\/$/, "pokemon-ssr/")}`;
const ssrPath = `${ssrDir}index.html`;

// The app runs with the default route (pokedex, pokemon #1); the async
// generator fetches pokemon #1 + its localized names from PokeAPI and
// settles on the card, which is what ends up in the shipped markup.
const stores = createAppStores(defaultRoute());
const markup = await renderToStringAsync(
  buildAppTemplate(stores, new PokemonService(), {
    // No browser plumbing server-side.
    updateUrl: () => {},
    getRootElement: () => null,
  }),
);
// Escape "<" so a hostile string could never break out of the script tag.
const payload = JSON.stringify(serializeSsrState(stores)).replace(
  /</g,
  "\\u003c",
);

const shell = readFileSync(shellPath, "utf8");
const placeholder = "<x-pokemon-app></x-pokemon-app>";
if (!shell.includes(placeholder)) {
  throw new Error("shell.html is missing the <x-pokemon-app> placeholder");
}
const moduleScript = '<script type="module" src="pokemon.js">';
if (!shell.includes(moduleScript)) {
  throw new Error("shell.html is missing the pokemon.js module script");
}

// 1. Client-only example: the shell as-is (renders fresh on load).
writeFileSync(clientPath, await format(shell, { parser: "html" }));

// 2. SSR example: the shell with the pre-rendered markup + serialized
// state, loading its own bundle (pokemon-ssr.js).
const ssrPage = shell
  .replace(placeholder, `<x-pokemon-app>${markup}</x-pokemon-app>`)
  .replace(moduleScript, '<script type="module" src="pokemon-ssr.js">')
  .replace(
    '<script type="module" src="pokemon-ssr.js">',
    `<script id="ssr-data" type="application/json">${payload}</script>\n    <script type="module" src="pokemon-ssr.js">`,
  );

// Format the generated pages (CI runs `prettier --check .` on the repo).
writeFileSync(ssrPath, await format(ssrPage, { parser: "html" }));

console.log(
  `generated ${clientPath} (client-only) and ${ssrPath} (${markup.length} bytes pre-rendered)`,
);
