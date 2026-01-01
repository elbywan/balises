/**
 * Team Selection Component - Choose Pokemon for your battle team
 */

import { html, each } from "../../../src/index.js";
import type { BattleState, Pokemon } from "../types.js";
import type { BattleTranslations } from "../utils/battle-translations.js";

/** Stat name abbreviations for display */
const STAT_ABBREV: Record<string, string> = {
  hp: "HP",
  attack: "ATK",
  defense: "DEF",
  "special-attack": "SPA",
  "special-defense": "SPD",
  speed: "SPE",
};

export interface TeamSelectProps {
  state: BattleState;
  translations: () => BattleTranslations;
  onTogglePokemon: (id: number) => void;
  onStartBattle: () => void;
  onChangeDifficulty: (difficulty: "easy" | "normal" | "hard") => void;
  getPokemonName: (pokemon: Pokemon) => string;
  onViewInPokedex: (pokemonId: number) => void;
  onRemoveFromRoster: (pokemonId: number) => boolean;
  onResetRoster: () => void;
  rosterCount: () => number;
  defaultRosterIds: Set<number>;
}

/**
 * Renders the team selection screen
 */
export function TeamSelect({
  state,
  translations,
  onTogglePokemon,
  onStartBattle,
  onChangeDifficulty,
  getPokemonName,
  onViewInPokedex,
  onRemoveFromRoster,
  onResetRoster,
  rosterCount,
  defaultRosterIds,
}: TeamSelectProps) {
  const t = () => translations().teamSelect;
  const isSelected = (id: number) => state.selectedForTeam.includes(id);
  const isCustom = (id: number) => !defaultRosterIds.has(id);
  const canStartBattle = () => state.selectedForTeam.length === state.teamSize;
  const isLoading = () => state.availablePokemon.length === 0;
  const selectionCount = () =>
    `${state.selectedForTeam.length} / ${state.teamSize}`;

  return html`
    <div class="team-select">
      <h2>${() => t().title}</h2>
      <p class="team-select-info">
        ${() => t().info.replace("{count}", String(state.teamSize))}
        <span class="selection-count">(${selectionCount})</span>
      </p>

      <!-- Start Battle Button - Top Position -->
      <button
        class=${() => "start-battle-btn" + (canStartBattle() ? " ready" : "")}
        @click=${onStartBattle}
        .disabled=${() => !canStartBattle() || isLoading()}
      >
        ${() => (isLoading() ? t().loading : t().startBattle)}
      </button>

      <div class="difficulty-select">
        <label>${() => t().difficulty}:</label>
        <div class="difficulty-buttons">
          <button
            class=${() =>
              "difficulty-btn" + (state.difficulty === "easy" ? " active" : "")}
            @click=${() => onChangeDifficulty("easy")}
          >
            ${() => t().easy}
          </button>
          <button
            class=${() =>
              "difficulty-btn" +
              (state.difficulty === "normal" ? " active" : "")}
            @click=${() => onChangeDifficulty("normal")}
          >
            ${() => t().normal}
          </button>
          <button
            class=${() =>
              "difficulty-btn" + (state.difficulty === "hard" ? " active" : "")}
            @click=${() => onChangeDifficulty("hard")}
          >
            ${() => t().hard}
          </button>
        </div>
      </div>

      <!-- Roster Management -->
      <div class="roster-management">
        <span class="roster-count">Roster: ${rosterCount}/60</span>
        <button
          class="reset-roster-btn"
          @click=${onResetRoster}
          title="Reset roster to default Pokemon"
        >
          Reset Roster
        </button>
      </div>

      <div class="pokemon-grid">
        ${each(
          () => state.availablePokemon,
          (p) => p.id,
          (pokemon) => {
            const selected = () => isSelected(pokemon.id);
            const disabled = () =>
              !selected() && state.selectedForTeam.length >= state.teamSize;
            const totalStats = pokemon.stats.reduce(
              (sum, s) => sum + s.base_stat,
              0,
            );
            return html`
              <button
                class=${() =>
                  "pokemon-select-card" +
                  (selected() ? " selected" : "") +
                  (disabled() ? " disabled" : "") +
                  (isCustom(pokemon.id) ? " custom" : "")}
                @click=${() => !disabled() && onTogglePokemon(pokemon.id)}
                .disabled=${disabled}
              >
                ${isCustom(pokemon.id)
                  ? html`<div class="custom-badge">+</div>`
                  : null}
                <img
                  src=${pokemon.sprites.other?.["official-artwork"]
                    ?.front_default || pokemon.sprites.front_default}
                  alt=${pokemon.name}
                />
                <div class="pokemon-select-name">
                  ${() => getPokemonName(pokemon)}
                </div>
                <div class="pokemon-select-types">
                  ${pokemon.types.map(
                    (t) => html`
                      <span class="type-badge mini" data-type=${t.type.name}
                        >${t.type.name}</span
                      >
                    `,
                  )}
                </div>
                ${() =>
                  selected() ? html`<div class="selected-badge"></div>` : null}
                <button
                  class="view-pokedex-btn"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    onViewInPokedex(pokemon.id);
                  }}
                  title="View in Pokedex"
                >
                  📖
                </button>
                <button
                  class="remove-roster-btn"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    onRemoveFromRoster(pokemon.id);
                  }}
                  title="Remove from Roster"
                >
                  ✕
                </button>
                <div class="stats-tooltip">
                  <div class="stats-tooltip-header">
                    <span class="stats-tooltip-name"
                      >${() => getPokemonName(pokemon)}</span
                    >
                    <span class="stats-tooltip-total"
                      >Total: ${totalStats}</span
                    >
                  </div>
                  <div class="stats-tooltip-grid">
                    ${pokemon.stats.map(
                      (s) => html`
                        <div class="stat-row" data-stat=${s.stat.name}>
                          <span class="stat-label"
                            >${STAT_ABBREV[s.stat.name] ?? s.stat.name}</span
                          >
                          <div class="stat-bar-bg">
                            <div
                              class="stat-bar-fill"
                              style=${`width: ${Math.min(100, (s.base_stat / 150) * 100)}%`}
                            ></div>
                          </div>
                          <span class="stat-value">${s.base_stat}</span>
                        </div>
                      `,
                    )}
                  </div>
                </div>
              </button>
            `;
          },
        )}
      </div>
    </div>
  `;
}
