/**
 * Battle HP Bar Component - Shows Pokemon health with animated transitions
 */

import { html } from "../../../src/index.js";
import type { BattlePokemon } from "../types.js";

export interface HealthBarProps {
  pokemon: () => BattlePokemon | null;
  isEnemy?: boolean;
  /** Optional getter for localized name */
  getName?: () => string;
}

/**
 * Renders a health bar with current/max HP display
 */
export function HealthBar({
  pokemon,
  isEnemy = false,
  getName,
}: HealthBarProps) {
  const displayName = () => {
    if (getName) return getName();
    return pokemon()?.displayName || "";
  };

  const hpPercent = () => {
    const p = pokemon();
    if (!p) return 100;
    return Math.max(0, (p.currentHp / p.maxHp) * 100);
  };

  const hpColor = () => {
    const percent = hpPercent();
    if (percent > 50) return "#22c55e"; // green
    if (percent > 20) return "#eab308"; // yellow
    return "#ef4444"; // red
  };

  const statusBadge = () => {
    const p = pokemon();
    if (!p || !p.statusCondition) return null;
    const badges: Record<string, { label: string; color: string }> = {
      burn: { label: "BRN", color: "#f97316" },
      paralyze: { label: "PAR", color: "#eab308" },
      poison: { label: "PSN", color: "#a855f7" },
      sleep: { label: "SLP", color: "#6b7280" },
    };
    return badges[p.statusCondition];
  };

  return html`
    <div class="health-bar-container ${isEnemy ? "enemy" : "player"}">
      <div class="pokemon-info">
        <span class="pokemon-name">${displayName}</span>
        <span class="pokemon-level">Lv${() => pokemon()?.level || 0}</span>
        ${() => {
          const badge = statusBadge();
          return badge
            ? html`<span class="status-badge" style="background: ${badge.color}"
                >${badge.label}</span
              >`
            : null;
        }}
      </div>
      <div class="hp-bar-outer">
        <div class="hp-label">HP</div>
        <div class="hp-bar-track">
          <div
            class="hp-bar-fill"
            style=${() => `width: ${hpPercent()}%; background: ${hpColor()}`}
          ></div>
        </div>
      </div>
      <div class="hp-text">
        ${() => {
          const p = pokemon();
          return p ? `${Math.max(0, p.currentHp)} / ${p.maxHp}` : "";
        }}
      </div>
    </div>
  `;
}
