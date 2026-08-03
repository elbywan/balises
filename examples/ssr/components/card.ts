/**
 * PokemonCard - a grid entry with sprite, name, types and a favorite toggle.
 *
 * The row's pokémon data is static, so it is captured once with peek();
 * only the reactive state (selection, favorites) is bound.
 */

import { html } from "../../../src/index.js";
import type { ReadonlySignal } from "../../../src/signals/index.js";
import type { Pokemon } from "../data/pokeapi.js";
import type { AppState } from "../state.js";

export function PokemonCard({
  state,
  pokemon,
}: {
  state: AppState;
  pokemon: ReadonlySignal<Pokemon>;
}) {
  const p = pokemon.peek();
  const isFavorite = () => state.favorites.includes(p.id);
  const toggleFavorite = () => {
    state.favorites = isFavorite()
      ? state.favorites.filter((id) => id !== p.id)
      : [...state.favorites, p.id];
  };

  return html`
    <article
      class=${() => `card ${state.selectedId === p.id ? "selected" : ""}`}
    >
      <button
        class="card-main"
        @click=${() => {
          state.selectedId = state.selectedId === p.id ? null : p.id;
        }}
      >
        <img src=${p.sprite} alt=${p.name} loading="lazy" />
        <span class="number">#${String(p.id).padStart(3, "0")}</span>
        <h3>${p.name}</h3>
        <div class="types">
          ${p.types.map((t) => html`<span class="type-badge ${t}">${t}</span>`)}
        </div>
      </button>
      <button
        class=${() => `fav ${isFavorite() ? "active" : ""}`}
        @click=${toggleFavorite}
        aria-label=${`Toggle favorite for ${p.name}`}
      >
        ★
      </button>
    </article>
  `;
}
