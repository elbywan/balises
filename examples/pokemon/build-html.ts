/**
 * Build-time static generation for the pokemon example.
 *
 * Renders the exact same app the client runs (createAppStores +
 * buildAppTemplate) with renderToStringAsync, then writes:
 * - index.html: the shell with the pre-rendered markup + serialized state
 * - nossr.html: the same shell without pre-render (client-only variant)
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
// layout; the generated pages are index.html (SSR'd) and nossr.html.
const shellPath = `${dir}shell.html`;
const indexPath = `${dir}index.html`;

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
  throw new Error("index.html is missing the <x-pokemon-app> placeholder");
}

const moduleScript = '<script type="module" src="pokemon.js">';
if (!shell.includes(moduleScript)) {
  throw new Error("index.html is missing the pokemon.js module script");
}

const ssrPage = shell
  .replace(placeholder, `<x-pokemon-app>${markup}</x-pokemon-app>`)
  .replace(
    moduleScript,
    `<script id="ssr-data" type="application/json">${payload}</script>\n    ${moduleScript}`,
  );

// Format the generated pages (CI runs `prettier --check .` on the repo).
writeFileSync(indexPath, await format(ssrPage, { parser: "html" }));
writeFileSync(`${dir}nossr.html`, await format(shell, { parser: "html" }));

console.log(
  `generated ${indexPath} (${markup.length} bytes of pre-rendered markup)`,
  `and ${dir}nossr.html`,
);
