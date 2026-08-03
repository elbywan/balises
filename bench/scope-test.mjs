// Test scope() overhead specifically
import { signal, computed, scope } from "../dist/esm/signals/index.js";

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

console.log("\n=== Scope Overhead Test ===\n");
console.log("-".repeat(70));

// 1. Plain computed (no scope)
bench("1. Plain computed", () => {
  const s = signal(1);
  const c = computed(() => s.value);
  c.dispose();
  return c;
});

// 2. Computed with scope wrapper (like wrapFn)
bench("2. Computed with scope wrapper", () => {
  const s = signal(1);
  let cleanup;
  const c = computed(() => {
    cleanup?.();
    const [r, dispose] = scope(() => s.value);
    cleanup = dispose;
    return r;
  });
  c.dispose();
  cleanup?.();
  return c;
});

// 3. 5 plain computeds
bench("3. 5 plain computeds", () => {
  const s = signal(1);
  const cs = [];
  for (let i = 0; i < 5; i++) {
    cs.push(computed(() => s.value));
  }
  for (const c of cs) c.dispose();
  return cs;
});

// 4. 5 computeds with scope wrapper
bench("4. 5 computeds with scope wrapper", () => {
  const s = signal(1);
  const cs = [];
  const cleanups = [];
  for (let i = 0; i < 5; i++) {
    let cleanup;
    const c = computed(() => {
      cleanup?.();
      const [r, dispose] = scope(() => s.value);
      cleanup = dispose;
      return r;
    });
    cs.push(c);
    cleanups.push(() => (c.dispose(), cleanup?.()));
  }
  for (const cl of cleanups) cl();
  return cs;
});

// 5. Just scope() calls
bench("5. 5 scope() calls only", () => {
  const results = [];
  for (let i = 0; i < 5; i++) {
    const [r, dispose] = scope(() => i);
    results.push(r);
    dispose();
  }
  return results;
});

console.log("-".repeat(70));
console.log("\nDone!\n");
