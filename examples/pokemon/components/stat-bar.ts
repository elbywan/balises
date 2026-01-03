/**
 * StatBar Component - Individual stat visualization with optional comparison
 */

import { html } from "../../../src/index.js";
import type { PokedexTranslations } from "../utils/pokedex-translations.js";

export interface StatBarProps {
  stat: {
    base_stat: number;
    stat: { name: string };
  };
  compareStat?: number | undefined;
  getTranslations: () => PokedexTranslations;
}

/**
 * Renders a single stat bar with value, percentage fill, and optional comparison diff
 */
export function StatBar(props: StatBarProps) {
  const { stat, compareStat, getTranslations } = props;
  const percentage = Math.min(stat.base_stat, 150) / 1.5;
  const hue = Math.min(stat.base_stat, 150) * 0.8;
  const diff = compareStat !== undefined ? stat.base_stat - compareStat : 0;

  const statName = () => {
    const t = getTranslations();
    const key = stat.stat.name as keyof typeof t.statNames;
    return t.statNames[key] ?? stat.stat.name;
  };

  return html`
    <div class="stat">
      <span class="stat-name">${statName}</span>
      <div class="stat-bar">
        <div
          class="stat-fill"
          style="width: ${percentage}%; background: hsl(${hue}, 70%, 50%)"
        ></div>
      </div>
      <span class="stat-value">${stat.base_stat}</span>
      ${compareStat !== undefined
        ? html`<span
            class="stat-diff ${diff > 0
              ? "positive"
              : diff < 0
                ? "negative"
                : ""}"
            >${diff > 0 ? "+" : ""}${diff !== 0 ? diff : "="}</span
          >`
        : null}
    </div>
  `;
}
