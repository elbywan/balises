import { html, computed } from "../../../src/index.js";
import type { Cell } from "../types.js";

/**
 * Reusable cell component for the spreadsheet grid
 */
export function GridCell(props: {
  cell: Cell;
  onIncrement: (cell: Cell) => void;
}) {
  const { cell, onIncrement } = props;

  // Display value - use computed if available, otherwise signal
  const displayValue = computed(() =>
    cell.computed ? cell.computed.value : cell.value.value,
  );

  // Flash trigger for animations
  const flashTrigger = computed(() => displayValue.value);

  // Determine cell class based on type
  const cellClass = computed(() => {
    const baseClass = "cell";
    if (cell.type === "input") return `${baseClass} input-cell`;
    if (cell.type === "formula") return `${baseClass} formula-cell`;
    if (cell.type === "multiplier") return `${baseClass} multiplier-cell`;
    if (cell.type === "sum-neighbors") return `${baseClass} sum-neighbors-cell`;
    if (cell.type === "row-sum") return `${baseClass} row-sum-cell`;
    if (cell.type === "column-sum") return `${baseClass} column-sum-cell`;
    if (cell.type === "max") return `${baseClass} max-cell`;
    if (cell.type === "min") return `${baseClass} min-cell`;
    if (cell.type === "average") return `${baseClass} average-cell`;
    return baseClass;
  });

  const getTitle = computed(() => {
    if (cell.type === "input") return `Input #${cell.id} - Click to increment`;

    // For formula cells, show dependencies and their current values
    if (cell.dependencies && cell.dependencies.length > 0) {
      const depInfo = cell.dependencies
        .map((dep) => {
          const val = dep.computed ? dep.computed.value : dep.value.value;
          return `#${dep.id}=${val}`;
        })
        .join(", ");

      const label = cell.specialLabel || "Formula";
      return `${label} #${cell.id} (${depInfo})`;
    }

    if (cell.specialLabel) return `${cell.specialLabel} Cell #${cell.id}`;
    return `Formula #${cell.id}`;
  });

  const handleClick = () => {
    if (cell.type === "input") {
      onIncrement(cell);
    }
  };

  return html`
    <div
      class=${cellClass}
      data-flash=${flashTrigger}
      data-cell-id=${cell.id}
      title=${getTitle}
      @click=${handleClick}
      style=${computed(() => (cell.type === "input" ? "cursor: pointer;" : ""))}
    >
      ${cell.specialLabel
        ? html`<div class="special-badge">${cell.specialLabel}</div>`
        : ""}
      <div class="cell-value">${displayValue}</div>
    </div>
  `;
}
