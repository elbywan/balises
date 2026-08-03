/**
 * Client bootstrap for the SSR example.
 *
 * Reads the state and the fetched roster embedded in the generated page,
 * loads persisted favorites from localStorage, and hydrates the
 * server-rendered markup: the existing DOM is adopted (the async
 * generators return their `settled` content instead of refetching) and
 * all bindings become reactive without a re-render.
 */

import { effect } from "../../src/index.js";
import { hydrate } from "../../src/hydrate.js";
import { deriveTypes } from "./data/pokeapi.js";
import { PokedexApp } from "./components/pokedex.js";
import { createState, parsePageData, FAVORITES_KEY } from "./state.js";

const app = document.getElementById("app");
if (app) {
  const { state: initial, roster } = parsePageData(
    document.getElementById("ssr-data"),
  );
  const state = createState(initial);
  // The server-side generator fetched the roster; hand it to the client
  // before hydrating so the settled content matches exactly.
  state.roster = roster;
  state.types = deriveTypes(roster);

  // Adopt the server markup and attach reactive bindings.
  hydrate(PokedexApp(state), app);

  // Client-only state: hydrate first, then load persisted favorites so the
  // already-bound reactive classes/buttons pick them up in place.
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (stored) {
      const favorites = JSON.parse(stored) as unknown;
      if (Array.isArray(favorites)) state.favorites = favorites;
    }
  } catch {
    // Corrupt storage - start fresh.
  }

  // Persist favorites whenever they change.
  effect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
  });
}
