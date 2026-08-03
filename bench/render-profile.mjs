// Profile template.render() internals
import { signal, computed, scope } from "../dist/esm/signals/index.js";
import { html as baseHtml } from "../dist/esm/template.js";
import eachPlugin from "../dist/esm/each.js";

const html = baseHtml.with(eachPlugin);

const WARMUP = 5;
const RUNS = 50;
const COUNT = 1000;

// Create a row template that matches the benchmark
const selectedId = signal(null);

function createRow(id, label) {
  const s = signal({ id, label });
  return html`
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
}

console.log("\n=== Profiling row creation ===\n");

// Warmup
for (let i = 0; i < WARMUP * 100; i++) {
  const { fragment, dispose } = createRow(i, `Label ${i}`);
  dispose();
}

// Profile
const times = [];
for (let run = 0; run < RUNS; run++) {
  const start = performance.now();
  const fragments = [];
  const disposers = [];

  for (let i = 0; i < COUNT; i++) {
    const { fragment, dispose } = createRow(i, `Label ${i}`);
    fragments.push(fragment);
    disposers.push(dispose);
  }

  times.push(performance.now() - start);

  // Cleanup
  for (const d of disposers) d();
}

times.sort((a, b) => a - b);
const trimmed = times.slice(Math.floor(RUNS * 0.2), Math.floor(RUNS * 0.8));
const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
const perRow = mean / COUNT;

console.log(
  `${COUNT} rows: ${mean.toFixed(1)}ms (${(perRow * 1000).toFixed(1)}μs per row)`,
);

// Compare to vanilla
const template = document.createElement("template");
template.innerHTML = `<tr><td class="col-md-1">1</td><td class="col-md-4"><a>Test</a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove"></span></a></td><td class="col-md-6"></td></tr>`;

const vanillaTimes = [];
for (let run = 0; run < RUNS; run++) {
  const start = performance.now();
  const rows = [];

  for (let i = 0; i < COUNT; i++) {
    const tr = template.content.cloneNode(true);
    rows.push(tr);
  }

  vanillaTimes.push(performance.now() - start);
}

vanillaTimes.sort((a, b) => a - b);
const vanillaTrimmed = vanillaTimes.slice(
  Math.floor(RUNS * 0.2),
  Math.floor(RUNS * 0.8),
);
const vanillaMean =
  vanillaTrimmed.reduce((a, b) => a + b, 0) / vanillaTrimmed.length;

console.log(
  `Vanilla ${COUNT} cloneNodes: ${vanillaMean.toFixed(1)}ms (${((vanillaMean / COUNT) * 1000).toFixed(1)}μs per row)`,
);
console.log(`\nOverhead: ${(mean / vanillaMean).toFixed(2)}x`);
