/* @jsxImportSource vue */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Vue JSX types don't support children prop properly
/**
 * Vue DOM Benchmark Implementation
 *
 * Uses Vue 3 with Composition API and JSX, following normal idiomatic Vue:
 * - reactive() for the shared state object
 * - Direct array mutations (push, splice, swap) — tracked automatically by Vue's proxy
 */

import { createApp, reactive, defineComponent, type App } from "vue";
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

// Reactive state
interface State {
  rows: Row[];
  selectedId: number | null;
}

let state: State | null = null;
let app: App | null = null;
let container: HTMLElement | null = null;

function createVueApp() {
  state = reactive<State>({ rows: [], selectedId: null });

  const App = defineComponent({
    setup() {
      const handleSelect = (id: number) => {
        state!.selectedId = id;
      };

      const handleRemove = (id: number) => {
        const idx = state!.rows.findIndex((row) => row.id === id);
        if (idx !== -1) {
          state!.rows.splice(idx, 1);
        }
      };

      return () => (
        <table class="table table-hover table-striped test-data">
          <tbody>
            {state!.rows.map((row) => (
              <tr
                key={row.id}
                class={row.id === state!.selectedId ? "danger" : ""}
              >
                <td class="col-md-1">{row.id}</td>
                <td class="col-md-4">
                  <a onClick={() => handleSelect(row.id)}>{row.label}</a>
                </td>
                <td class="col-md-1">
                  <a onClick={() => handleRemove(row.id)}>
                    <span
                      class="glyphicon glyphicon-remove"
                      aria-hidden="true"
                    />
                  </a>
                </td>
                <td class="col-md-6" />
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
  });

  return createApp(App);
}

export const vueSuite: BenchmarkSuite = {
  name: "vue",

  init(target: HTMLElement): void {
    container = target;
    app = createVueApp();
    app.mount(target);
  },

  cleanup(): void {
    if (app) {
      app.unmount();
      app = null;
    }
    state = null;
    nextId = 1;
    if (container) {
      container.innerHTML = "";
    }
  },

  create1000(): void {
    if (!state) return;
    state.rows = buildData(1000);
  },

  create10000(): void {
    if (!state) return;
    state.rows = buildData(10000);
  },

  append1000(): void {
    if (!state) return;
    state.rows.push(...buildData(1000));
  },

  updateEvery10th(): void {
    if (!state) return;
    for (let i = 0; i < state.rows.length; i += 10) {
      state.rows[i]!.label += " !!!";
    }
  },

  selectRow(index: number): void {
    if (!state) return;
    const row = state.rows[index];
    if (row) {
      state.selectedId = row.id;
    }
  },

  swapRows(): void {
    if (!state) return;
    const rows = state.rows;
    if (rows.length > 998) {
      const tmp = rows[1]!;
      rows[1] = rows[998]!;
      rows[998] = tmp;
    }
  },

  removeRow(index: number): void {
    if (!state) return;
    const row = state.rows[index];
    if (row) {
      const idx = state.rows.findIndex((r) => r.id === row.id);
      if (idx !== -1) {
        state.rows.splice(idx, 1);
      }
    }
  },

  clear(): void {
    if (!state) return;
    state.rows = [];
  },
};

export default vueSuite;
