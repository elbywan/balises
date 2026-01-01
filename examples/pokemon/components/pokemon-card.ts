/**
 * PokemonCard Component - Main Pokemon display with sprite, stats, and actions
 */

import { html, computed } from "../../../src/index.js";
import type { PokedexState, SharedAppState } from "../types.js";
import { MAX_ROSTER_SIZE } from "../utils/storage.js";
import { StatBar } from "./stat-bar.js";
import { ComparePanel } from "./compare-panel.js";

/** Actions for managing roster and team selection */
export interface RosterActions {
  addToRoster: (pokemonId: number) => boolean;
  removeFromRoster: (pokemonId: number) => boolean;
  addToTeam: (pokemonId: number) => boolean;
  removeFromTeam: (pokemonId: number) => boolean;
  getSelectedForTeam: () => number[];
  isTeamFull: () => boolean;
  goToBattle: () => void;
}

export interface PokemonCardProps {
  state: PokedexState;
  sharedState: SharedAppState;
  getIsFavorite: () => boolean;
  onToggleShiny: () => void;
  onPlayCry: () => void;
  onToggleFavorite: () => void;
  onToggleCompare: () => void;
  onShuffleCompare: () => void;
  rosterActions: RosterActions;
}

/**
 * Renders the main Pokemon card with image, details, stats, and action buttons
 */
export function PokemonCard(props: PokemonCardProps) {
  const {
    state,
    sharedState,
    getIsFavorite,
    onToggleShiny,
    onPlayCry,
    onToggleFavorite,
    onToggleCompare,
    onShuffleCompare,
    rosterActions,
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

  // Derived state - computed once, used everywhere
  const pokemonId = computed(() => state.pokemon?.id ?? 0);
  const inRoster = computed(() => {
    const id = pokemonId.value;
    return id > 0 && sharedState.rosterIds.includes(id);
  });
  const inTeam = computed(() => {
    const id = pokemonId.value;
    return id > 0 && rosterActions.getSelectedForTeam().includes(id);
  });
  const rosterCount = computed(() => sharedState.rosterIds.length);

  const handleTeamToggle = () => {
    const id = pokemonId.value;
    if (id <= 0) return;
    if (inTeam.value) {
      rosterActions.removeFromTeam(id);
    } else {
      rosterActions.addToTeam(id);
    }
  };

  const handleRosterToggle = () => {
    const id = pokemonId.value;
    if (id <= 0) return;
    if (inRoster.value) {
      rosterActions.removeFromRoster(id);
    } else {
      rosterActions.addToRoster(id);
    }
  };

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
        <button
          class=${() =>
            "icon-btn roster-btn" + (inRoster.value ? " in-roster" : "")}
          @click=${handleRosterToggle}
          title=${() =>
            inRoster.value
              ? "Remove from Battle Roster"
              : `Add to Battle Roster (${rosterCount.value}/${MAX_ROSTER_SIZE})`}
          .disabled=${() =>
            !inRoster.value && rosterCount.value >= MAX_ROSTER_SIZE}
        >
          ${() => (inRoster.value ? "📋" : "📝")}
        </button>
        ${() => {
          if (!inRoster.value) return null;
          return html`
            <button
              class=${"icon-btn team-btn" + (inTeam.value ? " in-team" : "")}
              @click=${handleTeamToggle}
              title=${inTeam.value ? "Remove from Team" : "Add to Team"}
              .disabled=${!inTeam.value && rosterActions.isTeamFull()}
            >
              ${inTeam.value ? "⚔️" : "🎯"}
            </button>
          `;
        }}
      </div>

      <!-- Battle Team Indicator -->
      ${() =>
        inTeam.value
          ? html`
              <div class="team-indicator">
                <span>In Battle Team</span>
                <button
                  class="go-battle-btn"
                  @click=${rosterActions.goToBattle}
                >
                  Go to Battle →
                </button>
              </div>
            `
          : null}

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
