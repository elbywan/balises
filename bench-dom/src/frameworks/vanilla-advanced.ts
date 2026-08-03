/**
 * Vanilla JS Advanced DOM Benchmark Implementation
 *
 * Hand-optimized vanilla JavaScript for advanced scenarios.
 * Uses template cloning and event delegation for maximum performance.
 */

import type { AdvancedBenchmarkSuite, NestedRow } from "../types.js";
import { generateNestedRows } from "../types.js";

let rows: NestedRow[] = [];
let selectedId: number | null = null;
let filter: "low" | "medium" | "high" | "all" = "all";
let tbody: HTMLTableSectionElement | null = null;
let container: HTMLElement | null = null;

// Map from row id to DOM element for O(1) lookups
const rowElements = new Map<number, HTMLTableRowElement>();

// Pre-created template for row cloning
let rowTemplate: HTMLTableRowElement | null = null;

function getRowTemplate(): HTMLTableRowElement {
  if (!rowTemplate) {
    const template = document.createElement("template");
    template.innerHTML = `<tr>
      <td class="col-md-1"></td>
      <td class="col-md-4"><a class="lbl"></a></td>
      <td class="col-md-2"><span class="badge"></span></td>
      <td class="col-md-3"></td>
      <td class="col-md-1"><a class="remove"><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
      <td class="col-md-1"></td>
    </tr>`;
    rowTemplate = template.content.firstElementChild as HTMLTableRowElement;
  }
  return rowTemplate;
}

function createRowElement(row: NestedRow): HTMLTableRowElement {
  const tr = getRowTemplate().cloneNode(true) as HTMLTableRowElement;
  tr.dataset.id = String(row.id);
  tr.dataset.priority = row.details.metadata.priority;

  const td1 = tr.children[0] as HTMLTableCellElement;
  td1.textContent = String(row.id);

  const td2 = tr.children[1] as HTMLTableCellElement;
  const a1 = td2.firstElementChild as HTMLAnchorElement;
  a1.textContent = row.label;

  const td3 = tr.children[2] as HTMLTableCellElement;
  const badge = td3.firstElementChild as HTMLSpanElement;
  badge.textContent = row.details.metadata.priority;

  const td4 = tr.children[3] as HTMLTableCellElement;
  td4.textContent = row.details.tags.join(", ");

  return tr;
}

function selectRowById(id: number): void {
  if (selectedId !== null) {
    const prev = rowElements.get(selectedId);
    if (prev) {
      prev.className = "";
    }
  }

  selectedId = id;
  const current = rowElements.get(id);
  if (current) {
    current.className = "danger";
  }
}

function removeRowById(id: number): void {
  const index = rows.findIndex((r) => r.id === id);
  if (index === -1) return;

  rows.splice(index, 1);
  const tr = rowElements.get(id);
  if (tr) {
    tr.remove();
    rowElements.delete(id);
  }
}

// Event delegation handler
function handleTableClick(event: Event): void {
  const target = event.target as HTMLElement;

  // Find the closest anchor
  const anchor = target.closest("a");
  if (!anchor) return;

  // Find the row
  const tr = anchor.closest("tr");
  if (!tr) return;

  const id = Number(tr.dataset.id);
  if (isNaN(id)) return;

  if (anchor.classList.contains("lbl")) {
    selectRowById(id);
  } else if (anchor.classList.contains("remove")) {
    removeRowById(id);
  }
}

function renderAll(): void {
  if (!tbody) return;

  tbody.innerHTML = "";
  rowElements.clear();

  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    if (filter !== "all" && row.details.metadata.priority !== filter) {
      continue;
    }
    const tr = createRowElement(row);
    rowElements.set(row.id, tr);
    fragment.appendChild(tr);
  }
  tbody.appendChild(fragment);

  if (selectedId !== null) {
    const selected = rowElements.get(selectedId);
    if (selected) {
      selected.className = "danger";
    }
  }
}

function updateRowElement(row: NestedRow): void {
  const tr = rowElements.get(row.id);
  if (!tr) return;

  // Update label
  const td2 = tr.children[1] as HTMLTableCellElement;
  const a1 = td2.firstElementChild as HTMLAnchorElement;
  a1.textContent = row.label;

  // Update priority badge
  const td3 = tr.children[2] as HTMLTableCellElement;
  const badge = td3.firstElementChild as HTMLSpanElement;
  badge.textContent = row.details.metadata.priority;
  tr.dataset.priority = row.details.metadata.priority;

  // Update tags
  const td4 = tr.children[3] as HTMLTableCellElement;
  td4.textContent = row.details.tags.join(", ");
}

export const vanillaAdvancedSuite: AdvancedBenchmarkSuite = {
  name: "vanilla",

  init(target: HTMLElement): void {
    container = target;

    const table = document.createElement("table");
    table.className = "table table-hover table-striped test-data";
    tbody = document.createElement("tbody");
    table.appendChild(tbody);
    target.appendChild(table);

    // Event delegation - single listener for all rows
    table.addEventListener("click", handleTableClick);
  },

  cleanup(): void {
    rows = [];
    selectedId = null;
    filter = "all";
    rowElements.clear();
    tbody = null;
    if (container) {
      container.innerHTML = "";
    }
  },

  createNested1000(): void {
    rows = generateNestedRows(1000);
    renderAll();
  },

  updateNestedProperty(): void {
    for (let i = 0; i < rows.length; i += 10) {
      const row = rows[i]!;
      const newPriority =
        row.details.metadata.priority === "high" ? "low" : "high";
      row.details.metadata.priority = newPriority;
      updateRowElement(row);
    }
  },

  updateNestedArray(): void {
    for (let i = 0; i < rows.length; i += 10) {
      const row = rows[i]!;
      row.details.tags.push("updated");
      updateRowElement(row);
    }
  },

  updateSingleRow(index: number): void {
    const row = rows[index];
    if (!row) return;
    row.label = row.label + " (updated)";
    updateRowElement(row);
  },

  toggleSelection(index: number): void {
    const row = rows[index];
    if (!row) return;

    if (selectedId === row.id) {
      // Deselect
      const current = rowElements.get(selectedId);
      if (current) {
        current.className = "";
      }
      selectedId = null;
    } else {
      // Deselect previous
      if (selectedId !== null) {
        const prev = rowElements.get(selectedId);
        if (prev) {
          prev.className = "";
        }
      }
      // Select new
      selectedId = row.id;
      const current = rowElements.get(row.id);
      if (current) {
        current.className = "danger";
      }
    }
  },

  filterRows(priority: "low" | "medium" | "high" | "all"): void {
    filter = priority;
    renderAll();
  },

  batchUpdate(): void {
    // Select first row
    if (rows.length > 0) {
      selectedId = rows[0]!.id;
    }
    // Update first 10 rows
    for (let i = 0; i < 10 && i < rows.length; i++) {
      const row = rows[i]!;
      row.label = row.label + " [batch]";
    }
    // Set filter to all
    filter = "all";
    // Re-render everything
    renderAll();
  },

  clear(): void {
    rows = [];
    selectedId = null;
    filter = "all";
    rowElements.clear();
    if (tbody) {
      tbody.innerHTML = "";
    }
  },
};

export default vanillaAdvancedSuite;
