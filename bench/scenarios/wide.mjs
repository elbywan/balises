/**
 * Scenario 2: Wide Graph (Independent Signals)
 * Tests many independent signals updating simultaneously
 */

import * as mobx from "mobx";
import {
  root,
  signal as maverickSignal,
  computed as maverickComputed,
} from "@maverick-js/signals";
import * as preact from "@preact/signals-core";
import * as vue from "@vue/reactivity";
import * as solid from "solid-js/dist/solid.js";
import hyperactiv from "hyperactiv";
import * as usignal from "usignal";
import * as angular from "@angular/core";
import { signal, computed } from "../../dist/esm/index.js";

/**
 * Calculate expected result for wide scenario
 * Returns array of computed values: (i + 100) * 2
 */
export function getExpectedWide(width) {
  return Array.from({ length: width }, (_, i) => (i + 100) * 2);
}
export const wideBenchmarks = {
  balises: (width) => {
    const signals = Array.from({ length: width }, (_, i) => signal(i));
    const computeds = signals.map((s) => computed(() => s.value * 2));
    const start_time = performance.now();
    signals.forEach((s, i) => (s.value = i + 100));
    const results = computeds.map((c) => c.value);
    const time = performance.now() - start_time;

    return { time, result: results };
  },

  maverick: (width) => {
    return new Promise((resolve) => {
      root((dispose) => {
        const signals = Array.from({ length: width }, (_, i) =>
          maverickSignal(i),
        );
        const computeds = signals.map((s) => maverickComputed(() => s() * 2));
        const start_time = performance.now();
        signals.forEach((s, i) => s.set(i + 100));
        const results = computeds.map((c) => c());
        const time = performance.now() - start_time;

        dispose();
        resolve({ time, result: results });
      });
    });
  },

  mobx: (width) => {
    mobx.configure({ enforceActions: "never" });
    const signals = Array.from({ length: width }, (_, i) =>
      mobx.observable.box(i),
    );
    const computeds = signals.map((s) => mobx.computed(() => s.get() * 2));
    const start_time = performance.now();
    signals.forEach((s, i) => s.set(i + 100));
    const results = computeds.map((c) => c.get());
    const time = performance.now() - start_time;

    return { time, result: results };
  },

  preact: (width) => {
    const signals = Array.from({ length: width }, (_, i) => preact.signal(i));
    const computeds = signals.map((s) => preact.computed(() => s.value * 2));
    const start_time = performance.now();
    signals.forEach((s, i) => (s.value = i + 100));
    const results = computeds.map((c) => c.value);
    const time = performance.now() - start_time;

    return { time, result: results };
  },

  hyperactiv: (width) => {
    const data = hyperactiv.observe(
      Array.from({ length: width }, (_, i) => i),
      { batch: true },
    );
    const computeds = data.map((_, i) =>
      hyperactiv.computed(() => data[i] * 2),
    );
    const start_time = performance.now();
    data.forEach((_, i) => (data[i] = i + 100));
    hyperactiv.batch();
    const results = computeds.map((c) => c());
    const time = performance.now() - start_time;

    return { time, result: results };
  },

  vue: (width) => {
    const signals = Array.from({ length: width }, (_, i) => vue.ref(i));
    const computeds = signals.map((s) => vue.computed(() => s.value * 2));
    const start_time = performance.now();
    signals.forEach((s, i) => (s.value = i + 100));
    const results = computeds.map((c) => c.value);
    const time = performance.now() - start_time;

    return { time, result: results };
  },

  solid: (width) => {
    return new Promise((resolve) => {
      solid.createRoot((dispose) => {
        const signalsAndSetters = Array.from({ length: width }, (_, i) =>
          solid.createSignal(i),
        );
        const signals = signalsAndSetters.map(([sig]) => sig);
        const setters = signalsAndSetters.map(([, set]) => set);
        const computeds = signals.map((s) => solid.createMemo(() => s() * 2));
        const start_time = performance.now();
        setters.forEach((set, i) => set(i + 100));
        const results = computeds.map((c) => c());
        const time = performance.now() - start_time;

        dispose();
        resolve({ time, result: results });
      });
    });
  },

  usignal: (width) => {
    const signals = Array.from({ length: width }, (_, i) => usignal.signal(i));
    const computeds = signals.map((s) => usignal.computed(() => s.value * 2));
    const start_time = performance.now();
    signals.forEach((s, i) => (s.value = i + 100));
    const results = computeds.map((c) => c.value);
    const time = performance.now() - start_time;

    return { time, result: results };
  },

  angular: (width) => {
    const signals = Array.from({ length: width }, (_, i) => angular.signal(i));
    const computeds = signals.map((s) => angular.computed(() => s() * 2));
    const start_time = performance.now();
    signals.forEach((s, i) => s.set(i + 100));
    const results = computeds.map((c) => c());
    const time = performance.now() - start_time;

    return { time, result: results };
  },
};

/**
 * Scenario 3: Diamond Dependencies
 * Tests multiple paths to the same computed value
 */
