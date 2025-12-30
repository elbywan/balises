/**
 * PokemonCard Component - Main Pokemon display with sprite, stats, and actions
 */

import { html, computed } from "../../../src/index.js";
import type { Pokemon } from "../types.js";
import { StatBar } from "./stat-bar.js";

export interface TypeDisplay {
  key: string;
  name: string;
}

export interface PokemonCardProps {
  pokemon: Pokemon | null;
  pokemonName: string;
  typeNames: TypeDisplay[];
  shiny: boolean;
  loading: boolean;
  showLoader: boolean;
  error: string | null;
  isFavorite: boolean;
  compareMode: boolean;
  onToggleShiny: () => void;
  onPlayCry: () => void;
  onToggleFavorite: () => void;
  onToggleCompare: () => void;
  comparePokemonStats?:
    | { base_stat: number; stat: { name: string } }[]
    | undefined;
  comparePanel?: ReturnType<typeof html> | undefined;
}

/**
 * Renders the main Pokemon card with image, details, stats, and action buttons
 */
export function PokemonCard(props: PokemonCardProps) {
  const {
    pokemon,
    pokemonName,
    typeNames,
    shiny,
    loading,
    showLoader,
    error,
    isFavorite,
    compareMode,
    onToggleShiny,
    onPlayCry,
    onToggleFavorite,
    onToggleCompare,
    comparePokemonStats,
    comparePanel,
  } = props;

  const spriteUrl = computed(() => {
    if (!pokemon) return "";
    const artwork = pokemon.sprites.other?.["official-artwork"];
    if (shiny) {
      return artwork?.front_shiny || pokemon.sprites.front_shiny;
    }
    return artwork?.front_default || pokemon.sprites.front_default;
  });

  const totalStats = computed(
    () => pokemon?.stats.reduce((sum, s) => sum + s.base_stat, 0) ?? 0,
  );

  const mainTypeDisplay = computed(() =>
    (pokemon?.types ?? []).map((t) => {
      const typeKey = t.type.name;
      const found = typeNames.find((tn) => tn.key === typeKey);
      return { key: typeKey, name: found ? found.name : typeKey };
    }),
  );

  const renderType = (typeKey: string, displayName: string) => html`
    <span class="type-badge" data-type=${typeKey}>${displayName}</span>
  `;

  return html`
    <div class="pokemon-card" style=${error ? "display: none" : ""}>
      ${showLoader
        ? html`<div class="loading-overlay">
            <div class="spinner"></div>
          </div>`
        : null}

      <!-- Action Buttons -->
      <div class="action-buttons">
        <button class="icon-btn" @click=${onToggleShiny} title="Toggle Shiny">
          ${shiny ? "★" : "☆"}
        </button>
        <button
          class="icon-btn"
          @click=${onPlayCry}
          title="Play Cry"
          .disabled=${!pokemon?.cries?.latest}
        >
          🔊
        </button>
        <button
          class="icon-btn ${isFavorite ? "active" : ""}"
          @click=${onToggleFavorite}
          title="Toggle Favorite"
        >
          ${isFavorite ? "❤️" : "🤍"}
        </button>
        <button class="icon-btn" @click=${onToggleCompare} title="Compare Mode">
          ${compareMode ? "📊" : "📈"}
        </button>
      </div>

      <!-- Main Pokemon Display -->
      <div class="pokemon-display ${compareMode ? "compare-mode" : ""}">
        <div class="pokemon-main">
          <img
            src=${spriteUrl}
            alt=${pokemonName || pokemon?.name || ""}
            class=${loading ? "faded" : ""}
          />
          <h3>
            ${pokemonName || pokemon?.name || ""}
            ${shiny ? html`<span class="shiny-badge">✨</span>` : null}
          </h3>
          <div class="types">
            ${computed(() =>
              mainTypeDisplay.value.map((t) => renderType(t.key, t.name)),
            )}
          </div>
          <div class="measurements">
            <span>📏 ${pokemon ? (pokemon.height / 10).toFixed(1) : "—"}m</span>
            <span
              >⚖️ ${pokemon ? (pokemon.weight / 10).toFixed(1) : "—"}kg</span
            >
          </div>
        </div>

        <!-- Compare Panel Slot -->
        ${comparePanel ?? null}
      </div>

      <!-- Stats -->
      <div class="stats">
        <div class="stats-header">
          <span>Stats</span>
          <span class="total-stats">Total: ${totalStats}</span>
        </div>
        ${computed(() => {
          const stats = pokemon?.stats ?? [];
          return stats.map((stat, i) =>
            StatBar({
              stat,
              compareStat: comparePokemonStats?.[i]?.base_stat,
            }),
          );
        })}
      </div>
    </div>
  `;
}
