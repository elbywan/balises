/**
 * Batching / Transaction Performance Benchmark
 *
 * Tests how efficiently libraries batch multiple signal updates.
 *
 * Scenario:
 * - Create N source signals
 * - Create a computed that depends on all N signals
 * - Update all N signals in a batch
 * - Measure: The computed should ideally only re-run once, not N times
 *
 * This tests:
 * - Automatic batching capabilities
 * - Transaction/batch API efficiency
 * - Update scheduling optimization
 */

import hyperactiv from "hyperactiv";
import * as maverick from "@maverick-js/signals";
import {
  observable,
  computed as mobxComputed,
  autorun,
  configure,
  runInAction,
} from "mobx";
import * as preact from "@preact/signals-core";
import * as vue from "@vue/reactivity";
import * as solid from "solid-js/dist/solid.js";
import * as usignal from "usignal";
import * as angular from "@angular/core";
import {
  signal,
  computed,
  effect,
  batch,
  scope,
} from "../../dist/esm/index.js";

configure({ enforceActions: "never" });

function hyperactivBatching(count) {
  // Hyperactiv batch mode: create observable with { batch: true }
  const obj = hyperactiv.observe(
    { signals: Array(count).fill(0), sum: 0 },
    { batch: true },
  );

  let computeCount = 0;
  hyperactiv.computed(() => {
    obj.sum = obj.signals.reduce((a, b) => a + b, 0);
    computeCount++;
  });

  const startTime = performance.now();

  // Update all signals - hyperactiv will batch automatically
  for (let i = 0; i < count; i++) {
    obj.signals[i] = i + 1;
  }

  // Flush the batch - hyperactiv.batch() with no args triggers the batched updates
  hyperactiv.batch();

  const endTime = performance.now();
  return {
    time: endTime - startTime,
    result: { sum: obj.sum, computeCount },
  };
}

function maverickBatching(count) {
  const signals = Array.from({ length: count }, (_, i) => maverick.signal(0));
  let sum = 0;
  let computeCount = 0;

  const sumComputed = maverick.computed(() => {
    sum = signals.reduce((acc, s) => acc + s(), 0);
    computeCount++;
    return sum;
  });

  let time = 0;

  // Maverick has batch() API
  maverick.tick();
  maverick.root((dispose) => {
    maverick.effect(() => {
      sumComputed();
    });

    const startTime = performance.now();

    // Update all signals in a batch
    for (let i = 0; i < count; i++) {
      signals[i].set(i + 1);
    }

    maverick.tick();

    time = performance.now() - startTime;
    dispose();
  });

  return {
    time,
    result: { sum, computeCount },
  };
}

function mobxBatching(count) {
  const state = observable({ signals: Array(count).fill(0) });
  let sum = 0;
  let computeCount = 0;

  const sumComputed = mobxComputed(() => {
    sum = state.signals.reduce((a, b) => a + b, 0);
    computeCount++;
    return sum;
  });

  const dispose = autorun(() => {
    sumComputed.get();
  });

  const startTime = performance.now();

  // MobX has runInAction for batching
  runInAction(() => {
    for (let i = 0; i < count; i++) {
      state.signals[i] = i + 1;
    }
  });

  sumComputed.get(); // Force final compute

  const endTime = performance.now();
  dispose();

  return {
    time: endTime - startTime,
    result: { sum, computeCount },
  };
}

function preactBatching(count) {
  const signals = Array.from({ length: count }, () => preact.signal(0));
  let sum = 0;
  let computeCount = 0;

  const sumComputed = preact.computed(() => {
    sum = signals.reduce((acc, s) => acc + s.value, 0);
    computeCount++;
    return sum;
  });

  const dispose = preact.effect(() => {
    sumComputed.value;
  });

  const startTime = performance.now();

  // Preact has batch() API
  preact.batch(() => {
    for (let i = 0; i < count; i++) {
      signals[i].value = i + 1;
    }
  });

  const endTime = performance.now();
  dispose();

  return {
    time: endTime - startTime,
    result: { sum, computeCount },
  };
}

