/**
 * Svelte DOM Benchmark Implementation
 *
 * Svelte 5 runes: shared $state module + component with keyed each blocks.
 */

import { mount, unmount } from "svelte";
import App from "./svelte-app.svelte";
import { state } from "./svelte-state.svelte.js";
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

function buildData(count: number): Row[] {
  const data: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label:
        adjectives[Math.floor(Math.random() * adjectives.length)] +
        " " +
        colors[Math.floor(Math.random() * colors.length)] +
        " " +
        nouns[Math.floor(Math.random() * nouns.length)],
    };
  }
  return data;
}

let container: HTMLElement | null = null;
let mounted: ReturnType<typeof mount> | null = null;

export const svelteSuite: BenchmarkSuite = {
  name: "svelte",

  init(target: HTMLElement): void {
    container = target;
    state.rows = [];
    state.selectedId = null;
    mounted = mount(App, { target });
  },

  cleanup(): void {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    state.rows = [];
    state.selectedId = null;
    if (container) {
      container.innerHTML = "";
      container = null;
    }
    nextId = 1;
  },

  create1000(): void {
    state.rows = buildData(1000);
  },

  create10000(): void {
    state.rows = buildData(10000);
  },

  append1000(): void {
    state.rows = [...state.rows, ...buildData(1000)];
  },

  updateEvery10th(): void {
    state.rows = state.rows.map((row, i) =>
      i % 10 === 0 ? { ...row, label: row.label + " !!!" } : row,
    );
  },

  selectRow(index: number): void {
    const row = state.rows[index];
    if (row) state.selectedId = row.id;
  },

  swapRows(): void {
    const rows = state.rows;
    if (rows.length < 999) return;
    const newRows = [...rows];
    const temp = newRows[1]!;
    newRows[1] = newRows[998]!;
    newRows[998] = temp;
    state.rows = newRows;
  },

  removeRow(index: number): void {
    const row = state.rows[index];
    if (row) {
      state.rows = state.rows.filter((r) => r.id !== row.id);
    }
  },

  clear(): void {
    state.rows = [];
  },
};

export default svelteSuite;
