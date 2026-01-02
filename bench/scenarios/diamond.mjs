/**
 * Scenario 3: Diamond Dependencies (Multiple Paths)
 * Tests handling of multiple paths to the same computed value
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
 * Calculate expected result for diamond scenario
 */
export function getExpectedDiamond(depth) {
  const sourceValue = 5;
  // Left branch: adds 1 at each depth
  const leftValue = sourceValue + depth;
  // Right branch: multiplies by 2 at each depth
  const rightValue = sourceValue * Math.pow(2, depth);
  // Final result combines both branches
  return leftValue + rightValue;
}
export const diamondBenchmarks = {
  balises: (depth) => {
    const source = signal(1);

    let leftBranch = source;
    let rightBranch = source;

    for (let i = 0; i < depth; i++) {
      const lb = leftBranch;
      const rb = rightBranch;
      leftBranch = computed(() => lb.value + 1);
      rightBranch = computed(() => rb.value * 2);
    }

    const result = computed(() => leftBranch.value + rightBranch.value);
    const start_time = performance.now();
    source.value = 5;
    const finalResult = result.value;
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },

  maverick: (depth) => {
    return new Promise((resolve) => {
      root((dispose) => {
        const source = maverickSignal(1);

        let leftBranch = source;
        let rightBranch = source;

        for (let i = 0; i < depth; i++) {
          const lb = leftBranch;
          const rb = rightBranch;
          leftBranch = maverickComputed(() => lb() + 1);
          rightBranch = maverickComputed(() => rb() * 2);
        }

        const result = maverickComputed(() => leftBranch() + rightBranch());
        const start_time = performance.now();
        source.set(5);
        const finalResult = result();
        const time = performance.now() - start_time;

        dispose();
        resolve({ time, result: finalResult });
      });
    });
  },

  mobx: (depth) => {
    mobx.configure({ enforceActions: "never" });
    const source = mobx.observable.box(1);

    let leftBranch = source;
    let rightBranch = source;

    for (let i = 0; i < depth; i++) {
      const lb = leftBranch;
      const rb = rightBranch;
      leftBranch = mobx.computed(() => lb.get() + 1);
      rightBranch = mobx.computed(() => rb.get() * 2);
    }

    const result = mobx.computed(() => leftBranch.get() + rightBranch.get());
    const start_time = performance.now();
    source.set(5);
    const finalResult = result.get();
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },

  preact: (depth) => {
    const source = preact.signal(1);

    let leftBranch = source;
    let rightBranch = source;

    for (let i = 0; i < depth; i++) {
      const lb = leftBranch;
      const rb = rightBranch;
      leftBranch = preact.computed(() => lb.value + 1);
      rightBranch = preact.computed(() => rb.value * 2);
    }

    const result = preact.computed(() => leftBranch.value + rightBranch.value);
    const start_time = performance.now();
    source.value = 5;
    const finalResult = result.value;
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },

  hyperactiv: (depth) => {
    const obj = hyperactiv.observe(
      {
        source: 1,
        leftValues: Array.from({ length: depth + 1 }, () => 0),
        rightValues: Array.from({ length: depth + 1 }, () => 0),
        finalResult: 0,
      },
      { batch: true },
    );

    // Layer 0: read from source
    hyperactiv.computed(() => {
      obj.leftValues[0] = obj.source;
      obj.rightValues[0] = obj.source;
    });

    // Each subsequent layer depends on previous layer
    for (let i = 0; i < depth; i++) {
      const layer = i;
      hyperactiv.computed(() => {
        obj.leftValues[layer + 1] = obj.leftValues[layer] + 1;
      });
      hyperactiv.computed(() => {
        obj.rightValues[layer + 1] = obj.rightValues[layer] * 2;
      });
    }

    // Final result combines the last layer
    hyperactiv.computed(() => {
      obj.finalResult = obj.leftValues[depth] + obj.rightValues[depth];
    });

    const start_time = performance.now();
    obj.source = 5;
    hyperactiv.batch();
    const time = performance.now() - start_time;

    return { time, result: obj.finalResult };
  },

  vue: (depth) => {
    const source = vue.ref(1);

    let leftBranch = source;
    let rightBranch = source;

    for (let i = 0; i < depth; i++) {
      const lb = leftBranch;
      const rb = rightBranch;
      leftBranch = vue.computed(() => lb.value + 1);
      rightBranch = vue.computed(() => rb.value * 2);
    }

    const result = vue.computed(() => leftBranch.value + rightBranch.value);
    const start_time = performance.now();
    source.value = 5;
    const finalResult = result.value;
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },

  solid: (depth) => {
    return new Promise((resolve) => {
      solid.createRoot((dispose) => {
        const [source, setSource] = solid.createSignal(1);

        let leftBranch = source;
        let rightBranch = source;

        for (let i = 0; i < depth; i++) {
          const lb = leftBranch;
          const rb = rightBranch;
          leftBranch = solid.createMemo(() => lb() + 1);
          rightBranch = solid.createMemo(() => rb() * 2);
        }

        const result = solid.createMemo(() => leftBranch() + rightBranch());
        const start_time = performance.now();
        setSource(5);
        const finalResult = result();
        const time = performance.now() - start_time;

        dispose();
        resolve({ time, result: finalResult });
      });
    });
  },

  usignal: (depth) => {
    const source = usignal.signal(1);

    let leftBranch = source;
    let rightBranch = source;

    for (let i = 0; i < depth; i++) {
      const lb = leftBranch;
      const rb = rightBranch;
      leftBranch = usignal.computed(() => lb.value + 1);
      rightBranch = usignal.computed(() => rb.value * 2);
    }

    const result = usignal.computed(() => leftBranch.value + rightBranch.value);
    const start_time = performance.now();
    source.value = 5;
    const finalResult = result.value;
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },

  angular: (depth) => {
    const source = angular.signal(1);

    let leftBranch = source;
    let rightBranch = source;

    for (let i = 0; i < depth; i++) {
      const lb = leftBranch;
      const rb = rightBranch;
      leftBranch = angular.computed(() => lb() + 1);
      rightBranch = angular.computed(() => rb() * 2);
    }

    const result = angular.computed(() => leftBranch() + rightBranch());
    const start_time = performance.now();
    source.set(5);
    const finalResult = result();
    const time = performance.now() - start_time;

    return { time, result: finalResult };
  },
};

/**
 * Scenario 4: Creation and Disposal
 * Tests setup and teardown performance
 */
