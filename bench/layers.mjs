/**
 * Adapted from: https://github.com/maverick-js/observables/tree/main/bench
 * Original: https://github.com/elbywan/hyperactiv/tree/master/bench
 */

import kleur from "kleur";
import { cellx } from "cellx";
import * as Sjs from "s-js";
import * as mobx from "mobx";
import {
  root,
  signal as maverickSignal,
  computed as maverickComputed,
} from "@maverick-js/signals";
import * as preact from "@preact/signals-core";
import hyperactiv from "hyperactiv";
import { signal, computed } from "../dist/esm/index.js";
import Table from "cli-table";
import v8 from "node:v8";
import vm from "vm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc");
function collectGarbage() {
  gc && gc();
}

const WARMUP_RUNS = 10;
const RUNS_PER_TIER = 100;
const DISCARD_BEST_WORST_X_RUNS = 10;
const LAYER_TIERS = [10, 100, 500, 1000, 2000, 2500, 5000];

const sum = (array) => array.reduce((a, b) => a + b, 0);
const avg = (array) => sum(array) / array.length || 0;

const SOLUTIONS = {
  10: [2, 4, -2, -3],
  100: [-2, -4, 2, 3],
  500: [-2, 1, -4, -4],
  1000: [-2, -4, 2, 3],
  2000: [-2, 1, -4, -4],
  2500: [-2, -4, 2, 3],
  5000: [-2, 1, -4, -4],
  10000: [-2, -4, 2, 3],
};

/**
 * @param {number} layers
 * @param {number[]} answer
 */
const isSolution = (layers, answer) =>
  answer.every((s, i) => s === SOLUTIONS[layers][i]);

// Get package versions from bench/package.json dependencies
function getVersion(pkgName) {
  try {
    // First try require.resolve (works for packages that export package.json)
    const pkgPath = require.resolve(`${pkgName}/package.json`);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version;
  } catch {
    // Fallback: read from our own package.json dependencies
    try {
      const benchPkgPath = path.resolve(__dirname, "package.json");
      const benchPkg = JSON.parse(fs.readFileSync(benchPkgPath, "utf-8"));
      const version = benchPkg.dependencies?.[pkgName];
      if (version) {
        // Remove ^ or ~ prefix
        return version.replace(/^[\^~]/, "");
      }
    } catch {
      // ignore
    }
    return "?";
  }
}

// Get balises version from parent package.json
function getBalisesVersion() {
  try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version;
  } catch {
    return "?";
  }
}

