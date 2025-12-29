/**
 * Scenario: List Updates (like v-for with keys)
 * Tests performance of list item property updates and filtering
 * Simulates common patterns like todo lists with add/remove/update
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
 * Calculate expected result for list scenario
 * Tests item updates and visibility toggling (simulating add/remove via filtering)
 * Operations are proportional to list size (10% each)
 */
export function getExpectedList(count) {
  const items = Array.from({ length: count }, (_, i) => ({
    id: i,
    value: i,
    visible: true,
  }));

  // Calculate proportional sizes (10% each operation, minimum 1)
  const removeCount = Math.max(1, Math.floor(count * 0.1));
  const addCount = Math.max(1, Math.floor(count * 0.1));
  const updateCount = Math.max(1, Math.floor(count * 0.1));

  // 1. "Remove" first 10% of items (mark as invisible)
  for (let i = 0; i < removeCount; i++) {
    items[i].visible = false;
  }

  // 2. "Add" last 10% of items (mark as visible + update values)
  const startIdx = Math.max(0, count - addCount);
  for (let i = startIdx; i < count; i++) {
    items[i].visible = true;
    items[i].value = (i + 100) * 10;
  }

  // 3. Update middle 10% of items
  const midStart = Math.floor(count * 0.45); // Start at 45% through list
  const midEnd = Math.min(count, midStart + updateCount);
  for (let i = midStart; i < midEnd; i++) {
    items[i].value = i * 3;
  }

  // 4. Filter visible items and sum their values
  const visibleItems = items.filter((item) => item.visible);
  const sum = visibleItems.reduce((acc, item) => acc + item.value, 0);

  return { count: visibleItems.length, sum };
}

