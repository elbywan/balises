/**
 * NavigationControls Component - Previous/Next/Random buttons for Pokemon navigation
 */

import { html } from "../../../src/index.js";
import type { PokedexState } from "../types.js";

export interface NavigationControlsProps {
  state: PokedexState;
  onPrev: () => void;
  onNext: () => void;
  onRandom: () => void;
}

/**
 * Renders navigation controls for browsing Pokemon
 */
export function NavigationControls(props: NavigationControlsProps) {
  const { state, onPrev, onNext, onRandom } = props;

  return html`
    <div class="controls">
      <button
        @click=${onPrev}
        .disabled=${() => state.pokemonId <= 1 || state.loading}
      >
        ←
      </button>
      <span class="pokemon-id"
        >#${() => String(state.pokemonId).padStart(4, "0")}</span
      >
      <button @click=${onNext} .disabled=${() => state.loading}>→</button>
      <button @click=${onRandom} .disabled=${() => state.loading}>
        Random
      </button>
    </div>
  `;
}
