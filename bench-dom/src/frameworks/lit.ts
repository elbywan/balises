/**
 * lit-html DOM Benchmark Implementation
 *
 * Uses lit-html for efficient template-based rendering following official
 * js-framework-benchmark patterns:
 * - repeat() directive for keyed rendering
 * - Event delegation on table for interactions
 * - In-place mutations for updates
 * - selected property on row objects
 */

import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import type { BenchmarkSuite } from "../types.js";

// Row type with selected flag (official benchmark pattern)
interface Row {
  id: number;
  label: string;
  selected: boolean;
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
      selected: false,
    };
  }
  return data;
}

let data: Row[] = [];
let selectedIdx = -1;
let container: HTMLElement | null = null;
let renderTarget: HTMLDivElement | null = null;

// Event delegation handler (official benchmark pattern)
function interact(e: Event): void {
  const target = e.target as HTMLElement;
  const td = target.closest("td");
  if (!td) return;

  const interaction = td.getAttribute("data-interaction");
  const tr = td.parentNode as HTMLTableRowElement | null;
  if (!tr) return;

  const id = parseInt(tr.id, 10);
  if (isNaN(id)) return;

  if (interaction === "delete") {
    del(id);
  } else if (interaction === "select") {
    select(id);
  }
}

function del(id: number): void {
  const idx = data.findIndex((d) => d.id === id);
  if (idx !== -1) {
    data.splice(idx, 1);
    if (selectedIdx === idx) {
      selectedIdx = -1;
    } else if (selectedIdx > idx) {
      selectedIdx--;
    }
    renderApp();
  }
}

function select(id: number): void {
  if (selectedIdx > -1 && data[selectedIdx]) {
    data[selectedIdx]!.selected = false;
  }
  selectedIdx = data.findIndex((d) => d.id === id);
  if (selectedIdx > -1 && data[selectedIdx]) {
    data[selectedIdx]!.selected = true;
  }
  renderApp();
}

function renderApp(): void {
  if (!renderTarget) return;

  const template = html`
    <table @click=${interact} class="table table-hover table-striped test-data">
      <tbody>
        ${repeat(
          data,
          (item) => item.id,
          (item) => html`
            <tr id=${item.id} class=${item.selected ? "danger" : ""}>
              <td class="col-md-1">${item.id}</td>
              <td class="col-md-4" data-interaction="select">
                <a>${item.label}</a>
              </td>
              <td class="col-md-1" data-interaction="delete">
                <a>
                  <span
                    class="glyphicon glyphicon-remove"
                    aria-hidden="true"
                  ></span>
                </a>
              </td>
              <td class="col-md-6"></td>
            </tr>
          `,
        )}
      </tbody>
    </table>
  `;

  render(template, renderTarget);
}

export const litSuite: BenchmarkSuite = {
  name: "lit-html",

  init(target: HTMLElement): void {
    container = target;
    // Create a fresh render target for lit-html
    renderTarget = document.createElement("div");
    container.appendChild(renderTarget);
    data = [];
    selectedIdx = -1;
    renderApp();
  },

  cleanup(): void {
    data = [];
    selectedIdx = -1;
    nextId = 1;
    // Remove the render target entirely - lit-html state goes with it
    if (renderTarget && renderTarget.parentNode) {
      renderTarget.parentNode.removeChild(renderTarget);
    }
    renderTarget = null;
    container = null;
  },

  create1000(): void {
    data = buildData(1000);
    selectedIdx = -1;
    renderApp();
  },

  create10000(): void {
    data = buildData(10000);
    selectedIdx = -1;
    renderApp();
  },

  append1000(): void {
    data = data.concat(buildData(1000));
    renderApp();
  },

  updateEvery10th(): void {
    // In-place mutation (official benchmark pattern)
    for (let i = 0; i < data.length; i += 10) {
      data[i]!.label += " !!!";
    }
    renderApp();
  },

  selectRow(index: number): void {
    const row = data[index];
    if (row) {
      select(row.id);
    }
  },

  swapRows(): void {
    if (data.length > 998) {
      const tmp = data[1]!;
      data[1] = data[998]!;
      data[998] = tmp;
      renderApp();
    }
  },

  removeRow(index: number): void {
    const row = data[index];
    if (row) {
      del(row.id);
    }
  },

  clear(): void {
    data = [];
    selectedIdx = -1;
    renderApp();
  },
};

export default litSuite;
