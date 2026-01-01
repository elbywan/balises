/**
 * Team Slot Component - Displays a Pokemon in the team bar
 */

import { html } from "../../../src/index.js";
import type { BattlePokemon } from "../types.js";

export interface TeamSlotProps {
  pokemon: BattlePokemon;
  isActive: () => boolean;
  onClick?: () => void;
  disabled?: () => boolean;
  showHpText?: boolean;
}

/**
 * Renders a team slot button with Pokemon sprite and status
 */
export function TeamSlot({
  pokemon,
  isActive,
  onClick,
  disabled,
  showHpText = false,
}: TeamSlotProps) {
  const isFainted = () => pokemon.currentHp <= 0;
  const isDisabled = () => disabled?.() || isFainted() || isActive();
  const hasClick = onClick !== undefined;

  const slotClass = () =>
    "team-slot" +
    (isFainted() ? " fainted" : "") +
    (isActive() ? " active" : "");

  const title = () =>
    `${pokemon.displayName} - HP: ${pokemon.currentHp}/${pokemon.maxHp}`;

  if (hasClick) {
    return html`
      <button
        class=${slotClass}
        @click=${() => !isDisabled() && onClick?.()}
        .disabled=${isDisabled}
        title=${title}
      >
        <img src=${pokemon.sprite} alt=${pokemon.displayName} />
        ${showHpText
          ? html`
              <div class="slot-info">
                <span>${pokemon.displayName}</span>
                <span class="slot-hp"
                  >${() => pokemon.currentHp}/${pokemon.maxHp}</span
                >
              </div>
            `
          : null}
        ${() => (isFainted() ? html`<span class="faint-x">X</span>` : null)}
      </button>
    `;
  }

  // Non-interactive slot (for enemy team display)
  return html`
    <div class=${slotClass} title=${title}>
      <img src=${pokemon.sprite} alt=${pokemon.displayName} />
      ${() => (isFainted() ? html`<span class="faint-x">X</span>` : null)}
    </div>
  `;
}
