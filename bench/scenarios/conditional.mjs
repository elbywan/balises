/**
 * Scenario: Conditional Updates (like v-if)
 * Tests performance when computed values are conditionally activated/deactivated
 * Simulates UI frameworks' conditional rendering patterns
 */

import * as mobx from "mobx";
import {
  root,
  signal as maverickSignal,
  computed as maverickComputed,
  tick,
} from "@maverick-js/signals";
import * as preact from "@preact/signals-core";
import * as vue from "@vue/reactivity";
import * as solid from "solid-js/dist/solid.js";
import hyperactiv from "hyperactiv";
import { signal, computed, batch } from "../../dist/esm/index.js";

/**
 * Calculate expected result for conditional scenario
 * Final state: condition=true, sources=[0, 2, 4, ..., i*2]
 * Each computed: condition ? source * 2 : 0
 * Total: sum of all computeds
 */
export function getExpectedConditional(count) {
  return Array.from({ length: count }, (_, i) => i * 2 * 2).reduce(
    (a, b) => a + b,
    0,
  );
}

export const conditionalBenchmarks = {
  balises: (count) => {
    const condition = signal(true);
    const sources = Array.from({ length: count }, () => signal(0));

    // Create computed values that depend on condition
    const computeds = sources.map((source) =>
      computed(() => (condition.value ? source.value * 2 : 0)),
    );

    // Final aggregator
    const total = computed(() =>
      computeds.reduce((sum, c) => sum + c.value, 0),
    );

    const start_time = performance.now();

    // Toggle condition multiple times and update sources
    batch(() => {
      condition.value = false;
      sources.forEach((s, i) => (s.value = i));
      condition.value = true;
      sources.forEach((s, i) => (s.value = i * 2));
      condition.value = false;
      condition.value = true;
    });

    const finalResult = total.value;
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },

  maverick: (count) => {
    return new Promise((resolve) => {
      root((dispose) => {
        const condition = maverickSignal(true);
        const sources = Array.from({ length: count }, () => maverickSignal(0));

        const computeds = sources.map((source) =>
          maverickComputed(() => (condition() ? source() * 2 : 0)),
        );

        const total = maverickComputed(() =>
          computeds.reduce((sum, c) => sum + c(), 0),
        );

        const start_time = performance.now();

        tick();
        condition.set(false);
        sources.forEach((s, i) => s.set(i));
        condition.set(true);
        sources.forEach((s, i) => s.set(i * 2));
        condition.set(false);
        condition.set(true);
        tick();

        const finalResult = total();
        const time = performance.now() - start_time;

        dispose();
        resolve({ time, result: finalResult });
      });
    });
  },

  mobx: (count) => {
    mobx.configure({ enforceActions: "never" });

    const condition = mobx.observable.box(true);
    const sources = Array.from({ length: count }, () => mobx.observable.box(0));

    const computeds = sources.map((source) =>
      mobx.computed(() => (condition.get() ? source.get() * 2 : 0)),
    );

    const total = mobx.computed(() =>
      computeds.reduce((sum, c) => sum + c.get(), 0),
    );

    const start_time = performance.now();

    mobx.runInAction(() => {
      condition.set(false);
      sources.forEach((s, i) => s.set(i));
      condition.set(true);
      sources.forEach((s, i) => s.set(i * 2));
      condition.set(false);
      condition.set(true);
    });

    const finalResult = total.get();
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },

  preact: (count) => {
    const condition = preact.signal(true);
    const sources = Array.from({ length: count }, () => preact.signal(0));

    const computeds = sources.map((source) =>
      preact.computed(() => (condition.value ? source.value * 2 : 0)),
    );

    const total = preact.computed(() =>
      computeds.reduce((sum, c) => sum + c.value, 0),
    );

    const start_time = performance.now();

    condition.value = false;
    sources.forEach((s, i) => (s.value = i));
    condition.value = true;
    sources.forEach((s, i) => (s.value = i * 2));
    condition.value = false;
    condition.value = true;

    const finalResult = total.value;
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },

  hyperactiv: (count) => {
    const obj = hyperactiv.observe(
      {
        condition: true,
        sources: Array.from({ length: count }, () => 0),
        computedValues: Array.from({ length: count }, () => 0),
        total: 0,
      },
      { batch: true },
    );

    obj.sources.forEach((_, i) => {
      hyperactiv.computed(() => {
        obj.computedValues[i] = obj.condition ? obj.sources[i] * 2 : 0;
      });
    });

    hyperactiv.computed(() => {
      obj.total = obj.computedValues.reduce((sum, v) => sum + v, 0);
    });

    const start_time = performance.now();

    obj.condition = false;
    obj.sources.forEach((_, i) => (obj.sources[i] = i));
    obj.condition = true;
    obj.sources.forEach((_, i) => (obj.sources[i] = i * 2));
    obj.condition = false;
    obj.condition = true;
    hyperactiv.batch();

    const time = performance.now() - start_time;

    return { time, result: obj.total };
  },

  vue: (count) => {
    const condition = vue.ref(true);
    const sources = Array.from({ length: count }, () => vue.ref(0));

    const computeds = sources.map((source) =>
      vue.computed(() => (condition.value ? source.value * 2 : 0)),
    );

    const total = vue.computed(() =>
      computeds.reduce((sum, c) => sum + c.value, 0),
    );

    const start_time = performance.now();

    condition.value = false;
    sources.forEach((s, i) => (s.value = i));
    condition.value = true;
    sources.forEach((s, i) => (s.value = i * 2));
    condition.value = false;
    condition.value = true;

    const finalResult = total.value;
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },

  solid: (count) => {
    return new Promise((resolve) => {
      solid.createRoot((dispose) => {
        const [condition, setCondition] = solid.createSignal(true);
        const sources = Array.from({ length: count }, () => {
          const [get, set] = solid.createSignal(0);
          return { get, set };
        });

        const computeds = sources.map(({ get }) =>
          solid.createMemo(() => (condition() ? get() * 2 : 0)),
        );

        const total = solid.createMemo(() =>
          computeds.reduce((sum, c) => sum + c(), 0),
        );

        const start_time = performance.now();

        solid.batch(() => {
          setCondition(false);
          sources.forEach((s, i) => s.set(i));
          setCondition(true);
          sources.forEach((s, i) => s.set(i * 2));
          setCondition(false);
          setCondition(true);
        });

        const finalResult = total();
        const time = performance.now() - start_time;

        dispose();
        resolve({ time, result: finalResult });
      });
    });
  },
};