export const listBenchmarks = {
  balises: (count) => {
    // Create list of items with id, value, and visible properties
    const items = Array.from({ length: count }, (_, i) => ({
      id: signal(i),
      value: signal(i),
      visible: signal(true),
    }));

    // Computed sum of visible items' values
    const sum = computed(() =>
      items
        .filter((item) => item.visible.value)
        .reduce((acc, item) => acc + item.value.value, 0),
    );

    // Computed count of visible items
    const visibleCount = computed(
      () => items.filter((item) => item.visible.value).length,
    );

    // Calculate proportional sizes (10% each operation, minimum 1)
    const removeCount = Math.max(1, Math.floor(count * 0.1));
    const addCount = Math.max(1, Math.floor(count * 0.1));
    const updateCount = Math.max(1, Math.floor(count * 0.1));

    const start_time = performance.now();

    batch(() => {
      // 1. "Remove" first 10% of items (mark as invisible)
      for (let i = 0; i < removeCount; i++) {
        items[i].visible.value = false;
      }

      // 2. "Add" last 10% of items (mark as visible + update values)
      const startIdx = Math.max(0, count - addCount);
      for (let i = startIdx; i < count; i++) {
        items[i].visible.value = true;
        items[i].value.value = (i + 100) * 10;
      }

      // 3. Update middle 10% of items
      const midStart = Math.floor(count * 0.45);
      const midEnd = Math.min(count, midStart + updateCount);
      for (let i = midStart; i < midEnd; i++) {
        items[i].value.value = i * 3;
      }
    });

    const finalSum = sum.value;
    const finalCount = visibleCount.value;
    const time = performance.now() - start_time;

    return {
      time,
      result: { count: finalCount, sum: finalSum },
    };
  },

  maverick: (count) => {
    return new Promise((resolve) => {
      root((dispose) => {
        const items = Array.from({ length: count }, (_, i) => ({
          id: maverickSignal(i),
          value: maverickSignal(i),
          visible: maverickSignal(true),
        }));

        const sum = maverickComputed(() =>
          items
            .filter((item) => item.visible())
            .reduce((acc, item) => acc + item.value(), 0),
        );

        const visibleCount = maverickComputed(
          () => items.filter((item) => item.visible()).length,
        );

        // Calculate proportional sizes (10% each operation, minimum 1)
        const removeCount = Math.max(1, Math.floor(count * 0.1));
        const addCount = Math.max(1, Math.floor(count * 0.1));
        const updateCount = Math.max(1, Math.floor(count * 0.1));

        const start_time = performance.now();

        tick();
        // 1. "Remove" first 10% of items (mark as invisible)
        for (let i = 0; i < removeCount; i++) {
          items[i].visible.set(false);
        }

        // 2. "Add" last 10% of items (mark as visible + update values)
        const startIdx = Math.max(0, count - addCount);
        for (let i = startIdx; i < count; i++) {
          items[i].visible.set(true);
          items[i].value.set((i + 100) * 10);
        }

        // 3. Update middle 10% of items
        const midStart = Math.floor(count * 0.45);
        const midEnd = Math.min(count, midStart + updateCount);
        for (let i = midStart; i < midEnd; i++) {
          items[i].value.set(i * 3);
        }
        tick();

        const finalSum = sum();
        const finalCount = visibleCount();

        const time = performance.now() - start_time;

        dispose();
        resolve({
          time,
          result: { count: finalCount, sum: finalSum },
        });
      });
    });
  },

  mobx: (count) => {
    mobx.configure({ enforceActions: "never" });

    const items = Array.from({ length: count }, (_, i) => ({
      id: mobx.observable.box(i),
      value: mobx.observable.box(i),
      visible: mobx.observable.box(true),
    }));

    const sum = mobx.computed(() =>
      items
        .filter((item) => item.visible.get())
        .reduce((acc, item) => acc + item.value.get(), 0),
    );

    const visibleCount = mobx.computed(
      () => items.filter((item) => item.visible.get()).length,
    );

    // Calculate proportional sizes (10% each operation, minimum 1)
    const removeCount = Math.max(1, Math.floor(count * 0.1));
    const addCount = Math.max(1, Math.floor(count * 0.1));
    const updateCount = Math.max(1, Math.floor(count * 0.1));

    const start_time = performance.now();

    mobx.runInAction(() => {
      // 1. "Remove" first 10% of items (mark as invisible)
      for (let i = 0; i < removeCount; i++) {
        items[i].visible.set(false);
      }

      // 2. "Add" last 10% of items (mark as visible + update values)
      const startIdx = Math.max(0, count - addCount);
      for (let i = startIdx; i < count; i++) {
        items[i].visible.set(true);
        items[i].value.set((i + 100) * 10);
      }

      // 3. Update middle 10% of items
      const midStart = Math.floor(count * 0.45);
      const midEnd = Math.min(count, midStart + updateCount);
      for (let i = midStart; i < midEnd; i++) {
        items[i].value.set(i * 3);
      }
    });

    const finalSum = sum.get();
    const finalCount = visibleCount.get();

    const time = performance.now() - start_time;

    return {
      time,
      result: { count: finalCount, sum: finalSum },
    };
  },

  preact: (count) => {
    const items = Array.from({ length: count }, (_, i) => ({
      id: preact.signal(i),
      value: preact.signal(i),
      visible: preact.signal(true),
    }));

    const sum = preact.computed(() =>
      items
        .filter((item) => item.visible.value)
        .reduce((acc, item) => acc + item.value.value, 0),
    );

    const visibleCount = preact.computed(
      () => items.filter((item) => item.visible.value).length,
    );

    // Calculate proportional sizes (10% each operation, minimum 1)
    const removeCount = Math.max(1, Math.floor(count * 0.1));
    const addCount = Math.max(1, Math.floor(count * 0.1));
    const updateCount = Math.max(1, Math.floor(count * 0.1));

    const start_time = performance.now();

    // 1. "Remove" first 10% of items (mark as invisible)
    for (let i = 0; i < removeCount; i++) {
      items[i].visible.value = false;
    }

    // 2. "Add" last 10% of items (mark as visible + update values)
    const startIdx = Math.max(0, count - addCount);
    for (let i = startIdx; i < count; i++) {
      items[i].visible.value = true;
      items[i].value.value = (i + 100) * 10;
    }

    // 3. Update middle 10% of items
    const midStart = Math.floor(count * 0.45);
    const midEnd = Math.min(count, midStart + updateCount);
    for (let i = midStart; i < midEnd; i++) {
      items[i].value.value = i * 3;
    }

    const finalSum = sum.value;
    const finalCount = visibleCount.value;

    const time = performance.now() - start_time;

    return {
      time,
      result: { count: finalCount, sum: finalSum },
    };
  },

  hyperactiv: (count) => {
    // Create a main observable to hold aggregated state
    const state = hyperactiv.observe(
      {
        sum: 0,
        visibleCount: 0,
      },
      { batch: true },
    );

    // Create individual item observables
    const items = Array.from({ length: count }, (_, i) =>
      hyperactiv.observe(
        {
          id: i,
          value: i,
          visible: true,
        },
        { batch: true },
      ),
    );

    // Computed for sum of visible items
    hyperactiv.computed(() => {
      state.sum = items
        .filter((item) => item.visible)
        .reduce((acc, item) => acc + item.value, 0);
    });

    // Computed for visible count
    hyperactiv.computed(() => {
      state.visibleCount = items.filter((item) => item.visible).length;
    });

    // Calculate proportional sizes (10% each operation, minimum 1)
    const removeCount = Math.max(1, Math.floor(count * 0.1));
    const addCount = Math.max(1, Math.floor(count * 0.1));
    const updateCount = Math.max(1, Math.floor(count * 0.1));

    const start_time = performance.now();

    // 1. "Remove" first 10% of items (mark as invisible)
    for (let i = 0; i < removeCount; i++) {
      items[i].visible = false;
    }

    // 2. "Add" last 10% of items (mark as visible + update values)
    const startIdx = Math.max(0, count - addCount);
    for (let i = startIdx; i < count; i++) {
      items[i].visible = true;
      items[i].value = (i + 100) * 10;
    }

    // 3. Update middle 10% of items
    const midStart = Math.floor(count * 0.45);
    const midEnd = Math.min(count, midStart + updateCount);
    for (let i = midStart; i < midEnd; i++) {
      items[i].value = i * 3;
    }

    hyperactiv.batch();

    const time = performance.now() - start_time;

    return {
      time,
      result: { count: state.visibleCount, sum: state.sum },
    };
  },

  vue: (count) => {
    // Create items with id, value, and visible properties
    const items = Array.from({ length: count }, (_, i) => ({
      id: vue.ref(i),
      value: vue.ref(i),
      visible: vue.ref(true),
    }));

    const sum = vue.computed(() =>
      items
        .filter((item) => item.visible.value)
        .reduce((acc, item) => acc + item.value.value, 0),
    );

    const visibleCount = vue.computed(
      () => items.filter((item) => item.visible.value).length,
    );

    // Calculate proportional sizes (10% each operation, minimum 1)
    const removeCount = Math.max(1, Math.floor(count * 0.1));
    const addCount = Math.max(1, Math.floor(count * 0.1));
    const updateCount = Math.max(1, Math.floor(count * 0.1));

    const start_time = performance.now();

    // 1. "Remove" first 10% of items (mark as invisible)
    for (let i = 0; i < removeCount; i++) {
      items[i].visible.value = false;
    }

    // 2. "Add" last 10% of items (mark as visible + update values)
    const startIdx = Math.max(0, count - addCount);
    for (let i = startIdx; i < count; i++) {
      items[i].visible.value = true;
      items[i].value.value = (i + 100) * 10;
    }

    // 3. Update middle 10% of items
    const midStart = Math.floor(count * 0.45);
    const midEnd = Math.min(count, midStart + updateCount);
    for (let i = midStart; i < midEnd; i++) {
      items[i].value.value = i * 3;
    }

    const finalSum = sum.value;
    const finalCount = visibleCount.value;
    const time = performance.now() - start_time;

    return {
      time,
      result: { count: finalCount, sum: finalSum },
    };
  },

  solid: (count) => {
    return new Promise((resolve) => {
      solid.createRoot((dispose) => {
        const items = Array.from({ length: count }, (_, i) => {
          const [id, setId] = solid.createSignal(i);
          const [value, setValue] = solid.createSignal(i);
          const [visible, setVisible] = solid.createSignal(true);
          return { id, setId, value, setValue, visible, setVisible };
        });

        const sum = solid.createMemo(() =>
          items
            .filter((item) => item.visible())
            .reduce((acc, item) => acc + item.value(), 0),
        );

        const visibleCount = solid.createMemo(
          () => items.filter((item) => item.visible()).length,
        );

        // Calculate proportional sizes (10% each operation, minimum 1)
        const removeCount = Math.max(1, Math.floor(count * 0.1));
        const addCount = Math.max(1, Math.floor(count * 0.1));
        const updateCount = Math.max(1, Math.floor(count * 0.1));

        const start_time = performance.now();

        solid.batch(() => {
          // 1. "Remove" first 10% of items (mark as invisible)
          for (let i = 0; i < removeCount; i++) {
            items[i].setVisible(false);
          }

          // 2. "Add" last 10% of items (mark as visible + update values)
          const startIdx = Math.max(0, count - addCount);
          for (let i = startIdx; i < count; i++) {
            items[i].setVisible(true);
            items[i].setValue((i + 100) * 10);
          }

          // 3. Update middle 10% of items
          const midStart = Math.floor(count * 0.45);
          const midEnd = Math.min(count, midStart + updateCount);
          for (let i = midStart; i < midEnd; i++) {
            items[i].setValue(i * 3);
          }
        });

        const finalSum = sum();
        const finalCount = visibleCount();

        const time = performance.now() - start_time;

        dispose();
        resolve({
          time,
          result: { count: finalCount, sum: finalSum },
        });
      });
    });
  },
};
