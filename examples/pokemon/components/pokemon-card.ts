/**
 * PokemonCard Component - Main Pokemon display with sprite, stats, and actions
 */

import { html } from "../../../src/index.js";
import type { PokemonViewerState } from "../types.js";
import { StatBar } from "./stat-bar.js";
import { ComparePanel } from "./compare-panel.js";

export interface PokemonCardProps {
  state: PokemonViewerState;
  getIsFavorite: () => boolean;
  onToggleShiny: () => void;
  onPlayCry: () => void;
  onToggleFavorite: () => void;
  onToggleCompare: () => void;
  onShuffleCompare: () => void;
}

/**
 * Renders the main Pokemon card with image, details, stats, and action buttons
 */
export function PokemonCard(props: PokemonCardProps) {
  const {
    state,
    getIsFavorite,
    onToggleShiny,
    onPlayCry,
    onToggleFavorite,
    onToggleCompare,
    onShuffleCompare,
  } = props;

  const spriteUrl = () => {
    const pokemon = state.pokemon;
    if (!pokemon) return "";
    const artwork = pokemon.sprites.other?.["official-artwork"];
    if (state.shiny) {
      return artwork?.front_shiny || pokemon.sprites.front_shiny;
    }
    return artwork?.front_default || pokemon.sprites.front_default;
  };

  const totalStats = () =>
    state.pokemon?.stats.reduce((sum, s) => sum + s.base_stat, 0) ?? 0;

  const mainTypeDisplay = () =>
    (state.pokemon?.types ?? []).map((t) => {
      const typeKey = t.type.name;
      const found = state.typeNames.find((tn) => tn.key === typeKey);
      return { key: typeKey, name: found ? found.name : typeKey };
    });

  const renderType = (typeKey: string, displayName: string) => html`
    <span class="type-badge" data-type=${typeKey}>${displayName}</span>
  `;

  return html`
    <div
      class="pokemon-card"
      style=${() => (state.error ? "display: none" : "")}
    >
      ${() =>
        state.showLoader
          ? html`<div class="loading-overlay">
              <div class="spinner"></div>
            </div>`
          : null}

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button class="icon-btn" @click=${onToggleShiny} title="Toggle Shiny">
          ${() => (state.shiny ? "★" : "☆")}
        </button>
        <button
          class="icon-btn"
          @click=${onPlayCry}
          title="Play Cry"
          .disabled=${() => !state.pokemon?.cries?.latest}
        >
          🔊
        </button>
        <button
          class=${() => "icon-btn" + (getIsFavorite() ? " active" : "")}
          @click=${onToggleFavorite}
          title="Toggle Favorite"
        >
          ${() => (getIsFavorite() ? "❤️" : "🤍")}
        </button>
        <button class="icon-btn" @click=${onToggleCompare} title="Compare Mode">
          ${() => (state.compareMode ? "📊" : "📈")}
        </button>
      </div>

      <!-- Main Pokemon Display -->
      <div
        class=${() =>
          "pokemon-display" + (state.compareMode ? " compare-mode" : "")}
      >
        <div class="pokemon-main">
          <img
            src=${spriteUrl}
            alt=${() => state.pokemonName || state.pokemon?.name || ""}
            class=${() => (state.loading ? "faded" : "")}
          />
          <h3>
            ${() => state.pokemonName || ""}
            ${() =>
              state.shiny ? html`<span class="shiny-badge">✨</span>` : null}
          </h3>
          <div class="types">
            ${() => mainTypeDisplay().map((t) => renderType(t.key, t.name))}
          </div>
          <div class="measurements">
            <span>
              📏
              ${() => {
                const pokemon = state.pokemon;
                return pokemon ? (pokemon.height / 10).toFixed(1) : "—";
              }}m
            </span>
            <span>
              ⚖️
              ${() => {
                const pokemon = state.pokemon;
                return pokemon ? (pokemon.weight / 10).toFixed(1) : "—";
              }}kg
            </span>
          </div>
        </div>

        <!-- Compare Panel -->
        ${() =>
          state.compareMode
            ? ComparePanel({ state, onShuffle: onShuffleCompare })
            : null}
      </div>

      <!-- Stats -->
      <div class="stats">
        <div class="stats-header">
          <span>Stats</span>
          <span class="total-stats">Total: ${totalStats}</span>
        </div>
        ${() => {
          const stats = state.pokemon?.stats ?? [];
          const compareStats = state.comparePokemon?.stats;
          return stats.map((stat, i) =>
            StatBar({
              stat,
              compareStat: compareStats?.[i]?.base_stat,
            }),
          );
        }}
      </div>
    </div>
  `;
}
