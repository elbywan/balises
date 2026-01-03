/**
 * ComparePanel Component - Display comparison Pokemon in compare mode
 */

import { html } from "../../../src/index.js";
import type { PokedexState } from "../types.js";
import type { PokedexTranslations } from "../utils/pokedex-translations.js";

export interface ComparePanelProps {
  state: PokedexState;
  onShuffle: () => void;
  getTranslations: () => PokedexTranslations;
}

/**
 * Renders the comparison Pokemon panel that appears beside the main Pokemon
 */
export function ComparePanel(props: ComparePanelProps) {
  const { state, onShuffle, getTranslations } = props;
  const t = () => getTranslations();

  const compareTypeDisplay = () =>
    (state.comparePokemon?.types ?? []).map((type) => {
      const typeKey = type.type.name;
      const found = state.compareTypeNames.find((tn) => tn.key === typeKey);
      return { key: typeKey, name: found ? found.name : typeKey };
    });

  const renderType = (typeKey: string, displayName: string) => html`
    <span class="type-badge" data-type=${typeKey}>${displayName}</span>
  `;

  return html`
    <div class="pokemon-compare">
      ${() =>
        state.comparePokemon
          ? html`
              <button
                class="shuffle-btn"
                @click=${onShuffle}
                title=${() => t().shuffleCompare}
              >
                🔀
              </button>
              <img
                src=${state.comparePokemon.sprites.other?.["official-artwork"]
                  ?.front_default || state.comparePokemon.sprites.front_default}
                alt=${state.comparePokemonName || state.comparePokemon.name}
              />
              <h3>${state.comparePokemonName || state.comparePokemon.name}</h3>
              <div class="types">
                ${() =>
                  compareTypeDisplay().map((type) =>
                    renderType(type.key, type.name),
                  )}
              </div>
            `
          : html`<div class="compare-loading">${() => t().loading}</div>`}
    </div>
  `;
}
