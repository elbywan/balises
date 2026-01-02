#!/usr/bin/env node
/**
 * Comprehensive benchmark suite for reactive libraries
 * Tests multiple scenarios: layers, wide graphs, diamond dependencies, conditional, list, batching
 */

import kleur from "kleur";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { runBenchmarkSuite } from "./lib/runner.mjs";
import { displayResults, displayFinalSummary } from "./lib/display.mjs";
import {
  LAYER_TIERS,
  WIDE_TIERS,
  DIAMOND_TIERS,
  CONDITIONAL_TIERS,
  LIST_TIERS,
  BATCHING_TIERS,
} from "./lib/config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import scenario benchmarks
import { layersBenchmarks, getExpectedLayers } from "./scenarios/layers.mjs";
import { wideBenchmarks, getExpectedWide } from "./scenarios/wide.mjs";
import { diamondBenchmarks, getExpectedDiamond } from "./scenarios/diamond.mjs";
import {
  conditionalBenchmarks,
  getExpectedConditional,
} from "./scenarios/conditional.mjs";
import { listBenchmarks, getExpectedList } from "./scenarios/list.mjs";
import {
  batchingBenchmarks,
  getExpectedBatching,
} from "./scenarios/batching.mjs";

async function main() {
  const selfOnly = process.argv.includes("--self");
  const scenarioArg = process.argv.find((arg) => arg.startsWith("--scenario="));
  const scenario = scenarioArg ? scenarioArg.split("=")[1] : "all";
  const libsArg = process.argv.find((arg) => arg.startsWith("--libs="));
  const libs = libsArg ? libsArg.split("=")[1].split(",") : null;
  const isolated = process.argv.includes("--isolated");

  // Default to verbose when running a single scenario, unless explicitly set to quiet
  const explicitVerbose = process.argv.includes("--verbose");
  const explicitQuiet = process.argv.includes("--quiet");
  const verbose = explicitQuiet ? false : scenario !== "all" || explicitVerbose;

  console.log(kleur.bold("\n🚀 Comprehensive Reactivity Benchmark Suite\n"));
  if (selfOnly) {
    console.log(kleur.yellow("Running in self-only mode (balises only)\n"));
  }
  if (libs) {
    console.log(kleur.cyan(`Running libraries: ${libs.join(", ")}\n`));
  }
  if (scenario !== "all") {
    console.log(kleur.cyan(`Running scenario: ${scenario}\n`));
  }
  if (isolated) {
    console.log(
      kleur.cyan(
        "Running in isolated mode (separate processes per framework)\n",
      ),
    );
  }
  console.log(
    `Mode: ${verbose ? "verbose" : "quiet"} ${scenario === "all" ? "(use --verbose for detailed output)" : "(use --quiet to disable)"}\n`,
  );

  const allResults = [];

  const scenarios = {
    layers: async () => {
      const result = await runBenchmarkSuite(
        "Scenario 1: Deep Layers (Dependency Chain)",
        layersBenchmarks,
        LAYER_TIERS,
        selfOnly,
        verbose,
        getExpectedLayers,
        join(__dirname, "scenarios/layers.mjs"),
        isolated,
        libs,
      );
      allResults.push(result);
      displayResults(result.report, result.tiers, result.name, verbose);
    },
    wide: async () => {
      const result = await runBenchmarkSuite(
        "Scenario 2: Wide Graph (Independent Signals)",
        wideBenchmarks,
        WIDE_TIERS,
        selfOnly,
        verbose,
        getExpectedWide,
        join(__dirname, "scenarios/wide.mjs"),
        isolated,
        libs,
      );
      allResults.push(result);
      displayResults(result.report, result.tiers, result.name, verbose);
    },
    diamond: async () => {
      const result = await runBenchmarkSuite(
        "Scenario 3: Diamond Dependencies (Multiple Paths)",
        diamondBenchmarks,
        DIAMOND_TIERS,
        selfOnly,
        verbose,
        getExpectedDiamond,
        join(__dirname, "scenarios/diamond.mjs"),
        isolated,
        libs,
      );
      allResults.push(result);
      displayResults(result.report, result.tiers, result.name, verbose);
    },
    conditional: async () => {
      const result = await runBenchmarkSuite(
        "Scenario 4: Conditional Updates (like v-if)",
        conditionalBenchmarks,
        CONDITIONAL_TIERS,
        selfOnly,
        verbose,
        getExpectedConditional,
        join(__dirname, "scenarios/conditional.mjs"),
        isolated,
        libs,
      );
      allResults.push(result);
      displayResults(result.report, result.tiers, result.name, verbose);
    },
    list: async () => {
      const result = await runBenchmarkSuite(
        "Scenario 5: List Updates (like v-for)",
        listBenchmarks,
        LIST_TIERS,
        selfOnly,
        verbose,
        getExpectedList,
        join(__dirname, "scenarios/list.mjs"),
        isolated,
        libs,
      );
      allResults.push(result);
      displayResults(result.report, result.tiers, result.name, verbose);
    },
    batching: async () => {
      const result = await runBenchmarkSuite(
        "Scenario 6: Batching / Transactions",
        batchingBenchmarks,
        BATCHING_TIERS,
        selfOnly,
        verbose,
        getExpectedBatching,
        join(__dirname, "scenarios/batching.mjs"),
        isolated,
        libs,
      );
      allResults.push(result);
      displayResults(result.report, result.tiers, result.name, verbose);
    },
  };

  if (scenario === "all") {
    for (const [name, fn] of Object.entries(scenarios)) {
      await fn();
    }
  } else if (scenarios[scenario]) {
    await scenarios[scenario]();
  } else {
    console.error(
      kleur.red(
        `\nUnknown scenario: ${scenario}. Available: all, layers, wide, diamond, create, conditional, list, batching, dynamic\n`,
      ),
    );
    process.exit(1);
  }

  // Display final summary if running all scenarios
  if (scenario === "all" && allResults.length > 0) {
    displayFinalSummary(allResults);
  }

  console.log(kleur.bold("\n✅ Benchmark complete!\n"));
}

main();
