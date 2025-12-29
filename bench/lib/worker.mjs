/**
 * Worker script for running benchmarks in isolation
 * Each framework runs in its own process to prevent memory/JIT contamination
 */

import { calculateStats } from "./utils.mjs";
import {
  WARMUP_RUNS,
  RUNS_PER_TIER,
  DISCARD_BEST_WORST_X_RUNS,
} from "./config.mjs";

async function runBenchmark(fn, param) {
  try {
    const result = await fn(param);
    if (typeof result === "number") {
      return { time: result, result: null };
    }
    return result;
  } catch (error) {
    return { error: error.message || "error" };
  }
}

async function main() {
  // Parse command line args
  const args = JSON.parse(process.argv[2]);
  const { library, scenarioFile, tiers, hasExpectedFn } = args;

  // Dynamically import the scenario
  const scenarioModule = await import(scenarioFile);

  // Extract benchmark object and expected function
  // scenarioModule should export something like { layersBenchmarks, getExpectedLayers }
  const benchmarkKeys = Object.keys(scenarioModule).filter((k) =>
    k.endsWith("Benchmarks"),
  );
  if (benchmarkKeys.length === 0) {
    console.error(JSON.stringify({ error: "No benchmarks found in scenario" }));
    process.exit(1);
  }

  const benchmarks = scenarioModule[benchmarkKeys[0]];
  const getExpected = hasExpectedFn
    ? Object.values(scenarioModule).find(
        (v) =>
          typeof v === "function" && v.name && v.name.startsWith("getExpected"),
      )
    : null;

  const benchmark = benchmarks[library];
  if (!benchmark) {
    console.error(
      JSON.stringify({ error: `No benchmark found for ${library}` }),
    );
    process.exit(1);
  }

  const results = { times: [] };

  for (const tier of tiers) {
    const times = [];
    const expected = getExpected ? getExpected(tier) : null;
    let validationResult = null;
    let hasError = false;

    // Warmup runs
    for (let i = 0; i < WARMUP_RUNS; i++) {
      await runBenchmark(benchmark, tier);
    }

    // Actual measurement runs
    for (let i = 0; i < RUNS_PER_TIER; i++) {
      const { time, result, error } = await runBenchmark(benchmark, tier);

      if (error) {
        results.times.push({ tier, error, stats: { avg: null, stdDev: null } });
        hasError = true;
        break;
      }

      times.push(time);

      // Store result from first run for validation
      if (i === 0 && result !== null) {
        validationResult = result;
      }
    }

    if (hasError) {
      continue;
    }

    // Validate result if expected is provided
    if (expected && validationResult !== null) {
      let isValid = false;
      if (Array.isArray(expected)) {
        isValid = JSON.stringify(validationResult) === JSON.stringify(expected);
      } else if (typeof expected === "object" && expected !== null) {
        isValid = Object.keys(expected).every(
          (key) => validationResult[key] === expected[key],
        );
      } else {
        isValid = validationResult === expected;
      }

      if (!isValid) {
        results.times.push({
          tier,
          validationError: { expected, got: validationResult },
          stats: { avg: null, stdDev: null },
        });
        continue;
      }
    }

    if (times.length > 0) {
      const stats = calculateStats(times, DISCARD_BEST_WORST_X_RUNS);
      results.times.push({ tier, stats });
    }
  }

  // Output results as JSON
  console.log(JSON.stringify(results));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