async function main() {
  const selfOnly = process.argv.includes("--self");

  console.log(kleur.bold("\n🚀 Layers Benchmark\n"));
  if (selfOnly) {
    console.log(kleur.yellow("Running in self-only mode (balises only)\n"));
  }
  console.log(
    `Configuration: ${RUNS_PER_TIER} runs per tier, discarding ${DISCARD_BEST_WORST_X_RUNS} best/worst, ${WARMUP_RUNS} warmup runs`,
  );
  console.log(`Layer tiers: ${LAYER_TIERS.join(", ")}\n`);

  const allLibraries = {
    [`cellx@${getVersion("cellx")}`]: { fn: runCellx, runs: [] },
    [`hyperactiv@${getVersion("hyperactiv")}`]: { fn: runHyperactiv, runs: [] },
    [`@maverick-js/signals@${getVersion("@maverick-js/signals")}`]: {
      fn: runMaverick,
      runs: [],
    },
    [`mobx@${getVersion("mobx")}`]: { fn: runMobx, runs: [] },
    [`@preact/signals-core@${getVersion("@preact/signals-core")}`]: {
      fn: runPreact,
      runs: [],
    },
    [`s-js@${getVersion("s-js")}`]: { fn: runS, runs: [] },
    [`balises@${getBalisesVersion()}`]: { fn: runBalises, runs: [] },
  };

  // If --self flag is passed, only benchmark balises
  const report = selfOnly
    ? { [`balises@${getBalisesVersion()}`]: { fn: runBalises, runs: [] } }
    : allLibraries;

  const libNames = Object.keys(report);
  const totalLibs = libNames.length;

  for (let libIndex = 0; libIndex < totalLibs; libIndex++) {
    const lib = libNames[libIndex];
    // Force garbage collection when switching libraries
    collectGarbage();

    console.log(kleur.cyan(`[${libIndex + 1}/${totalLibs}] Testing ${lib}...`));

    const current = report[lib];

    for (let i = 0; i < LAYER_TIERS.length; i += 1) {
      const layers = LAYER_TIERS[i];
      let runs = [];
      let result = null;

      process.stdout.write(`  └─ ${layers} layers: `);

      // Warmup runs (not counted)
      for (let w = 0; w < WARMUP_RUNS; w++) {
        await start(current.fn, layers);
      }

      for (let j = 0; j < RUNS_PER_TIER; j += 1) {
        result = await start(current.fn, layers);
        if (typeof result !== "number") {
          break;
        }
        runs.push(result);
        // Progress indicator every 20 runs
        if ((j + 1) % 20 === 0) {
          process.stdout.write(".");
        }
      }
      // Allow libraries that free resources asynchronously (e.g. cellx) do so.
      await new Promise((resolve) => setTimeout(resolve, 0));

      if (typeof result !== "number") {
        current.runs[i] = result;
        console.log(kleur.red(` ${result}`));
      } else {
        if (DISCARD_BEST_WORST_X_RUNS) {
          runs = runs
            .sort((a, b) => a - b)
            .slice(DISCARD_BEST_WORST_X_RUNS, -DISCARD_BEST_WORST_X_RUNS);
        }
        current.runs[i] = avg(runs) * 1000;
        console.log(kleur.green(` ${current.runs[i].toFixed(2)}μs`));
      }
    }
    console.log();
  }

  console.log(kleur.bold("\n📊 Results (μs - lower is better)\n"));

  const table = new Table({
    head: ["", ...LAYER_TIERS.map((n) => kleur.bold(kleur.cyan(n)))],
  });

  for (let i = 0; i < LAYER_TIERS.length; i += 1) {
    let min = Infinity,
      max = -1,
      fastestLib,
      slowestLib;

    for (const lib of Object.keys(report)) {
      const time = report[lib].runs[i];

      if (typeof time !== "number") {
        continue;
      }

      if (time < min) {
        min = time;
        fastestLib = lib;
      }

      if (time > max) {
        max = time;
        slowestLib = lib;
      }
    }

    if (fastestLib && typeof report[fastestLib].runs[i] === "number")
      report[fastestLib].runs[i] = kleur.green(
        report[fastestLib].runs[i].toFixed(2),
      );
    if (slowestLib && typeof report[slowestLib].runs[i] === "number")
      report[slowestLib].runs[i] = kleur.red(
        report[slowestLib].runs[i].toFixed(2),
      );
  }

  for (const lib of Object.keys(report)) {
    table.push([
      kleur.magenta(lib),
      ...report[lib].runs.map((n) =>
        typeof n === "number" ? n.toFixed(2) : n,
      ),
    ]);
  }

  console.log(table.toString());
}

async function start(runner, layers) {
  return new Promise((done) => {
    runner(layers, done);
  }).catch((error) => {
    console.error(error);
    return error.message.toString();
  });
}

/**
 * Balises - this library
 */
function runBalises(layers, done) {
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

  const startTime = performance.now();
  const end = layer;

  start.a.value = 4;
  start.b.value = 3;
  start.c.value = 2;
  start.d.value = 1;

  const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
  const endTime = performance.now() - startTime;

  done(isSolution(layers, solution) ? endTime : "wrong");
}

/**
 * @see {@link https://github.com/Riim/cellx}
 */
