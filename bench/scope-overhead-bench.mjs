#!/usr/bin/env node
/**
 * Benchmark scope() vs simple computed overhead
 */

import { signal, computed, scope } from "../dist/esm/index.js";

const WARMUP = 5;
const RUNS = 50;
const COUNT = 1000;

function bench(name, fn) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) fn();

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

  console.log(`${name.padEnd(50)} ${(mean * 1000).toFixed(1).padStart(8)}μs`);
  return mean;
}

console.log("\n=== Scope vs Simple Computed Benchmark ===\n");
console.log(`Creating ${COUNT} computeds\n`);
console.log("-".repeat(65));

// 1. Simple computed
bench("1. Simple computed(() => s.value)", () => {
  const s = signal(0);
  const computeds = [];
  for (let i = 0; i < COUNT; i++) {
    computeds.push(computed(() => s.value));
  }
  // Force evaluation
  let sum = 0;
  for (let i = 0; i < COUNT; i++) sum += computeds[i].value;
  // Dispose
  for (let i = 0; i < COUNT; i++) computeds[i].dispose();
  return sum;
});

// 2. Computed with scope (what wrapFn does)
bench("2. wrapFn style (scope inside computed)", () => {
  const s = signal(0);
  const computeds = [];
  const cleanups = [];
  for (let i = 0; i < COUNT; i++) {
    let cleanup;
    const c = computed(() => {
      cleanup?.();
      const [result, dispose] = scope(() => s.value);
      cleanup = dispose;
      return result;
    });
    computeds.push(c);
    cleanups.push(() => {
      c.dispose();
      cleanup?.();
    });
  }
  // Force evaluation
  let sum = 0;
  for (let i = 0; i < COUNT; i++) sum += computeds[i].value;
  // Dispose
  for (let i = 0; i < COUNT; i++) cleanups[i]();
  return sum;
});

// 3. Computed + subscribe (what bind does for signals)
bench("3. Computed + subscribe", () => {
  const s = signal(0);
  const disposers = [];
  for (let i = 0; i < COUNT; i++) {
    const c = computed(() => s.value);
    c.value; // Force evaluation
    disposers.push(c.subscribe(() => {}));
    disposers.push(() => c.dispose());
  }
  // Dispose
  for (let i = 0; i < disposers.length; i++) disposers[i]();
  return disposers.length;
});

// 4. Just create computed + access value (no subscribe)
bench("4. Computed + access value only", () => {
  const s = signal(0);
  const computeds = [];
  let sum = 0;
  for (let i = 0; i < COUNT; i++) {
    const c = computed(() => s.value);
    sum += c.value;
    computeds.push(c);
  }
  // Dispose
  for (let i = 0; i < COUNT; i++) computeds[i].dispose();
  return sum;
});

console.log("-".repeat(65));
console.log("\nConclusion: scope() adds overhead for each reactive binding");
console.log("");
