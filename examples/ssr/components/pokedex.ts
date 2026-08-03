/**
 * PokedexApp - the server-rendered + hydrated example app.
 *
 * The same component runs in both environments:
 *
 * - Server (build time): renderToStringAsync executes the async
 *   generators. loadRoster fetches the roster from PokeAPI and returns
 *   the browser section as its settled content; loadDetail renders the
 *   empty state (nothing selected yet). The settled content is what ends
 *   up in the shipped HTML.
 * - Client: hydrate() adopts that content. The generators receive the
 *   adopted content as their `settled` handle, so they return it without
 *   refetching; when the selected Pokémon changes, loadDetail restarts
 *   (loading state -> fetch -> detail panel).
 */

import { html as baseHtml, computed } from "../../../src/index.js";
import eachPlugin, { each } from "../../../src/each.js";
import matchPlugin, { when } from "../../../src/match.js";
import asyncPlugin from "../../../src/async.js";
import {
  fetchPokemon,
  fetchRoster,
  fetchSpecies,
  deriveTypes,
  type PokemonDetail,
} from "../data/pokeapi.js";
import type { AppState } from "../state.js";
import { PokemonCard } from "./card.js";
import { DetailPanel } from "./detail.js";

const html = baseHtml.with(matchPlugin, eachPlugin, asyncPlugin);

export function PokedexApp(state: AppState) {
  // Reactive view over the fetched roster: type filter, favorites-only
  // mode and the search query all narrow the grid without refetching.
  const filtered = computed(() => {
    const query = state.query.trim().toLowerCase();
    const type = state.typeFilter;
    return state.roster.filter(
      (p) =>
        (!type || p.types.includes(type)) &&
        (!state.favoritesOnly || state.favorites.includes(p.id)) &&
        (!query ||
          p.name.toLowerCase().includes(query) ||
          String(p.id) === query),
    );
  });

  // The browser section (search, chips, grid) is an async generator: on
  // the server it fetches the roster from PokeAPI and settles on the
  // full grid; on the client it returns the adopted `settled` content.
  async function* loadRoster(settled: unknown) {
    if (settled) return settled;
    // The client restores the roster from the page payload before
    // hydrating, so the settled template is reproducible without a
    // network request.
    if (state.roster.length > 0) return browser(state);
    yield html`<div class="grid-loading">Loading Pokédex…</div>`;
    const roster = await fetchRoster();
    state.roster = roster;
    state.types = deriveTypes(roster);
    return browser(state);
  }

  // The browser section (search, chips, grid) - shared by the server
  // (after the fetch) and the hydration walk (from restored state).
  const browser = (s: AppState) => html`
    <div class="controls">
      <input
        class="search"
        type="search"
        placeholder="Search by name or number…"
        value=${() => s.query}
        @input=${(event: Event) => {
          s.query = (event.target as HTMLInputElement).value;
        }}
      />
      <div class="chips">
        ${each(
          s.types,
          (type) => type,
          (typeSignal) => {
            const type = typeSignal.peek();
            return html`
              <button
                class=${() => `chip ${s.typeFilter === type ? "active" : ""}`}
                @click=${() => {
                  s.typeFilter = s.typeFilter === type ? "" : type;
                }}
              >
                ${type}
              </button>
            `;
          },
        )}
      </div>
    </div>
    ${when(
      () => filtered.value.length === 0,
      [() => html`<p class="no-results">No Pokémon match your filters.</p>`],
    )}
    <div class="grid">
      ${each(
        filtered,
        (p) => p.id,
        (pokemon) => PokemonCard({ state, pokemon }),
      )}
    </div>
  `;

  // The detail panel is an async generator too: selecting a Pokémon
  // restarts it (loading state, then a PokeAPI fetch for the Pokémon +
  // its species flavor text). Server-side nothing is selected, so it
  // settles on the empty state without any request.
  async function* loadDetail(
    settled: unknown,
    ctx?: { lastId?: number | null },
  ) {
    const id = state.selectedId;
    const previous = ctx?.lastId;
    if (ctx) ctx.lastId = id;
    // Hydration or a re-render of the same selection: keep the DOM.
    if (settled && (previous === undefined || previous === id)) {
      return settled;
    }
    if (id === null) {
      return html`
        <div class="detail-empty">
          <span class="detail-empty-icon">🔍</span>
          <p>Select a Pokémon to see its stats.</p>
        </div>
      `;
    }
    yield html`<div class="detail-loading">Loading…</div>`;
    const [pokemon, species] = await Promise.all([
      fetchPokemon(id),
      fetchSpecies(id),
    ]);
    const detail: PokemonDetail = { ...pokemon, flavor: species.flavor };
    return DetailPanel({ state, pokemon: detail });
  }

  return html`
    <div class="pokedex">
      <header class="pokedex-header">
        <div>
          <h2>Pokédex</h2>
          <p class="subtitle">
            Pre-rendered at build time, hydrated on the client
          </p>
        </div>
        <button
          class=${() => `fav-toggle ${state.favoritesOnly ? "active" : ""}`}
          @click=${() => {
            state.favoritesOnly = !state.favoritesOnly;
          }}
        >
          ★ <span class="fav-count">${() => state.favorites.length}</span>
        </button>
      </header>

      <main class="layout">
        <div class="browser">${loadRoster}</div>
        <aside class="detail-slot">${loadDetail}</aside>
      </main>

      <footer class="ssr-note">
        <span>
          This page was generated with renderToStringAsync at build time — the
          roster was fetched from PokeAPI server-side and embedded. View source
          to see the pre-rendered markup.
        </span>
      </footer>
    </div>
  `;
}
