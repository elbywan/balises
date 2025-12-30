/**
 * ComparePanel Component - Display comparison Pokemon in compare mode
 */

import { html, computed } from "../../../src/index.js";
import type { Pokemon } from "../types.js";
import type { TypeDisplay } from "./pokemon-card.js";

export interface ComparePanelProps {
  comparePokemon: Pokemon | null;
  comparePokemonName: string;
  compareTypeNames: TypeDisplay[];
  onShuffle: () => void;
}

/**
 * Renders the comparison Pokemon panel that appears beside the main Pokemon
 */
export function ComparePanel(props: ComparePanelProps) {
  const { comparePokemon, comparePokemonName, compareTypeNames, onShuffle } =
    props;

  const compareTypeDisplay = computed(() =>
    (comparePokemon?.types ?? []).map((t) => {
      const typeKey = t.type.name;
      const found = compareTypeNames.find((tn) => tn.key === typeKey);
      return { key: typeKey, name: found ? found.name : typeKey };
    }),
  );

  const renderType = (typeKey: string, displayName: string) => html`
    <span class="type-badge" data-type=${typeKey}>${displayName}</span>
  `;

  return html`
    <div class="pokemon-compare">
      ${comparePokemon
        ? html`
            <button
              class="shuffle-btn"
              @click=${onShuffle}
              title="Random Pokemon"
            >
              🔀
            </button>
            <img
              src=${comparePokemon.sprites.other?.["official-artwork"]
                ?.front_default || comparePokemon.sprites.front_default}
              alt=${comparePokemonName || comparePokemon.name}
            />
            <h3>${comparePokemonName || comparePokemon.name}</h3>
            <div class="types">
              ${computed(() =>
                compareTypeDisplay.value.map((t) => renderType(t.key, t.name)),
              )}
            </div>
          `
        : html`<div class="compare-loading">Loading...</div>`}
    </div>
  `;
}
