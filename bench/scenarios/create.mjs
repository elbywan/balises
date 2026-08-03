/**
 * Scenario: Signal Creation Overhead
 * Measures the cost of creating signals - a key bottleneck for list rendering
 */

import * as preact from "@preact/signals-core";
import * as vue from "@vue/reactivity";
import * as solid from "solid-js/dist/solid.js";
import { signal, computed } from "../../dist/esm/index.js";
import { Signal, ReadonlySignal } from "../../dist/esm/signals/signal.js";

/**
 * Expected result: just return count (no validation needed for creation benchmarks)
 */
export function getExpectedCreate(count) {
  return count;
}

export const CREATE_TIERS = [100, 500, 1000, 5000, 10000];

export const createBenchmarks = {
  /**
   * Balises: Create signals only
   */
  balises: (count) => {
    const signals = new Array(count);

    const start_time = performance.now();
    for (let i = 0; i < count; i++) {
      signals[i] = signal(i);
    }
    const time = performance.now() - start_time;

    return { time, result: signals.length };
  },

  /**
   * Balises: Create signals + ReadonlySignal wrapper (what each() does)
   */
  "balises-wrapped": (count) => {
    const wrapped = new Array(count);

    const start_time = performance.now();
    for (let i = 0; i < count; i++) {
      const s = signal(i);
      wrapped[i] = new ReadonlySignal(s);
    }
    const time = performance.now() - start_time;

    return { time, result: wrapped.length };
  },

  /**
   * Balises: Create signals + read value (forces initialization)
   */
  "balises-read": (count) => {
    const signals = new Array(count);
    let sum = 0;

    const start_time = performance.now();
    for (let i = 0; i < count; i++) {
      signals[i] = signal(i);
      sum += signals[i].value;
    }
    const time = performance.now() - start_time;

    return { time, result: signals.length };
  },

  /**
   * Balises: Create signals + computed that reads them (simulates each() binding)
   */
  "balises-computed": (count) => {
    const computeds = new Array(count);

    const start_time = performance.now();
    for (let i = 0; i < count; i++) {
      const s = signal(i);
      computeds[i] = computed(() => s.value);
    }
    // Force evaluation
    for (let i = 0; i < count; i++) {
      computeds[i].value;
    }
    const time = performance.now() - start_time;

    return { time, result: computeds.length };
  },

  /**
   * Preact Signals
   */
  preact: (count) => {
    const signals = new Array(count);

    const start_time = performance.now();
    for (let i = 0; i < count; i++) {
      signals[i] = preact.signal(i);
    }
    const time = performance.now() - start_time;

    return { time, result: signals.length };
  },

  /**
   * Vue Reactivity
   */
  vue: (count) => {
    const refs = new Array(count);

    const start_time = performance.now();
    for (let i = 0; i < count; i++) {
      refs[i] = vue.ref(i);
    }
    const time = performance.now() - start_time;

    return { time, result: refs.length };
  },

  /**
   * Solid JS
   */
  solid: (count) => {
    let result;
    solid.createRoot((dispose) => {
      const signals = new Array(count);

      const start_time = performance.now();
      for (let i = 0; i < count; i++) {
        signals[i] = solid.createSignal(i);
      }
      const time = performance.now() - start_time;

      result = { time, result: signals.length };
      dispose();
    });
    return result;
  },
};
