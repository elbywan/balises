/**
 * Vanilla JS DOM Benchmark Implementation
 *
 * Maximum performance raw DOM implementation matching js-framework-benchmark:
 * - Template cloning (cloneNode) - faster than createElement
 * - nodeValue on text nodes - faster than textContent
 * - Detached tbody during bulk operations - prevents layout thrashing
 * - Parallel arrays for O(1) index access
 * - Event delegation with data_id property on TR elements
 * - textContent = "" for clearing - fastest method
 *
 * Reference: https://github.com/krausest/js-framework-benchmark/blob/master/frameworks/keyed/vanillajs/src/Main.js
 */

import type { BenchmarkSuite } from "../types.js";

// Row type matching the benchmark
interface Row {
  id: number;
  label: string;
}

// Random data generation (consistent with js-framework-benchmark)
const adjectives = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
  "important",
  "inexpensive",
  "cheap",
  "expensive",
  "fancy",
];
const colors = [
  "red",
  "yellow",
  "blue",
  "green",
  "pink",
  "brown",
  "purple",
  "brown",
  "white",
  "black",
  "orange",
];
const nouns = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard",
];

// Inline random for performance (avoid function call overhead in hot loop)
const _random = (max: number) => Math.round(Math.random() * 1000) % max;

let nextId = 1;

function buildData(count: number): Row[] {
  const data: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    // String concatenation is faster than template literals in hot loops
    data[i] = {
      id: nextId++,
      label:
        adjectives[_random(adjectives.length)] +
        " " +
        colors[_random(colors.length)] +
        " " +
        nouns[_random(nouns.length)],
    };
  }
  return data;
}

// Pre-built row template for cloning - matches official benchmark exactly
// Spaces create text nodes for nodeValue updates
const rowTemplate = document.createElement("tr");
rowTemplate.innerHTML =
  "<td class='col-md-1'> </td><td class='col-md-4'><a> </a></td><td class='col-md-1'><a><span class='glyphicon glyphicon-remove' aria-hidden='true'></span></a></td><td class='col-md-6'></td>";

// Extended TR element with data_id property (matches official benchmark)
interface RowElement extends HTMLTableRowElement {
  data_id: number;
}

let data: Row[] = [];
let rows: RowElement[] = []; // Parallel array of DOM references
const idToIndex = new Map<number, number>(); // O(1) id → index lookup
let selectedRow: RowElement | undefined;
let tbody: HTMLTableSectionElement | null = null;
let table: HTMLTableElement | null = null;
let container: HTMLElement | null = null;

// Cache child node references from template structure
// Template: <tr><td> </td><td><a> </a></td><td><a><span></span></a></td><td></td></tr>
function createRow(rowData: Row): RowElement {
  const tr = rowTemplate.cloneNode(true) as RowElement;
  const td1 = tr.firstChild as HTMLTableCellElement;
  const a = td1.nextSibling!.firstChild as HTMLAnchorElement;

  tr.data_id = rowData.id;
  // nodeValue auto-converts numbers to strings, no need for String()
  (td1.firstChild as Text).nodeValue = rowData.id as unknown as string;
  (a.firstChild as Text).nodeValue = rowData.label;

  return tr;
}

function unselect(): void {
  if (selectedRow !== undefined) {
    selectedRow.className = "";
    selectedRow = undefined;
  }
}

function select(idx: number): void {
  unselect();
  selectedRow = rows[idx];
  if (selectedRow) {
    selectedRow.className = "danger";
  }
}

function removeAllRows(): void {
  if (tbody) {
    // textContent = "" is the fastest clearing method (benchmarked in official repo)
    tbody.textContent = "";
  }
}

