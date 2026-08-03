#!/usr/bin/env node
/**
 * Simple standalone benchmark for signal creation overhead.
 * Run from project root: node --import tsx/esm bench/signal-create-bench.mjs
 */

import { signal, computed } from "../dist/esm/index.js";
import { ReadonlySignal } from "../dist/esm/signals/signal.js";

const WARMUP = 10;
const RUNS = 100;
const TIERS = [100, 500, 1000, 5000, 10000];

function bench(name, fn, count) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    fn(count);
  }

  // Run
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    fn(count);
    times.push(performance.now() - start);
  }

  // Stats - discard top/bottom 20%
  times.sort((a, b) => a - b);
  const trimmed = times.slice(Math.floor(RUNS * 0.2), Math.floor(RUNS * 0.8));
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  const variance =
    trimmed.reduce((a, b) => a + (b - mean) ** 2, 0) / trimmed.length;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}

// Benchmark functions
const benchmarks = {
  "signal-only": (count) => {
    const signals = new Array(count);
    for (let i = 0; i < count; i++) {
      signals[i] = signal(i);
    }
    return signals.length;
  },

  "signal+readonly": (count) => {
    const wrapped = new Array(count);
    for (let i = 0; i < count; i++) {
      const s = signal(i);
      wrapped[i] = new ReadonlySignal(s);
    }
    return wrapped.length;
  },

  "signal+read": (count) => {
    const signals = new Array(count);
    let sum = 0;
    for (let i = 0; i < count; i++) {
      signals[i] = signal(i);
      sum += signals[i].value;
    }
    return signals.length;
  },

  "signal+computed": (count) => {
    const computeds = new Array(count);
    for (let i = 0; i < count; i++) {
      const s = signal(i);
      computeds[i] = computed(() => s.value);
    }
    // Force evaluation
    for (let i = 0; i < count; i++) {
      computeds[i].value;
    }
    return computeds.length;
  },
};

console.log("\n=== Signal Creation Benchmark ===\n");

// Header
const header = ["Benchmark", ...TIERS.map((t) => `n=${t}`)];
console.log(header.join("\t"));
console.log("-".repeat(80));

// Run each benchmark
for (const [name, fn] of Object.entries(benchmarks)) {
  const row = [name.padEnd(20)];
  for (const tier of TIERS) {
    const { mean, stdDev } = bench(name, fn, tier);
    row.push(`${(mean * 1000).toFixed(1)}μs ±${(stdDev * 1000).toFixed(1)}`);
  }
  console.log(row.join("\t"));
}

console.log("\n");
