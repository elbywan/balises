/**
 * FavoritesList Component - Display and manage favorite Pokemon
 */

import { html, each } from "../../../src/index.js";
import type { FavoritePokemon, PokemonViewerState } from "../types.js";

export interface FavoritesListProps {
  state: PokemonViewerState;
  onSelectFavorite: (fav: FavoritePokemon) => void;
  onRemoveFavorite: (fav: FavoritePokemon, e: Event) => void;
}

/**
 * Renders the favorites list section with add/remove functionality
 */
export function FavoritesList(props: FavoritesListProps) {
  const { state, onSelectFavorite, onRemoveFavorite } = props;

  const renderFavorite = (fav: FavoritePokemon) => html`
    <div class="favorite-item" @click=${() => onSelectFavorite(fav)}>
      <img src=${fav.sprite} alt=${fav.name} />
      <span>${fav.name}</span>
      <button
        class="remove-btn"
        @click=${(e: Event) => onRemoveFavorite(fav, e)}
      >
        ×
      </button>
    </div>
  `;

  return html`
    <div class="favorites-section">
      <h3>
        Favorites
        <span class="favorites-count">(${() => state.favorites.length})</span>
      </h3>
      ${() =>
        state.favorites.length === 0
          ? html`<p class="no-favorites">No favorites yet. Click ❤️ to add!</p>`
          : null}
      <div class="favorites-list">
        ${each(
          () => state.favorites,
          (fav) => fav.id,
          renderFavorite,
        )}
      </div>
    </div>
  `;
}
