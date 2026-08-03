// Test different ways to collect childNodes
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

console.log("\n=== ChildNodes Collection Test ===\n");
console.log("-".repeat(70));

const template = document.createElement("template");
template.innerHTML = `<tr><td>1</td><td>Test</td><td></td><td></td></tr>`;

// 1. Spread operator
bench("1. [...fragment.childNodes]", () => {
  const frag = template.content.cloneNode(true);
  return [...frag.childNodes];
});

// 2. Array.from
bench("2. Array.from(fragment.childNodes)", () => {
  const frag = template.content.cloneNode(true);
  return Array.from(frag.childNodes);
});

// 3. Manual loop
bench("3. Manual loop push", () => {
  const frag = template.content.cloneNode(true);
  const nodes = [];
  let node = frag.firstChild;
  while (node) {
    nodes.push(node);
    node = node.nextSibling;
  }
  return nodes;
});

// 4. Just store first/last node (for single root elements)
bench("4. Store just firstChild", () => {
  const frag = template.content.cloneNode(true);
  return frag.firstChild;
});

// 5. Store first and last
bench("5. Store firstChild + lastChild", () => {
  const frag = template.content.cloneNode(true);
  return { first: frag.firstChild, last: frag.lastChild };
});

// 6. Count children first, then use Array constructor
bench("6. Pre-sized array", () => {
  const frag = template.content.cloneNode(true);
  const len = frag.childNodes.length;
  const nodes = new Array(len);
  let node = frag.firstChild;
  for (let i = 0; i < len; i++) {
    nodes[i] = node;
    node = node.nextSibling;
  }
  return nodes;
});

console.log("-".repeat(70));
console.log("\nDone!\n");