function runCellx(layers, done) {
  const start = {
    a: cellx(1),
    b: cellx(2),
    c: cellx(3),
    d: cellx(4),
  };

  let layer = start;

  for (let i = layers; i--; ) {
    layer = ((m) => {
      const props = {
        a: cellx(() => m.b.get()),
        b: cellx(() => m.a.get() - m.c.get()),
        c: cellx(() => m.b.get() + m.d.get()),
        d: cellx(() => m.c.get()),
      };

      props.a.on("change", function () {});
      props.b.on("change", function () {});
      props.c.on("change", function () {});
      props.d.on("change", function () {});

      return props;
    })(layer);
  }

  const startTime = performance.now();
  const end = layer;

  start.a.set(4);
  start.b.set(3);
  start.c.set(2);
  start.d.set(1);

  const solution = [end.a.get(), end.b.get(), end.c.get(), end.d.get()];
  const endTime = performance.now() - startTime;

  start.a.dispose();
  start.b.dispose();
  start.c.dispose();
  start.d.dispose();

  done(isSolution(layers, solution) ? endTime : "wrong");
}

/**
 * @see {@link https://github.com/maverick-js/signals}
 */
function runMaverick(layers, done) {
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

    const startTime = performance.now();
    const end = layer;

    (start.a.set(4), start.b.set(3), start.c.set(2), start.d.set(1));

    const solution = [end.a(), end.b(), end.c(), end.d()];
    const endTime = performance.now() - startTime;

    dispose();
    done(isSolution(layers, solution) ? endTime : "wrong");
  });
}

/**
 * @see {@link https://github.com/adamhaile/S}
 */
function runS(layers, done) {
  const S = Sjs.default;

  S.root(() => {
    const start = {
      a: S.data(1),
      b: S.data(2),
      c: S.data(3),
      d: S.data(4),
    };

    let layer = start;

    for (let i = layers; i--; ) {
      layer = ((m) => {
        const props = {
          a: S(() => m.b()),
          b: S(() => m.a() - m.c()),
          c: S(() => m.b() + m.d()),
          d: S(() => m.c()),
        };

        return props;
      })(layer);
    }

    const startTime = performance.now();
    const end = layer;

    (start.a(4), start.b(3), start.c(2), start.d(1));

    const solution = [end.a(), end.b(), end.c(), end.d()];
    const endTime = performance.now() - startTime;

    done(isSolution(layers, solution) ? endTime : "wrong");
  });
}

/**
 * @see {@link https://github.com/mobxjs/mobx}
 */
function runMobx(layers, done) {
  mobx.configure({
    enforceActions: "never",
  });
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

  const startTime = performance.now();

  start.a.set(4);
  start.b.set(3);
  start.c.set(2);
  start.d.set(1);

  const solution = [end.a.get(), end.b.get(), end.c.get(), end.d.get()];
  const endTime = performance.now() - startTime;
  done(isSolution(layers, solution) ? endTime : "wrong");
}

/**
 * @see {@link https://github.com/preactjs/signals}
 */
function runPreact(layers, done) {
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

  const startTime = performance.now();
  const end = layer;

  preact.batch(() => {
    ((a.value = 4), (b.value = 3), (c.value = 2), (d.value = 1));
  });

  const solution = [end.a.value, end.b.value, end.c.value, end.d.value];
  const endTime = performance.now() - startTime;

  done(isSolution(layers, solution) ? endTime : -1);
}

function runHyperactiv(layers, done) {
  const observe = (obj) => hyperactiv.observe(obj, { batch: true });
  const comp = (fn) => hyperactiv.computed(fn, { disableTracking: true });

  const start = observe({
    a: 1,
    b: 2,
    c: 3,
    d: 4,
  });
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

  const startTime = performance.now();

  start.a = 4;
  start.b = 3;
  start.c = 2;
  start.d = 1;

  hyperactiv.batch();

  const solution = [end.a, end.b, end.c, end.d];
  const endTime = performance.now() - startTime;
  done(isSolution(layers, solution) ? endTime : "wrong");
}

main();
