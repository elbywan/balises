/**
 * Balises Advanced DOM Benchmark Implementation
 *
 * Tests nested updates, partial updates, and cascading reactivity.
 */

import { html as baseHtml, signal, batch, type Signal } from "balises";
import eachPlugin, { each } from "balises/each";
import type { AdvancedBenchmarkSuite, NestedRow } from "../types.js";
import { generateNestedRows } from "../types.js";

const html = baseHtml.with(eachPlugin);

interface State {
  rows: Signal<NestedRow[]>;
  selectedId: Signal<number | null>;
  filter: Signal<"low" | "medium" | "high" | "all">;
}

let state: State | null = null;
let dispose: (() => void) | null = null;
let container: HTMLElement | null = null;

function createState(): State {
  return {
    rows: signal<NestedRow[]>([]),
    selectedId: signal<number | null>(null),
    filter: signal<"low" | "medium" | "high" | "all">("all"),
  };
}

function render(s: State, target: HTMLElement): () => void {
  // Computed filtered rows
  const filteredRows = () => {
    const filterValue = s.filter.value;
    if (filterValue === "all") return s.rows.value;
    return s.rows.value.filter(
      (row) => row.details.metadata.priority === filterValue,
    );
  };

  const template = html`
    <table class="table table-hover table-striped test-data">
      <tbody>
        ${each(
          filteredRows,
          (row) => row.id,
          (rowSignal) => {
            const id = rowSignal.peek().id;
            return html`
              <tr class=${() => (s.selectedId.is(id) ? "danger" : "")}>
                <td class="col-md-1">${id}</td>
                <td class="col-md-4">
                  <a @click=${() => (s.selectedId.value = id)}>
                    ${() => rowSignal.value.label}
                  </a>
                </td>
                <td class="col-md-2">
                  <span class="badge"
                    >${() => rowSignal.value.details.metadata.priority}</span
                  >
                </td>
                <td class="col-md-3">
                  ${() => rowSignal.value.details.tags.join(", ")}
                </td>
                <td class="col-md-1">
                  <a @click=${() => removeRow(id)}>
                    <span
                      class="glyphicon glyphicon-remove"
                      aria-hidden="true"
                    ></span>
                  </a>
                </td>
                <td class="col-md-1"></td>
              </tr>
            `;
          },
        )}
      </tbody>
    </table>
  `;

  const { fragment, dispose } = template.render();
  target.appendChild(fragment);

  return dispose;
}

function removeRow(id: number): void {
  if (!state) return;
  state.rows.value = state.rows.value.filter((row) => row.id !== id);
}

export const balisesAdvancedSuite: AdvancedBenchmarkSuite = {
  name: "balises",

  init(target: HTMLElement): void {
    container = target;
    state = createState();
    dispose = render(state, target);
  },

  cleanup(): void {
    dispose?.();
    dispose = null;
    state = null;
    if (container) {
      container.innerHTML = "";
    }
    container = null;
  },

  createNested1000(): void {
    if (!state) return;
    state.rows.value = generateNestedRows(1000);
  },

  updateNestedProperty(): void {
    if (!state) return;
    const rows = state.rows.value;
    // Update priority on every 10th row
    const newRows = rows.map((row, i) => {
      if (i % 10 !== 0) return row;
      const newPriority: "low" | "high" =
        row.details.metadata.priority === "high" ? "low" : "high";
      return {
        ...row,
        details: {
          ...row.details,
          metadata: {
            ...row.details.metadata,
            priority: newPriority,
          },
        },
      };
    });
    state.rows.value = newRows;
  },

  updateNestedArray(): void {
    if (!state) return;
    const rows = state.rows.value;
    // Add a tag to every 10th row
    const newRows = rows.map((row, i) => {
      if (i % 10 !== 0) return row;
      return {
        ...row,
        details: {
          ...row.details,
          tags: [...row.details.tags, "updated"],
        },
      };
    });
    state.rows.value = newRows;
  },

  updateSingleRow(index: number): void {
    if (!state) return;
    const rows = state.rows.value;
    const row = rows[index];
    if (!row) return;
    // Update just the label of one row
    const newRows = [...rows];
    newRows[index] = { ...row, label: row.label + " (updated)" };
    state.rows.value = newRows;
  },

  toggleSelection(index: number): void {
    if (!state) return;
    const row = state.rows.value[index];
    if (!row) return;
    // Toggle selection - if already selected, deselect; otherwise select
    state.selectedId.value = state.selectedId.value === row.id ? null : row.id;
  },

  filterRows(priority: "low" | "medium" | "high" | "all"): void {
    if (!state) return;
    state.filter.value = priority;
  },

  batchUpdate(): void {
    if (!state) return;
    // Batch multiple updates together
    batch(() => {
      // Update selection
      const rows = state!.rows.value;
      if (rows.length > 0) {
        state!.selectedId.value = rows[0]!.id;
      }
      // Update first 10 rows' labels
      const newRows = rows.map((row, i) => {
        if (i >= 10) return row;
        return { ...row, label: row.label + " [batch]" };
      });
      state!.rows.value = newRows;
      // Change filter
      state!.filter.value = "all";
    });
  },

  clear(): void {
    if (!state) return;
    state.rows.value = [];
    state.selectedId.value = null;
    state.filter.value = "all";
  },
};

export default balisesAdvancedSuite;
