#!/usr/bin/env node
/**
 * Focused benchmark on each() internals.
 */

import { signal, computed } from "../dist/esm/index.js";
import { html as baseHtml } from "../dist/esm/template.js";
import eachPlugin, { each } from "../dist/esm/each.js";
import { ReadonlySignal } from "../dist/esm/signals/signal.js";

const html = baseHtml.with(eachPlugin);

const WARMUP = 3;
const RUNS = 20;
const COUNT = 1000;

function bench(name, fn) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    fn();
  }

  // Run
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  // Stats
  times.sort((a, b) => a - b);
  const trimmed = times.slice(Math.floor(RUNS * 0.2), Math.floor(RUNS * 0.8));
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

  console.log(`${name.padEnd(50)} ${mean.toFixed(2).padStart(8)}ms`);
  return mean;
}

function buildData(count) {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = { id: i + 1, label: `Item ${i + 1}` };
  }
  return data;
}

console.log("\n=== each() Internals Breakdown ===\n");
console.log(`Creating ${COUNT} rows\n`);
console.log("-".repeat(65));

// 1. Just create the row template 1000 times (should be cached)
const rowTemplateStrings = ["<tr><td>", "</td><td>", "</td></tr>"];
Object.freeze(rowTemplateStrings);

bench("1. Render cached template 1000x", () => {
  const fragments = [];
  for (let i = 0; i < COUNT; i++) {
    const { fragment, dispose } = html`<tr>
      <td>${i}</td>
      <td>Label ${i}</td>
    </tr>`.render();
    fragments.push(fragment);
    dispose();
  }
  return fragments.length;
});

// 2. Same template with signal bindings
bench("2. Render template with signal 1000x", () => {
  const fragments = [];
  for (let i = 0; i < COUNT; i++) {
    const s = signal({ id: i, label: `Label ${i}` });
    const { fragment, dispose } = html`<tr>
      <td>${() => s.value.id}</td>
      <td>${() => s.value.label}</td>
    </tr>`.render();
    fragments.push(fragment);
    dispose();
  }
  return fragments.length;
});

// 3. Full row template like benchmark
bench("3. Full row template 1000x", () => {
  const fragments = [];
  const selectedId = signal(null);
  for (let i = 0; i < COUNT; i++) {
    const s = signal({ id: i, label: `Label ${i}` });
    const id = i;
    const { fragment, dispose } = html`
      <tr class=${() => (selectedId.is(id) ? "danger" : "")}>
        <td class="col-md-1">${id}</td>
        <td class="col-md-4">
          <a @click=${() => (selectedId.value = id)}>${() => s.value.label}</a>
        </td>
        <td class="col-md-1">
          <a @click=${() => {}}>
            <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
          </a>
        </td>
        <td class="col-md-6"></td>
      </tr>
    `.render();
    fragments.push(fragment);
    dispose();
  }
  return fragments.length;
});

// 4. each() with simple template
bench("4. each() simple template", () => {
  const rows = signal(buildData(COUNT));
  const { fragment, dispose } = html`
    <tbody>
      ${each(
        rows,
        (r) => r.id,
        (s) =>
          html`<tr>
            <td>${s.peek().id}</td>
            <td>${() => s.value.label}</td>
          </tr>`,
      )}
    </tbody>
  `.render();
  dispose();
  return fragment;
});

// 5. each() full row template (like benchmark)
bench("5. each() full row template", () => {
  const rows = signal(buildData(COUNT));
  const selectedId = signal(null);
  const { fragment, dispose } = html`
    <tbody>
      ${each(
        rows,
        (r) => r.id,
        (s) => {
          const id = s.peek().id;
          return html`
            <tr class=${() => (selectedId.is(id) ? "danger" : "")}>
              <td class="col-md-1">${id}</td>
              <td class="col-md-4">
                <a @click=${() => (selectedId.value = id)}
                  >${() => s.value.label}</a
                >
              </td>
              <td class="col-md-1">
                <a @click=${() => {}}>
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
  `.render();
  dispose();
  return fragment;
});

// 6. Vanilla baseline
const rowTemplate = document.createElement("tr");
rowTemplate.innerHTML =
  "<td class='col-md-1'> </td><td class='col-md-4'><a> </a></td><td class='col-md-1'><a><span class='glyphicon glyphicon-remove' aria-hidden='true'></span></a></td><td class='col-md-6'></td>";

bench("6. Vanilla cloneNode baseline", () => {
  const data = buildData(COUNT);
  const tbody = document.createElement("tbody");

  for (let i = 0; i < data.length; i++) {
    const tr = rowTemplate.cloneNode(true);
    const td1 = tr.firstChild;
    const a = td1.nextSibling.firstChild;
    td1.firstChild.nodeValue = data[i].id;
    a.firstChild.nodeValue = data[i].label;
    tbody.appendChild(tr);
  }

  return tbody.childNodes.length;
});

console.log("-".repeat(65));

// Analysis
console.log("\nAnalysis:");
console.log("- Template parsing is cached, so overhead is in instantiation");
console.log(
  "- Each row creates: 1 signal, 1 ReadonlySignal, TreeWalker, bindings",
);
console.log("- Vanilla just does: cloneNode + 2 nodeValue assignments");
console.log("");
