/**
 * Balises "compiled" DOM Benchmark Implementation (prospective).
 *
 * Measures the ceiling of a compiled-template architecture: the row is
 * built with direct DOM construction (what a template compiler would
 * emit instead of cloneNode + binding setup), while reactivity uses the
 * real balises primitives (signals, direct subscriptions, is() slots).
 *
 * This is NOT the current library - it is an experiment to quantify
 * whether compilation could make balises competitive on the creation
 * scenarios. The label update uses a direct signal subscription (no
 * computed wrapper); the selection highlight keeps the is() slot for
 * O(1) updates.
 */

import { signal, computed, type Signal } from "balises";
import type { BenchmarkSuite } from "../types.js";

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
let nextId = 1;

function buildLabel(): string {
  return (
    adjectives[Math.floor(Math.random() * adjectives.length)] +
    " " +
    colors[Math.floor(Math.random() * colors.length)] +
    " " +
    nouns[Math.floor(Math.random() * nouns.length)]
  );
}

interface RowEntry {
  id: number;
  tr: HTMLTableRowElement;
  labelText: Text;
  labelSignal: Signal<string>;
  unlabel: () => void;
  classComputed: ReturnType<typeof computed<string>>;
  unclass: () => void;
}

let container: HTMLElement | null = null;
let tbody: HTMLElement | null = null;
const rows: RowEntry[] = [];
const selectedId = signal<number | null>(null);

/** Direct DOM row construction - what a compiled template would emit. */
function createRow(id: number, label: string): RowEntry {
  const tr = document.createElement("tr");
  const td1 = document.createElement("td");
  td1.className = "col-md-1";
  td1.textContent = String(id);
  const td2 = document.createElement("td");
  td2.className = "col-md-4";
  const a2 = document.createElement("a");
  const labelText = document.createTextNode(label);
  a2.appendChild(labelText);
  a2.addEventListener("click", () => {
    selectedId.value = id;
  });
  td2.appendChild(a2);
  const td3 = document.createElement("td");
  td3.className = "col-md-1";
  const a3 = document.createElement("a");
  const span = document.createElement("span");
  span.className = "glyphicon glyphicon-remove";
  span.setAttribute("aria-hidden", "true");
  a3.appendChild(span);
  a3.addEventListener("click", () => {
    removeById(id);
  });
  td3.appendChild(a3);
  const td4 = document.createElement("td");
  td4.className = "col-md-6";
  tr.append(td1, td2, td3, td4);

  // Label: direct signal subscription - what compiled bindings emit.
  const labelSignal = signal(label);
  const unlabel = labelSignal.subscribe(() => {
    labelText.nodeValue = labelSignal.value;
  });
  // Class: computed + is() slot for O(1) selection updates.
  const classComputed = computed(() => (selectedId.is(id) ? "danger" : ""));
  const unclass = classComputed.subscribe(() => {
    tr.className = classComputed.value;
  });
  return { id, tr, labelText, labelSignal, unlabel, classComputed, unclass };
}

function removeEntry(entry: RowEntry): void {
  entry.unlabel();
  entry.unclass();
  entry.tr.remove();
  const i = rows.indexOf(entry);
  if (i >= 0) rows.splice(i, 1);
}

function removeById(id: number): void {
  const entry = rows.find((r) => r.id === id);
  if (entry) removeEntry(entry);
}

function clearAll(): void {
  for (const entry of rows) {
    entry.unlabel();
    entry.unclass();
  }
  rows.length = 0;
  tbody?.replaceChildren();
}

function appendRows(count: number): void {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const entry = createRow(nextId++, buildLabel());
    rows.push(entry);
    frag.appendChild(entry.tr);
  }
  tbody!.appendChild(frag);
}

export const balisesCompiledSuite: BenchmarkSuite = {
  name: "balises-compiled",

  init(target: HTMLElement): void {
    container = target;
    const table = document.createElement("table");
    table.className = "table table-hover table-striped test-data";
    const tbodyEl = document.createElement("tbody");
    table.appendChild(tbodyEl);
    target.appendChild(table);
    tbody = tbodyEl;
  },

  cleanup(): void {
    clearAll();
    tbody = null;
    nextId = 1;
    if (container) {
      container.innerHTML = "";
      container = null;
    }
  },

  create1000(): void {
    clearAll();
    appendRows(1000);
  },

  create10000(): void {
    clearAll();
    appendRows(10000);
  },

  append1000(): void {
    appendRows(1000);
  },

  updateEvery10th(): void {
    for (let i = 0; i < rows.length; i += 10) {
      const entry = rows[i]!;
      entry.labelSignal.value = entry.labelSignal.value + " !!!";
    }
  },

  selectRow(index: number): void {
    const entry = rows[index];
    if (entry) selectedId.value = entry.id;
  },

  swapRows(): void {
    if (rows.length < 999) return;
    const a = rows[1]!;
    const b = rows[998]!;
    rows[1] = b;
    rows[998] = a;
    // Swap their DOM positions: move a after b.
    tbody!.insertBefore(a.tr, b.tr.nextSibling);
  },

  removeRow(index: number): void {
    const entry = rows[index];
    if (entry) removeEntry(entry);
  },

  clear(): void {
    clearAll();
  },
};

export default balisesCompiledSuite;
