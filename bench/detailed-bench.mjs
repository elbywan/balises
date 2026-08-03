// Detailed breakdown of template.render() costs
import { signal, computed } from "../dist/esm/index.js";
import { html } from "../dist/esm/template.js";

const WARMUP = 5;
const RUNS = 100;

function bench(name, fn) {
  for (let i = 0; i < WARMUP; i++) fn();

  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const trimmed = times.slice(Math.floor(RUNS * 0.2), Math.floor(RUNS * 0.8));
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const stdDev = Math.sqrt(
    trimmed.reduce((a, b) => a + (b - mean) ** 2, 0) / trimmed.length,
  );

  console.log(
    `${name.padEnd(50)} ${(mean * 1000).toFixed(1).padStart(8)}μs ±${(stdDev * 1000).toFixed(1)}μs`,
  );
  return mean;
}

console.log("\n=== Template Render Detailed Breakdown ===\n");
console.log("-".repeat(70));

// 1. Just cloneNode
const template = document.createElement("template");
template.innerHTML = `<tr><td class="col-md-1">1</td><td class="col-md-4"><a>Test</a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td></tr>`;
bench("1. cloneNode only", () => {
  return template.content.cloneNode(true);
});

// 2. cloneNode + TreeWalker
bench("2. cloneNode + TreeWalker full traversal", () => {
  const frag = template.content.cloneNode(true);
  const walker = document.createTreeWalker(frag, 129);
  let count = 0;
  while (walker.nextNode()) count++;
  return count;
});

// 3. Creating computed (the main overhead?)
bench("3. Create 1 computed", () => {
  const s = signal(1);
  const c = computed(() => s.value);
  c.dispose();
  return c;
});

bench("4. Create 5 computeds", () => {
  const s = signal(1);
  const c1 = computed(() => s.value);
  const c2 = computed(() => s.value);
  const c3 = computed(() => s.value);
  const c4 = computed(() => s.value);
  const c5 = computed(() => s.value);
  c1.dispose();
  c2.dispose();
  c3.dispose();
  c4.dispose();
  c5.dispose();
  return [c1, c2, c3, c4, c5];
});

// 5. Template with static content only (no bindings)
const staticTemplate = html`<tr>
  <td class="col-md-1">1</td>
  <td class="col-md-4"><a>Test</a></td>
  <td class="col-md-1">
    <a><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a>
  </td>
  <td class="col-md-6"></td>
</tr>`;
bench("5. Static template (no bindings)", () => {
  const { fragment, dispose } = staticTemplate.render();
  dispose();
  return fragment;
});

// 6. Template with 1 reactive binding
bench("6. Template with 1 reactive binding", () => {
  const s = signal("test");
  const { fragment, dispose } = html`<tr>
    <td>${() => s.value}</td>
  </tr>`.render();
  dispose();
  return fragment;
});

// 7. Template with 1 attribute binding
const selectedId = signal(null);
bench("7. Template with 1 attribute binding", () => {
  const { fragment, dispose } = html`<tr
    class=${() => (selectedId.value === 1 ? "danger" : "")}
  ></tr>`.render();
  dispose();
  return fragment;
});

// 8. Template with 2 event handlers (no computed)
bench("8. Template with 2 event handlers", () => {
  const { fragment, dispose } = html`<tr>
    <td><a @click=${() => {}}></a></td>
    <td><a @click=${() => {}}></a></td>
  </tr>`.render();
  dispose();
  return fragment;
});

// 9. Full row template
bench("9. Full row template (2 reactive + 1 attr + 2 events)", () => {
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

console.log("-".repeat(70));
console.log("\nDone!\n");
