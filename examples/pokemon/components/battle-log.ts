/**
 * Battle Log Component - Displays battle messages with scrolling
 */

import { html as baseHtml } from "../../../src/index.js";
import eachPlugin, { each } from "../../../src/each.js";
import type { BattleLogEntry } from "../types.js";

const html = baseHtml.with(eachPlugin);

export interface BattleLogProps {
  entries: () => BattleLogEntry[];
}

/**
 * Renders the battle log with color-coded messages
 */
export function BattleLog({ entries }: BattleLogProps) {
  const getEntryClass = (type: BattleLogEntry["type"]) => {
    switch (type) {
      case "damage":
        return "log-damage";
      case "heal":
        return "log-heal";
      case "effect":
        return "log-effect";
      case "faint":
        return "log-faint";
      case "info":
        return "log-info";
      default:
        return "log-action";
    }
  };

  return html`
    <div class="battle-log">
      <div class="battle-log-header">Battle Log</div>
      <div class="battle-log-content">
        ${each(
          entries,
          (entry) => entry.id,
          (entry) => html`
            <div class="log-entry ${getEntryClass(entry.type)}">
              ${entry.message}
            </div>
          `,
        )}
      </div>
    </div>
  `;
}
