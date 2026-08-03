/**
 * Build-time static generation for the SSR example.
 *
 * Renders the app with renderToStringAsync: the roster is fetched from
 * PokeAPI inside an async generator and the settled content is written to
 * examples/ssr/index.html, along with the serialized state and the
 * fetched roster for the client bootstrap. Run as part of
 * `yarn examples:build`:
 *
 *   node --import tsx/esm examples/ssr/build-html.ts
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { renderToStringAsync } from "../../src/ssr.js";
import { PokedexApp } from "./components/pokedex.js";
import { createState, serializeState, DEFAULT_STATE } from "./state.js";
import { STYLES } from "./styles.js";

// The server renders with the default state; the same state and the
// fetched roster are embedded in the page so the client hydrates with
// identical markup and data.
const state = createState(DEFAULT_STATE);

const markup = await renderToStringAsync(PokedexApp(state));
const data = { state: serializeState(state), roster: state.roster };
// Escape "<" so a hostile string could never break out of the script tag.
const serialized = JSON.stringify(data).replace(/</g, "\\u003c");

// Format the generated page (CI runs `prettier --check .` on the repo).
const page = await format(
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SSR Pokédex - balises</title>
    <link rel="icon" type="image/svg+xml" href="../../assets/logo-icon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../example.css" />
    <style>
${STYLES}
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>Server-Side Rendering</h1>
        <p class="tagline">
          A Pokédex pre-rendered at build time with renderToStringAsync —
          PokeAPI requests happen server-side, then the page hydrates
          without refetching
        </p>
      </header>

      <div id="app">${markup}</div>

      <div class="nav-links">
        <a href="../" class="back-link">&larr; Back to Examples</a>
        <a
          href="https://github.com/elbywan/balises/blob/main/examples/ssr/build-html.ts"
          class="source-link"
          target="_blank"
          >View Source &rarr;</a
        >
      </div>
    </div>
    <script id="ssr-data" type="application/json">${serialized}</script>
    <script type="module" src="ssr.js"></script>
  </body>
</html>`,
  { parser: "html" },
);

const out = fileURLToPath(new URL("./index.html", import.meta.url));
writeFileSync(out, page);
console.log(
  `generated ${out} (${page.length} bytes, ${state.roster.length} Pokémon fetched)`,
);
