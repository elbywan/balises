// Test different ways to collect childNodes (no clone)
const WARMUP = 10;
const RUNS = 1000;

function bench(name, setup, fn) {
  for (let i = 0; i < WARMUP; i++) {
    const obj = setup();
    fn(obj);
  }

  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const obj = setup();
    const start = performance.now();
    fn(obj);
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const trimmed = times.slice(Math.floor(RUNS * 0.2), Math.floor(RUNS * 0.8));
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const stdDev = Math.sqrt(
    trimmed.reduce((a, b) => a + (b - mean) ** 2, 0) / trimmed.length,
  );

  console.log(
    `${name.padEnd(50)} ${(mean * 1000).toFixed(2).padStart(8)}μs ±${(stdDev * 1000).toFixed(2)}μs`,
  );
  return mean;
}

console.log("\n=== ChildNodes Collection Only ===\n");
console.log("-".repeat(70));

const template = document.createElement("template");
template.innerHTML = `<tr><td>1</td><td>Test</td><td></td><td></td></tr>`;

const setup = () => template.content.cloneNode(true);

bench("1. [...fragment.childNodes]", setup, (frag) => {
  return [...frag.childNodes];
});

bench("2. Array.from(fragment.childNodes)", setup, (frag) => {
  return Array.from(frag.childNodes);
});

bench("3. Manual loop push", setup, (frag) => {
  const nodes = [];
  let node = frag.firstChild;
  while (node) {
    nodes.push(node);
    node = node.nextSibling;
  }
  return nodes;
});

bench("4. Store just firstChild", setup, (frag) => {
  return frag.firstChild;
});

console.log("-".repeat(70));
console.log("\nDone!\n");
