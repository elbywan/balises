/* @jsxImportSource solid-js */
/**
 * Solid DOM Benchmark Implementation
 *
 * Uses SolidJS with fine-grained reactivity following idiomatic Solid patterns:
 * - createStore for the rows array (fine-grained proxy-based reactivity)
 * - createSelector for O(1) selection updates
 * - Direct store path updates for surgical label changes
 */

import { createSignal, For, createSelector } from "solid-js";
import { createStore } from "solid-js/store";
import { render } from "solid-js/web";
import type { BenchmarkSuite } from "../types.js";

// Plain row type — store proxy handles fine-grained reactivity
interface Row {
  id: number;
  label: string;
}

// Store for external control
interface Store {
  rows: Row[];
  setRows: ReturnType<typeof createStore<Row[]>>[1];
  selected: () => number | null;
  setSelected: (id: number | null) => void;
}

let store: Store | null = null;
let dispose: (() => void) | null = null;
let container: HTMLElement | null = null;

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

function App() {
  const [rows, setRows] = createStore<Row[]>([]);
  const [selected, setSelected] = createSignal<number | null>(null);

  // createSelector provides O(1) selection - only old and new rows update
  const isSelected = createSelector(selected);

  store = {
    rows,
    setRows,
    selected,
    setSelected,
  };

  return (
    <table class="table table-hover table-striped test-data">
      <tbody>
        <For each={rows}>
          {(row) => {
            const rowId = row.id;
            return (
              <tr class={isSelected(rowId) ? "danger" : ""}>
                <td class="col-md-1" textContent={rowId} />
                <td class="col-md-4">
                  <a
                    onClick={() => setSelected(rowId)}
                    textContent={row.label}
                  />
                </td>
                <td class="col-md-1">
                  <a
                    onClick={() =>
                      setRows((d) =>
                        d.toSpliced(
                          d.findIndex((item) => item.id === rowId),
                          1,
                        ),
                      )
                    }
                  >
                    <span
                      class="glyphicon glyphicon-remove"
                      aria-hidden="true"
                    />
                  </a>
                </td>
                <td class="col-md-6" />
              </tr>
            );
          }}
        </For>
      </tbody>
    </table>
  );
}

export const solidSuite: BenchmarkSuite = {
  name: "solid",

  init(target: HTMLElement): void {
    container = target;
    dispose = render(() => <App />, target);
  },

  cleanup(): void {
    if (dispose) {
      dispose();
      dispose = null;
    }
    store = null;
    nextId = 1;
    if (container) {
      container.innerHTML = "";
    }
  },

  create1000(): void {
    store?.setRows(buildData(1000));
  },

  create10000(): void {
    store?.setRows(buildData(10000));
  },

  append1000(): void {
    if (!store) return;
    store.setRows((d) => [...d, ...buildData(1000)]);
  },

  updateEvery10th(): void {
    if (!store) return;
    for (let i = 0; i < store.rows.length; i += 10) {
      store.setRows(i, "label", (l) => l + " !!!");
    }
  },

  selectRow(index: number): void {
    if (!store) return;
    const row = store.rows[index];
    if (row) {
      store.setSelected(row.id);
    }
  },

  swapRows(): void {
    if (!store) return;
    if (store.rows.length > 998) {
      const row1 = store.rows[1]!;
      const row998 = store.rows[998]!;
      store.setRows((d) => {
        const newData = d.slice();
        newData[1] = row998;
        newData[998] = row1;
        return newData;
      });
    }
  },

  removeRow(index: number): void {
    if (!store) return;
    const row = store.rows[index];
    if (row) {
      store.setRows((d) =>
        d.toSpliced(
          d.findIndex((item) => item.id === row.id),
          1,
        ),
      );
    }
  },

  clear(): void {
    store?.setRows([]);
  },
};

export default solidSuite;
