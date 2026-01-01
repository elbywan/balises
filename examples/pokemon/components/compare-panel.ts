/**
 * ComparePanel Component - Display comparison Pokemon in compare mode
 */

import { html } from "../../../src/index.js";
import type { PokedexState } from "../types.js";

export interface ComparePanelProps {
  state: PokedexState;
  onShuffle: () => void;
}

/**
 * Renders the comparison Pokemon panel that appears beside the main Pokemon
 */
export function ComparePanel(props: ComparePanelProps) {
  const { state, onShuffle } = props;

  const compareTypeDisplay = () =>
    (state.comparePokemon?.types ?? []).map((t) => {
      const typeKey = t.type.name;
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
                title="Random Pokemon"
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
                  compareTypeDisplay().map((t) => renderType(t.key, t.name))}
              </div>
            `
          : html`<div class="compare-loading">Loading...</div>`}
    </div>
  `;
}
