import kleur from "kleur";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getVersion, getBalisesVersion, calculateStats } from "./utils.mjs";
import {
  WARMUP_RUNS,
  RUNS_PER_TIER,
  DISCARD_BEST_WORST_X_RUNS,
} from "./config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runBenchmarkInWorker(
  lib,
  scenarioFile,
  tiers,
  expectedFn,
) {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, "worker.mjs");
    const args = JSON.stringify({
      library: lib,
      scenarioFile,
      tiers,
      hasExpectedFn: !!expectedFn,
    });

    const child = spawn(process.execPath, [workerPath, args], {
      stdio: ["inherit", "pipe", "inherit"],
    });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker process exited with code ${code}`));
        return;
      }

      try {
        const result = JSON.parse(output.trim());
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse worker output: ${error.message}`));
      }
    });
  });
}

export async function runBenchmark(fn, param) {
  try {
    const result = await fn(param);
    // Handle both old format (number) and new format ({ time, result })
    if (typeof result === "number") {
      return { time: result, result: null };
    }
    return result;
  } catch (error) {
    return { error: error.message || "error" };
  }
}

export async function runBenchmarkSuite(
  name,
  benchmarks,
  tiers,
  selfOnly = false,
  verbose = false,
  expectedFn = null,
  scenarioFile = null,
  isolated = false,
) {
  console.log(kleur.bold(`\n${name}`));

  const allLibraries = [
    "balises",
    "preact",
    "vue",
    "solid",
    "maverick",
    "mobx",
    "hyperactiv",
  ];

  const librariesToTest = selfOnly ? ["balises"] : allLibraries;
  const report = {};

  for (const lib of librariesToTest) {
    const version =
      lib === "balises"
        ? getBalisesVersion()
        : getVersion(
            lib === "maverick"
              ? "@maverick-js/signals"
              : lib === "preact"
                ? "@preact/signals-core"
                : lib === "vue"
                  ? "@vue/reactivity"
                  : lib === "solid"
                    ? "solid-js"
                    : lib,
          );
    report[`${lib}@${version}`] = { times: [] };
  }

  const libNames = Object.keys(report);
  const totalLibs = libNames.length;

  for (let libIndex = 0; libIndex < totalLibs; libIndex++) {
    const libKey = libNames[libIndex];
    const lib = libKey.split("@")[0];

    if (verbose) {
      console.log(
        kleur.cyan(`[${libIndex + 1}/${totalLibs}] Testing ${libKey}...`),
      );
    } else {
      process.stdout.write(
        kleur.cyan(`[${libIndex + 1}/${totalLibs}] ${libKey} `),
      );
    }

    const current = report[libKey];

    // Use isolated worker if enabled
    if (isolated && scenarioFile) {
      try {
        const workerResult = await runBenchmarkInWorker(
          lib,
          scenarioFile,
          tiers,
          expectedFn,
        );
        current.times = workerResult.times.map((t) => {
          if (t.error) return t.error;
          if (t.validationError) {
            console.error(
              kleur.red(
                `\n  ❌ Validation failed for ${libKey} at tier ${t.tier}!`,
              ),
            );
            console.error(
              kleur.red(
                `     Expected: ${JSON.stringify(t.validationError.expected)}`,
              ),
            );
            console.error(
              kleur.red(`     Got: ${JSON.stringify(t.validationError.got)}`),
            );
            return "Validation failed";
          }
          if (verbose) {
            console.log(
              kleur.green(
                `  └─ ${t.tier}: ${(t.stats.mean * 1000).toFixed(2)}μs ±${(t.stats.stdDev * 1000).toFixed(2)}μs`,
              ),
            );
          } else {
            process.stdout.write(".");
          }
          return t.stats;
        });

        if (!verbose) {
          console.log(kleur.green(" ✓"));
        } else {
          console.log();
        }
        continue;
      } catch (error) {
        console.error(kleur.red(`\n  ❌ Worker failed: ${error.message}`));
        // Fall back to in-process execution
      }
    }

    // In-process execution (original code)
    for (let i = 0; i < tiers.length; i++) {
      const tier = tiers[i];
      let runs = [];
      let hasValidationError = false;
      let validationResult = null;

      if (verbose) {
        process.stdout.write(`  └─ ${tier}: `);
      }

      // Warmup
      for (let w = 0; w < WARMUP_RUNS; w++) {
        await runBenchmark(benchmarks[lib], tier);
      }

      // Actual runs
      for (let j = 0; j < RUNS_PER_TIER; j++) {
        const benchResult = await runBenchmark(benchmarks[lib], tier);

        if (benchResult.error) {
          current.times[i] = benchResult.error;
          break;
        }

        runs.push(benchResult.time);

        // Store result from first run for validation
        if (j === 0 && benchResult.result !== null) {
          validationResult = benchResult.result;
        }

        if (verbose && (j + 1) % 20 === 0) {
          process.stdout.write(".");
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Validate result if expectedFn is provided
      if (expectedFn && validationResult !== null && !hasValidationError) {
        const expected = expectedFn(tier);
        if (expected !== null) {
          // Handle both simple values and objects
          const actualResult = validationResult;
          let isValid = false;

          if (Array.isArray(expected)) {
            // Compare arrays using JSON serialization
            isValid = JSON.stringify(actualResult) === JSON.stringify(expected);
          } else if (typeof expected === "object" && expected !== null) {
            // Compare object properties
            isValid = Object.keys(expected).every(
              (key) => actualResult[key] === expected[key],
            );
          } else {
            isValid = actualResult === expected;
          }

          if (!isValid) {
            console.error(
              kleur.red(
                `\n  ❌ Validation failed for ${libKey} at tier ${tier}!`,
              ),
            );
            console.error(
              kleur.red(`     Expected: ${JSON.stringify(expected)}`),
            );
            console.error(
              kleur.red(`     Got: ${JSON.stringify(actualResult)}`),
            );
            hasValidationError = true;
            current.times[i] = "Validation failed";
          }
        }
      }

      if (typeof current.times[i] === "string") {
        if (verbose) {
          console.log(kleur.red(` ${current.times[i]}`));
        }
      } else if (!hasValidationError) {
        const stats = calculateStats(runs, DISCARD_BEST_WORST_X_RUNS);
        current.times[i] = stats;
        if (verbose) {
          console.log(
            kleur.green(
              ` ${(stats.mean * 1000).toFixed(2)}μs ±${(stats.stdDev * 1000).toFixed(2)}μs`,
            ),
          );
        } else {
          process.stdout.write(".");
        }
      }
    }

    if (!verbose) {
      console.log(kleur.green(" ✓"));
    } else {
      console.log();
    }
  }

  return { report, tiers, name };
}
