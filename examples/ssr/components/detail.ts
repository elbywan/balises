/**
 * DetailPanel - the selected Pokémon's stats and description.
 *
 * Rendered by an async generator after it fetches the Pokémon and its
 * species data from PokeAPI (with a loading state in between).
 */

import { html } from "../../../src/index.js";
import { STAT_LABELS, type PokemonDetail } from "../data/pokeapi.js";
import type { AppState } from "../state.js";

/** Bar scale: a floor so short stat bars still read, plus the detail's max. */
const barMax = (pokemon: PokemonDetail): number =>
  Math.max(160, ...Object.values(pokemon.stats));

export function DetailPanel({
  state,
  pokemon,
}: {
  state: AppState;
  pokemon: PokemonDetail;
}) {
  const isFavorite = () => state.favorites.includes(pokemon.id);
  const toggleFavorite = () => {
    state.favorites = isFavorite()
      ? state.favorites.filter((id) => id !== pokemon.id)
      : [...state.favorites, pokemon.id];
  };

  return html`
    <div class="detail">
      <img
        class="detail-sprite"
        src=${pokemon.sprite}
        alt=${pokemon.name}
        loading="lazy"
      />
      <h3>
        ${pokemon.name}
        <span class="number">#${String(pokemon.id).padStart(3, "0")}</span>
      </h3>
      <div class="types">
        ${pokemon.types.map(
          (t) => html`<span class="type-badge ${t}">${t}</span>`,
        )}
      </div>
      <p class="flavor">${pokemon.flavor}</p>
      <div class="stats">
        ${STAT_LABELS.map(([key, label]) => {
          const value = pokemon.stats[key];
          return html`
            <div class="stat-row">
              <span class="stat-label">${label}</span>
              <div class="stat-bar">
                <div
                  class="stat-fill ${key}"
                  style=${`width: ${Math.round((value / barMax(pokemon)) * 100)}%`}
                ></div>
              </div>
              <span class="stat-value">${value}</span>
            </div>
          `;
        })}
      </div>
      <button
        class=${() => `detail-fav ${isFavorite() ? "active" : ""}`}
        @click=${toggleFavorite}
      >
        ${() => (isFavorite() ? "★ Favorited" : "☆ Add to favorites")}
      </button>
    </div>
  `;
}
