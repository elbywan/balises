/**
 * NavigationControls Component - Previous/Next/Random buttons for Pokemon navigation
 */

import { html, computed } from "../../../src/index.js";

export interface NavigationControlsProps {
  pokemonId: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRandom: () => void;
}

/**
 * Renders navigation controls for browsing Pokemon
 */
export function NavigationControls(props: NavigationControlsProps) {
  const { pokemonId, loading, onPrev, onNext, onRandom } = props;

  return html`
    <div class="controls">
      <button @click=${onPrev} .disabled=${pokemonId <= 1 || loading}>←</button>
      <span class="pokemon-id"
        >#${computed(() => String(pokemonId).padStart(4, "0"))}</span
      >
      <button @click=${onNext} .disabled=${loading}>→</button>
      <button @click=${onRandom} .disabled=${loading}>Random</button>
    </div>
  `;
}
