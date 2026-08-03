/**
 * Balises DOM Benchmark Implementation
 *
 * Uses balises templating with each() for keyed list rendering.
 * Optimizations:
 * - signal.is() for O(1) selection updates (only 2 rows recompute on selection change)
 * - peek() to capture static row id without creating reactive dependency
 */

import { html as baseHtml, signal } from "balises";
import eachPlugin, { each } from "balises/each";
import type { BenchmarkSuite } from "../types.js";

const html = baseHtml.with(eachPlugin);

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

const random = (max: number) => Math.round(Math.random() * 1000) % max;

let nextId = 1;

function buildData(count: number): Row[] {
  const data: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
    };
  }
  return data;
}

interface State {
  rows: Signal<Row[]>;
  selectedId: Signal<number | null>;
}

let state: State | null = null;
let dispose: (() => void) | null = null;
let container: HTMLElement | null = null;

function createState(): State {
  return {
    rows: signal<Row[]>([]),
    selectedId: signal<number | null>(null),
  };
}

function render(s: State, target: HTMLElement): () => void {
  const template = html`
    <table class="table table-hover table-striped test-data">
      <tbody>
        ${each(
          s.rows,
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
                <td class="col-md-1">
                  <a @click=${() => removeRow(id)}>
                    <span
                      class="glyphicon glyphicon-remove"
                      aria-hidden="true"
                    ></span>
                  </a>
                </td>
                <td class="col-md-6"></td>
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

export const balisesSuite: BenchmarkSuite = {
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
    nextId = 1;
    if (container) {
      container.innerHTML = "";
    }
  },

  create1000(): void {
    if (!state) return;
    state.rows.value = buildData(1000);
  },

  create10000(): void {
    if (!state) return;
    state.rows.value = buildData(10000);
  },

  append1000(): void {
    if (!state) return;
    state.rows.value = [...state.rows.value, ...buildData(1000)];
  },

  updateEvery10th(): void {
    if (!state) return;
    const rows = state.rows.value;
    const newRows = rows.map((row, i) =>
      i % 10 === 0 ? { ...row, label: row.label + " !!!" } : row,
    );
    state.rows.value = newRows;
  },

  selectRow(index: number): void {
    if (!state) return;
    const row = state.rows.value[index];
    if (row) {
      state.selectedId.value = row.id;
    }
  },

  swapRows(): void {
    if (!state) return;
    const rows = state.rows.value;
    if (rows.length < 999) return;
    const newRows = [...rows];
    const temp = newRows[1]!;
    newRows[1] = newRows[998]!;
    newRows[998] = temp;
    state.rows.value = newRows;
  },

  removeRow(index: number): void {
    if (!state) return;
    const rows = state.rows.value;
    const row = rows[index];
    if (row) {
      state.rows.value = rows.filter((r) => r.id !== row.id);
    }
  },

  clear(): void {
    if (!state) return;
    state.rows.value = [];
  },
};

export default balisesSuite;
