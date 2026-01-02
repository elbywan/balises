/**
 * Scenario 1: Deep Layers (Dependency Chain)
 * Tests propagation through deep dependency chains
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
import * as usignal from "usignal";
import * as angular from "@angular/core";
import { signal, computed, batch } from "../../dist/esm/index.js";

/**
 * Calculate expected result for layers scenario
 */
export function getExpectedLayers(depth) {
  // Starting values before update
  let values = { a: 4, b: 3, c: 2, d: 1 };

  // Apply transformations through each layer
  for (let i = 0; i < depth; i++) {
    const prev = { ...values };
    values.a = prev.b;
    values.b = prev.a - prev.c;
    values.c = prev.b + prev.d;
    values.d = prev.c;
  }

  return [values.a, values.b, values.c, values.d];
}
export const layersBenchmarks = {
  balises: (layers) => {
    const start = {
      a: signal(1),
      b: signal(2),
      c: signal(3),
      d: signal(4),
    };

    let layer = start;

    for (let i = layers; i--; ) {
      layer = ((m) => {
        const a = computed(() => m.b.value);
        const b = computed(() => m.a.value - m.c.value);
        const c = computed(() => m.b.value + m.d.value);
        const d = computed(() => m.c.value);
        return { a, b, c, d };
      })(layer);
    }

    const end = layer;

    const start_time = performance.now();
    batch(() => {
      start.a.value = 4;
      start.b.value = 3;
      start.c.value = 2;
      start.d.value = 1;
    });

    const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
    const time = performance.now() - start_time;

    return { time, result: solution };
  },

  maverick: (layers) => {
    return new Promise((resolve) => {
      root((dispose) => {
        const start = {
          a: maverickSignal(1),
          b: maverickSignal(2),
          c: maverickSignal(3),
          d: maverickSignal(4),
        };

        let layer = start;
        for (let i = layers; i--; ) {
          layer = ((m) => ({
            a: maverickComputed(() => m.b()),
            b: maverickComputed(() => m.a() - m.c()),
            c: maverickComputed(() => m.b() + m.d()),
            d: maverickComputed(() => m.c()),
          }))(layer);
        }
        const end = layer;

        const start_time = performance.now();
        tick();
        start.a.set(4);
        start.b.set(3);
        start.c.set(2);
        start.d.set(1);
        tick();

        const solution = [end.a(), end.b(), end.c(), end.d()];
        const time = performance.now() - start_time;

        dispose();
        resolve({ time, result: solution });
      });
    });
  },

  mobx: (layers) => {
    mobx.configure({ enforceActions: "never" });
    const start = mobx.observable({
      a: mobx.observable.box(1),
      b: mobx.observable.box(2),
      c: mobx.observable.box(3),
      d: mobx.observable.box(4),
    });

    let layer = start;
    for (let i = layers; i--; ) {
      layer = ((prev) => {
        const next = {
          a: mobx.computed(() => prev.b.get()),
          b: mobx.computed(() => prev.a.get() - prev.c.get()),
          c: mobx.computed(() => prev.b.get() + prev.d.get()),
          d: mobx.computed(() => prev.c.get()),
        };
        return next;
      })(layer);
    }
    const end = layer;

    const start_time = performance.now();
    mobx.runInAction(() => {
      start.a.set(4);
      start.b.set(3);
      start.c.set(2);
      start.d.set(1);
    });

    const solution = [end.a.get(), end.b.get(), end.c.get(), end.d.get()];
    const time = performance.now() - start_time;

    return { time, result: solution };
  },

  preact: (layers) => {
    const a = preact.signal(1),
      b = preact.signal(2),
      c = preact.signal(3),
      d = preact.signal(4);

    const start = { a, b, c, d };
    let layer = start;
    for (let i = layers; i--; ) {
      layer = ((m) => {
        const props = {
          a: preact.computed(() => m.b.value),
          b: preact.computed(() => m.a.value - m.c.value),
          c: preact.computed(() => m.b.value + m.d.value),
          d: preact.computed(() => m.c.value),
        };
        return props;
      })(layer);
    }
    const end = layer;

    const start_time = performance.now();
    preact.batch(() => {
      a.value = 4;
      b.value = 3;
      c.value = 2;
      d.value = 1;
    });

    const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
    const time = performance.now() - start_time;

    return { time, result: solution };
  },

  hyperactiv: (layers) => {
    const observe = (obj) => hyperactiv.observe(obj, { batch: true });
    const comp = (fn) => hyperactiv.computed(fn);

    const start = observe({ a: 1, b: 2, c: 3, d: 4 });
    let layer = start;
    for (let i = layers; i--; ) {
      layer = ((prev) => {
        const next = observe({});
        comp(() => (next.a = prev.b));
        comp(() => (next.b = prev.a - prev.c));
        comp(() => (next.c = prev.b + prev.d));
        comp(() => (next.d = prev.c));
        return next;
      })(layer);
    }
    const end = layer;

    const start_time = performance.now();
    start.a = 4;
    start.b = 3;
    start.c = 2;
    start.d = 1;
    hyperactiv.batch();

    const solution = [end.a, end.b, end.c, end.d];
    const time = performance.now() - start_time;

    return { time, result: solution };
  },

  vue: (layers) => {
    const start = {
      a: vue.ref(1),
      b: vue.ref(2),
      c: vue.ref(3),
      d: vue.ref(4),
    };

    let layer = start;
    for (let i = layers; i--; ) {
      layer = ((m) => ({
        a: vue.computed(() => m.b.value),
        b: vue.computed(() => m.a.value - m.c.value),
        c: vue.computed(() => m.b.value + m.d.value),
        d: vue.computed(() => m.c.value),
      }))(layer);
    }
    const end = layer;

    const start_time = performance.now();
    start.a.value = 4;
    start.b.value = 3;
    start.c.value = 2;
    start.d.value = 1;

    const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
    const time = performance.now() - start_time;

    return { time, result: solution };
  },

  solid: (layers) => {
    return new Promise((resolve) => {
      solid.createRoot((dispose) => {
        const [a, setA] = solid.createSignal(1);
        const [b, setB] = solid.createSignal(2);
        const [c, setC] = solid.createSignal(3);
        const [d, setD] = solid.createSignal(4);

        const start = { a, b, c, d };
        let layer = start;
        for (let i = layers; i--; ) {
          layer = ((m) => ({
            a: solid.createMemo(() => m.b()),
            b: solid.createMemo(() => m.a() - m.c()),
            c: solid.createMemo(() => m.b() + m.d()),
            d: solid.createMemo(() => m.c()),
          }))(layer);
        }
        const end = layer;

        const start_time = performance.now();
        solid.batch(() => {
          setA(4);
          setB(3);
          setC(2);
          setD(1);
        });

        const solution = [end.a(), end.b(), end.c(), end.d()];
        const time = performance.now() - start_time;

        dispose();
        resolve({ time, result: solution });
      });
    });
  },

  usignal: (layers) => {
    const start = {
      a: usignal.signal(1),
      b: usignal.signal(2),
      c: usignal.signal(3),
      d: usignal.signal(4),
    };

    let layer = start;
    for (let i = layers; i--; ) {
      layer = ((m) => ({
        a: usignal.computed(() => m.b.value),
        b: usignal.computed(() => m.a.value - m.c.value),
        c: usignal.computed(() => m.b.value + m.d.value),
        d: usignal.computed(() => m.c.value),
      }))(layer);
    }
    const end = layer;

    const start_time = performance.now();
    start.a.value = 4;
    start.b.value = 3;
    start.c.value = 2;
    start.d.value = 1;

    const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
    const time = performance.now() - start_time;

    return { time, result: solution };
  },

  angular: (layers) => {
    const start = {
      a: angular.signal(1),
      b: angular.signal(2),
      c: angular.signal(3),
      d: angular.signal(4),
    };

    let layer = start;
    for (let i = layers; i--; ) {
      layer = ((m) => ({
        a: angular.computed(() => m.b()),
        b: angular.computed(() => m.a() - m.c()),
        c: angular.computed(() => m.b() + m.d()),
        d: angular.computed(() => m.c()),
      }))(layer);
    }
    const end = layer;

    const start_time = performance.now();
    start.a.set(4);
    start.b.set(3);
    start.c.set(2);
    start.d.set(1);

    const solution = [end.a(), end.b(), end.c(), end.d()];
    const time = performance.now() - start_time;

    return { time, result: solution };
  },
};