function appendRows(newData: Row[], detach = false): void {
  if (!tbody || !table) return;

  const startIdx = rows.length;
  const tbodyRef = tbody;
  const tableRef = table;

  // Detach tbody during bulk inserts to avoid per-row layout recalculations.
  // Only do this when explicitly requested (i.e. bulk create, not append).
  if (detach) {
    tbodyRef.remove();
  }

  for (let i = 0; i < newData.length; i++) {
    const rowData = newData[i]!;
    const tr = createRow(rowData);
    const idx = startIdx + i;
    rows[idx] = tr;
    data[idx] = rowData;
    idToIndex.set(rowData.id, idx);
    tbodyRef.appendChild(tr);
  }

  if (detach) {
    tableRef.insertBefore(tbodyRef, null);
  }
}

// Event delegation handler - matches official benchmark pattern
function handleClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Walk up to find TD
  let td = target;
  while (td.tagName !== "TD") {
    if (!td.parentNode) return;
    td = td.parentNode as HTMLElement;
  }

  const tr = td.parentNode as RowElement | null;
  if (!tr) return;

  const id = tr.data_id;
  if (id === undefined) return;

  // O(1) index lookup via map
  const idx = idToIndex.get(id);
  if (idx === undefined) return;

  // Check which column was clicked by comparing to cached child nodes
  const children = tr.childNodes;
  if (children[1] === td) {
    // Label column (2nd td) - select
    select(idx);
  } else if (children[2] === td) {
    // Remove column (3rd td) - delete
    deleteRow(idx);
  }
}

function deleteRow(idx: number): void {
  const row = rows[idx];
  if (!row) return;

  // Remove from DOM
  row.remove();

  // Remove from arrays - splice is O(n) but maintains order (required for keyed benchmark)
  const [removed] = data.splice(idx, 1);
  rows.splice(idx, 1);

  // Remove from map and fix indices for all rows that shifted
  if (removed) idToIndex.delete(removed.id);
  for (let i = idx; i < data.length; i++) {
    idToIndex.set(data[i]!.id, i);
  }

  // Clear selection if deleted row was selected
  if (selectedRow === row) {
    selectedRow = undefined;
  }
}

export const vanillaSuite: BenchmarkSuite = {
  name: "vanilla",

  init(target: HTMLElement): void {
    container = target;

    table = document.createElement("table");
    table.className = "table table-hover table-striped test-data";
    tbody = document.createElement("tbody");
    table.appendChild(tbody);
    target.appendChild(table);

    // Event delegation on tbody
    tbody.addEventListener("click", handleClick);
  },

  cleanup(): void {
    data = [];
    rows = [];
    selectedRow = undefined;
    tbody = null;
    table = null;
    nextId = 1;
    if (container) {
      container.innerHTML = "";
    }
  },

  create1000(): void {
    removeAllRows();
    data = [];
    rows = [];
    unselect();
    appendRows(buildData(1000), true);
  },

  create10000(): void {
    removeAllRows();
    data = [];
    rows = [];
    unselect();
    appendRows(buildData(10000), true);
  },

  append1000(): void {
    appendRows(buildData(1000));
  },

  updateEvery10th(): void {
    for (let i = 0; i < data.length; i += 10) {
      const rowData = data[i]!;
      rowData.label += " !!!";
      // Direct nodeValue update - fastest text update method
      rows[i]!.childNodes[1]!.childNodes[0]!.firstChild!.nodeValue =
        rowData.label;
    }
  },

  selectRow(index: number): void {
    if (data[index]) {
      select(index);
    }
  },

  swapRows(): void {
    if (data.length <= 998 || !tbody) return;

    // Swap data references
    const tmpData = data[1]!;
    data[1] = data[998]!;
    data[998] = tmpData;

    // Swap DOM nodes using a placeholder to avoid positional assumptions.
    // replaceWith is cleaner than insertBefore chains and avoids shift effects.
    const row1 = rows[1]!;
    const row998 = rows[998]!;
    const placeholder = document.createTextNode("");
    row1.replaceWith(placeholder);
    row998.replaceWith(row1);
    placeholder.replaceWith(row998);

    // Swap JS references
    rows[1] = row998;
    rows[998] = row1;
  },

  removeRow(index: number): void {
    deleteRow(index);
  },

  clear(): void {
    removeAllRows();
    data = [];
    rows = [];
    unselect();
  },
};

export default vanillaSuite;
