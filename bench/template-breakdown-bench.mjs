#!/usr/bin/env node
/**
 * Detailed benchmark to break down template/each() overhead.
 * Run from project root: node bench/template-breakdown-bench.mjs
 */

import { signal, computed } from "../dist/esm/index.js";
import { html as baseHtml } from "../dist/esm/template.js";
import eachPlugin, { each } from "../dist/esm/each.js";
import { ReadonlySignal } from "../dist/esm/signals/signal.js";

const html = baseHtml.with(eachPlugin);

const WARMUP = 5;
const RUNS = 50;
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

  // Stats - discard top/bottom 20%
  times.sort((a, b) => a - b);
  const trimmed = times.slice(Math.floor(RUNS * 0.2), Math.floor(RUNS * 0.8));
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const variance =
    trimmed.reduce((a, b) => a + (b - mean) ** 2, 0) / trimmed.length;
  const stdDev = Math.sqrt(variance);

  console.log(
    `${name.padEnd(40)} ${(mean * 1000).toFixed(1).padStart(8)}μs ±${(stdDev * 1000).toFixed(1)}μs`,
  );
  return mean;
}

// Generate test data
function buildData(count) {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = { id: i + 1, label: `Item ${i + 1}` };
  }
  return data;
}

console.log("\n=== Template/Each Breakdown Benchmark ===\n");
console.log(`Creating ${COUNT} items\n`);
console.log("-".repeat(60));

// 1. Just create signals (baseline)
bench("1. Create signals only", () => {
  const data = buildData(COUNT);
  const signals = data.map((item) => signal(item));
  return signals.length;
});

// 2. Create signals + ReadonlySignal wrapper
bench("2. Signals + ReadonlySignal wrapper", () => {
  const data = buildData(COUNT);
  const signals = data.map((item) => {
    const s = signal(item);
    return new ReadonlySignal(s);
  });
  return signals.length;
});

// 3. Parse and cache a simple template (first render)
const simpleTemplate = html`<tr>
  <td>1</td>
  <td>Test</td>
</tr>`;
bench("3. Simple template.render() (cached)", () => {
  const { fragment, dispose } = simpleTemplate.render();
  dispose();
  return fragment;
});

// 4. Parse template with reactive bindings
bench("4. Template with reactive binding", () => {
  const s = signal("test");
  const { fragment, dispose } = html`<tr>
    <td>${() => s.value}</td>
  </tr>`.render();
  dispose();
  return fragment;
});

// 5. Parse template with multiple bindings (like our row)
bench("5. Row template (5 bindings)", () => {
  const s = signal({ id: 1, label: "test" });
  const selectedId = signal(null);
  const id = 1;
  const { fragment, dispose } = html`
    <tr class=${() => (selectedId.is(id) ? "danger" : "")}>
      <td class="col-md-1">${id}</td>
      <td class="col-md-4">
        <a @click=${() => {}}>${() => s.value.label}</a>
      </td>
      <td class="col-md-1">
        <a @click=${() => {}}>
          <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
        </a>
      </td>
      <td class="col-md-6"></td>
    </tr>
  `.render();
  dispose();
  return fragment;
});

// 6. each() with simple items
bench("6. each() first render (1000 rows)", () => {
  const rows = signal(buildData(COUNT));
  const selectedId = signal(null);

  const { fragment, dispose } = html`
    <table>
      <tbody>
        ${each(
          rows,
          (row) => row.id,
          (rowSignal) => {
            const id = rowSignal.peek().id;
            return html`
              <tr class=${() => (selectedId.is(id) ? "danger" : "")}>
                <td class="col-md-1">${id}</td>
                <td class="col-md-4">
                  <a @click=${() => (selectedId.value = id)}
                    >${() => rowSignal.value.label}</a
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
    </table>
  `.render();
  dispose();
  return fragment;
});

// 7. Vanilla-style: just cloneNode + manual DOM ops
const rowTemplate = document.createElement("tr");
rowTemplate.innerHTML =
  "<td class='col-md-1'> </td><td class='col-md-4'><a> </a></td><td class='col-md-1'><a><span class='glyphicon glyphicon-remove' aria-hidden='true'></span></a></td><td class='col-md-6'></td>";

bench("7. Vanilla cloneNode (1000 rows)", () => {
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

console.log("-".repeat(60));
console.log("\nDone!\n");
