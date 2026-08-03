// Test specific DOM operations
import { signal, computed, scope } from "../dist/esm/signals/index.js";
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

console.log("\n=== DOM Operations Test ===\n");
console.log("-".repeat(70));

// Template element
const template = document.createElement("template");
template.innerHTML = `<tr><td class="col-md-1">1</td><td class="col-md-4"><a>Test</a></td><td class="col-md-1"><a><span class="glyphicon glyphicon-remove"></span></a></td><td class="col-md-6"></td></tr>`;

// 1. Just cloneNode
bench("1. cloneNode deep", () => {
  return template.content.cloneNode(true);
});

// 2. TreeWalker to find specific node
bench("2. TreeWalker to 4th element", () => {
  const frag = template.content.cloneNode(true);
  const walker = document.createTreeWalker(frag, 129);
  for (let i = 0; i < 4; i++) walker.nextNode();
  return walker.currentNode;
});

// 3. insertBefore
const parent = document.createElement("div");
bench("3. insertBefore text node", () => {
  const text = document.createTextNode("test");
  parent.insertBefore(text, null);
  text.remove();
  return text;
});

// 4. setAttribute
const el = document.createElement("div");
bench("4. setAttribute", () => {
  el.setAttribute("class", "danger");
  return el;
});

// 5. addEventListener
bench("5. addEventListener + remove", () => {
  const fn = () => {};
  el.addEventListener("click", fn);
  el.removeEventListener("click", fn);
  return el;
});

// 6. createTextNode
bench("6. createTextNode", () => {
  return document.createTextNode("test");
});

// 7. createComment
bench("7. createComment", () => {
  return document.createComment("");
});

// 8. Array spread of childNodes
bench("8. [...fragment.childNodes]", () => {
  const frag = template.content.cloneNode(true);
  return [...frag.childNodes];
});

// 9. WeakMap get/set
const wm = new WeakMap();
const key = {};
bench("9. WeakMap get/set", () => {
  wm.set(key, { a: 1 });
  return wm.get(key);
});

// 10. Map get/set
const map = new Map();
bench("10. Map get/set with number key", () => {
  map.set(1, { a: 1 });
  return map.get(1);
});

console.log("-".repeat(70));
console.log("\nDone!\n");
