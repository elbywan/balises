/**
 * Move Button Component - Individual move button with type styling
 */

import { html } from "../../../src/index.js";
import type { Move } from "../types.js";

export interface MoveButtonProps {
  move: Move;
  index: number;
  disabled: () => boolean;
  onSelect: (index: number) => void;
  getMoveName: (move: Move) => string;
}

/**
 * Renders a move button with type-based styling and PP display
 */
export function MoveButton({
  move,
  index,
  disabled,
  onSelect,
  getMoveName,
}: MoveButtonProps) {
  const isDisabled = () => disabled() || move.pp <= 0;

  return html`
    <button
      class="move-btn"
      data-type=${move.type}
      .disabled=${isDisabled}
      @click=${() => !isDisabled() && onSelect(index)}
    >
      <div class="move-name">${() => getMoveName(move)}</div>
      <div class="move-details">
        <span class="move-type">${move.type}</span>
        <span class="move-pp">PP: ${() => move.pp}/${move.maxPp}</span>
      </div>
      ${move.power > 0
        ? html`<div class="move-power">PWR: ${move.power}</div>`
        : null}
    </button>
  `;
}

export interface MovePanelProps {
  moves: () => Move[];
  disabled: () => boolean;
  onSelectMove: (index: number) => void;
  getMoveName: (move: Move) => string;
}

/**
 * Renders the move selection panel with all 4 moves
 */
export function MovePanel({
  moves,
  disabled,
  onSelectMove,
  getMoveName,
}: MovePanelProps) {
  return html`
    <div class="move-panel">
      <div class="move-grid">
        ${() =>
          moves().map((move, i) =>
            MoveButton({
              move,
              index: i,
              disabled,
              onSelect: onSelectMove,
              getMoveName,
            }),
          )}
      </div>
    </div>
  `;
}