function vueBatching(count) {
  const signals = Array.from({ length: count }, () => vue.ref(0));
  let sum = 0;
  let computeCount = 0;

  const sumComputed = vue.computed(() => {
    sum = signals.reduce((acc, s) => acc + s.value, 0);
    computeCount++;
    return sum;
  });

  // Vue doesn't have a batching API at the reactivity level.
  // Its "batching" is lazy computed evaluation - computeds don't
  // re-run until accessed. This is Vue's design pattern.
  // Initialize the computed
  sumComputed.value;

  const startTime = performance.now();

  // Update all signals
  for (let i = 0; i < count; i++) {
    signals[i].value = i + 1;
  }

  // Access the computed to get the final result (triggers ONE recomputation)
  const finalSum = sumComputed.value;

  const endTime = performance.now();
  return {
    time: endTime - startTime,
    result: { sum, computeCount },
  };
}

async function solidBatching(count) {
  return new Promise((resolve) => {
    solid.createRoot((dispose) => {
      const signals = Array.from({ length: count }, () =>
        solid.createSignal(0),
      );

      let computeCount = 0;
      const sumComputed = solid.createMemo(() => {
        computeCount++;
        return signals.reduce((acc, [get]) => acc + get(), 0);
      });

      const startTime = performance.now();

      // Solid has batch() API
      solid.batch(() => {
        for (let i = 0; i < count; i++) {
          signals[i][1](i + 1);
        }
      });

      // Read the memo after batch to get the result
      const sum = sumComputed();

      const endTime = performance.now();

      dispose();

      resolve({
        time: endTime - startTime,
        result: { sum, computeCount },
      });
    });
  });
}

function balisesBatching(count) {
  const [data, disposeScope] = scope(() => {
    const signals = Array.from({ length: count }, () => signal(0));
    let sum = 0;
    let computeCount = 0;

    const sumComputed = computed(() => {
      sum = signals.reduce((acc, s) => acc + s.value, 0);
      computeCount++;
      return sum;
    });

    effect(() => {
      sumComputed.value;
    });

    return {
      signals,
      sumComputed,
      getSum: () => sum,
      getComputeCount: () => computeCount,
    };
  });

  const startTime = performance.now();

  // Balises has batch() API
  batch(() => {
    for (let i = 0; i < count; i++) {
      data.signals[i].value = i + 1;
    }
  });

  const endTime = performance.now();

  const result = {
    time: endTime - startTime,
    result: { sum: data.getSum(), computeCount: data.getComputeCount() },
  };

  disposeScope();

  return result;
}

function usignalBatching(count) {
  const signals = Array.from({ length: count }, () => usignal.signal(0));
  let sum = 0;
  let computeCount = 0;

  const sumComputed = usignal.computed(() => {
    sum = signals.reduce((acc, s) => acc + s.value, 0);
    computeCount++;
    return sum;
  });

  // Initialize the computed
  sumComputed.value;

  const startTime = performance.now();

  // usignal has no batch API - updates are synchronous
  // Computeds are lazy, so it won't recompute until we access .value
  for (let i = 0; i < count; i++) {
    signals[i].value = i + 1;
  }

  // Access the computed to get the final result (triggers recomputation)
  const finalSum = sumComputed.value;

  const endTime = performance.now();

  return {
    time: endTime - startTime,
    result: { sum, computeCount },
  };
}

function angularBatching(count) {
  const signals = Array.from({ length: count }, () => angular.signal(0));
  let sum = 0;
  let computeCount = 0;

  const sumComputed = angular.computed(() => {
    sum = signals.reduce((acc, s) => acc + s(), 0);
    computeCount++;
    return sum;
  });

  // Initialize the computed
  sumComputed();

  const startTime = performance.now();

  // Angular signals have no batch API - updates are synchronous
  // Computeds are lazy, so it won't recompute until we access it
  for (let i = 0; i < count; i++) {
    signals[i].set(i + 1);
  }

  // Access the computed to get the final result (triggers recomputation)
  const finalSum = sumComputed();

  const endTime = performance.now();

  return {
    time: endTime - startTime,
    result: { sum, computeCount },
  };
}

export const batchingBenchmarks = {
  hyperactiv: hyperactivBatching,
  maverick: maverickBatching,
  mobx: mobxBatching,
  preact: preactBatching,
  vue: vueBatching,
  solid: solidBatching,
  usignal: usignalBatching,
  angular: angularBatching,
  balises: balisesBatching,
};

export function getExpectedBatching(count) {
  // Expected sum: 1 + 2 + 3 + ... + count = count * (count + 1) / 2
  const expectedSum = (count * (count + 1)) / 2;

  // Only validate the sum, not computeCount (varies by library's batching strategy)
  return { sum: expectedSum };
}
