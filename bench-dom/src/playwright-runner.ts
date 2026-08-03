/**
 * Playwright-based DOM Benchmark Runner
 *
 * Each framework runs in a fresh browser context for true isolation.
 * Uses CDP tracing to measure from click event to final Commit (paint).
 *
 * Based on js-framework-benchmark methodology:
 * https://github.com/krausest/js-framework-benchmark
 *
 * The key benefit of this approach:
 * - True isolation: no GC/memory pressure from other frameworks
 * - Fresh browser context for each framework
 * - Forced GC between benchmark runs
 * - Accurate paint timing via CDP trace events
 */

import { chromium, type CDPSession, type Page } from "playwright";
import { createServer, type Server } from "http";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BENCH_DIR = join(__dirname, "..");

// MIME types for serving files
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

// Benchmark configuration
interface BenchConfig {
  warmupRuns: number;
  measurementRuns: number;
  frameworks: string[];
  benchmarks: string[];
}

const DEFAULT_CONFIG: BenchConfig = {
  warmupRuns: 5,
  measurementRuns: 10,
  frameworks: [
    "vanilla",
    "balises",
    "balises-compiled",
    "solid",
    "vue",
    "lit",
    "react",
    "preact",
    "svelte",
  ],
  benchmarks: [
    "create1000",
    "create10000",
    "append1000",
    "updateEvery10th",
    "selectRow",
    "swapRows",
    "removeRow",
    "clear",
  ],
};

const QUICK_CONFIG: BenchConfig = {
  warmupRuns: 2,
  measurementRuns: 3,
  frameworks: [
    "vanilla",
    "balises",
    "balises-compiled",
    "solid",
    "preact",
    "svelte",
  ],
  benchmarks: ["create1000", "create10000", "updateEvery10th", "clear"],
};

// Trace event types from CDP
interface TraceEvent {
  name: string;
  cat: string;
  ph: string; // Phase: 'B' = begin, 'E' = end, 'X' = complete
  ts: number; // Timestamp in microseconds
  dur?: number; // Duration in microseconds (for 'X' phase)
  pid: number;
  tid: number;
  args?: {
    data?: {
      type?: string; // For EventDispatch events
    };
  };
}

/**
 * Result from trace extraction
 */
interface TraceResult {
  /** Total time from click to commit (includes frame scheduling) */
  total: number;
  /** Script time - sum of all JS execution time between click and commit */
  script: number;
}

/**
 * Script-related event names that represent JS execution time.
 * - EventDispatch: click handler execution (synchronous work)
 * - RunTask: async work like Vue's scheduled renders, microtasks
 * Note: FunctionCall events require different trace categories and are nested,
 * so we use these higher-level events instead.
 */
const SCRIPT_EVENT_NAMES = ["EventDispatch", "RunTask"];

/**
 * All meaningful work event names (includes layout, etc.)
 */
const WORK_EVENT_NAMES = [
  "EventDispatch",
  "RunTask",
  "Layout",
  "UpdateLayoutTree",
  "FireAnimationFrame",
];

/**
 * Extract duration from trace events using krausest methodology:
 * - Find the click event as start
 * - Find meaningful work events (Layout, FunctionCall, FireAnimationFrame) after click
 * - Find the first Commit after the last meaningful event
 * - Duration = (commit.end - click.ts) in milliseconds
 *
 * Script time is the sum of all JS execution events (FunctionCall, EvaluateScript,
 * RunMicrotasks) between click and commit. This captures async framework work
 * like Vue's scheduled renders, not just the click handler.
 */
function extractDurationFromTrace(
  events: TraceEvent[],
  debug = false,
): TraceResult | null {
  // Find click event (the trigger for the benchmark)
  const clickEvent = events.find(
    (e) =>
      e.name === "EventDispatch" &&
      e.ph === "X" &&
      e.args?.data?.type === "click",
  );

  if (!clickEvent) {
    if (debug) console.log("  DEBUG: No click event found");
    return null;
  }

  const clickPid = clickEvent.pid;
  const clickTs = clickEvent.ts;
  const clickDur = clickEvent.dur || 0;
  const clickEnd = clickTs + clickDur;

  if (debug) {
    console.log(
      `  DEBUG: Click event at ${clickTs}, dur=${clickDur} (${(clickDur / 1000).toFixed(2)}ms), pid=${clickPid}`,
    );
  }

  // Find all meaningful work events after click, on the same process
  const workEvents = events.filter(
    (e) =>
      WORK_EVENT_NAMES.includes(e.name) &&
      e.ph === "X" &&
      e.pid === clickPid &&
      e.ts >= clickTs,
  );

  // Find the last meaningful work event (highest end time)
  let lastWorkEventEnd = clickEnd;
  let lastWorkEventName = "click";
  for (const event of workEvents) {
    const eventEnd = event.ts + (event.dur || 0);
    if (eventEnd > lastWorkEventEnd) {
      lastWorkEventEnd = eventEnd;
      lastWorkEventName = event.name;
    }
  }

  if (debug) {
    console.log(
      `  DEBUG: Last work event: ${lastWorkEventName} ending at ${lastWorkEventEnd} (${(lastWorkEventEnd - clickTs) / 1000}ms after click)`,
    );
    console.log(`  DEBUG: Found ${workEvents.length} work events`);
  }

  // Find all Commit events on the same process
  const commitEvents = events.filter(
    (e) => e.name === "Commit" && e.ph === "X" && e.pid === clickPid,
  );

  if (debug) {
    console.log(`  DEBUG: Found ${commitEvents.length} commit events`);
  }

  // Determine the end timestamp (commit or paint)
  let endTs: number;

  if (commitEvents.length === 0) {
    // Fallback: try Paint events
    const paintEvents = events.filter(
      (e) => e.name === "Paint" && e.ph === "X" && e.pid === clickPid,
    );

    const relevantPaint = paintEvents
      .filter((e) => e.ts >= lastWorkEventEnd)
      .sort((a, b) => a.ts - b.ts)[0];

    if (!relevantPaint) {
      if (paintEvents.length === 0) {
        // No paint events, use last work event end
        endTs = lastWorkEventEnd;
      } else {
        const lastPaint = paintEvents.reduce((latest, e) => {
          const eEnd = e.ts + (e.dur || 0);
          const latestEnd = latest.ts + (latest.dur || 0);
          return eEnd > latestEnd ? e : latest;
        });
        endTs = lastPaint.ts + (lastPaint.dur || 0);
      }
    } else {
      endTs = relevantPaint.ts + (relevantPaint.dur || 0);
    }
  } else {
    // Find the FIRST commit after the last work event
    const relevantCommit = commitEvents
      .filter((e) => e.ts >= lastWorkEventEnd)
      .sort((a, b) => a.ts - b.ts)[0];

    if (!relevantCommit) {
      if (debug)
        console.log(
          "  DEBUG: No commit after last work event, using last commit",
        );
      const lastCommit = commitEvents.reduce((latest, e) => {
        const eEnd = e.ts + (e.dur || 0);
        const latestEnd = latest.ts + (latest.dur || 0);
        return eEnd > latestEnd ? e : latest;
      });
      endTs = lastCommit.ts + (lastCommit.dur || 0);
    } else {
      if (debug) {
        console.log(
          `  DEBUG: Relevant commit at ${relevantCommit.ts} (${(relevantCommit.ts - clickTs) / 1000}ms after click)`,
        );
      }
      endTs = relevantCommit.ts + (relevantCommit.dur || 0);
    }
  }

  // Calculate total time
  const total = (endTs - clickTs) / 1000;

  // Calculate script time: sum of all JS execution events between click and commit
  // We only count events that START before the commit (endTs) to avoid counting
  // unrelated work that happens after our benchmark
  const scriptEvents = events.filter(
    (e) =>
      SCRIPT_EVENT_NAMES.includes(e.name) &&
      e.ph === "X" &&
      e.pid === clickPid &&
      e.ts >= clickTs &&
      e.ts < endTs,
  );

  // Sum up durations, but avoid double-counting nested events
  // Sort by start time, then merge overlapping intervals
  const intervals = scriptEvents
    .map((e) => ({ start: e.ts, end: e.ts + (e.dur || 0) }))
    .sort((a, b) => a.start - b.start);

  let scriptTimeUs = 0;
  let currentEnd = 0;

  for (const interval of intervals) {
    if (interval.start >= currentEnd) {
      // Non-overlapping, add full duration
      scriptTimeUs += interval.end - interval.start;
      currentEnd = interval.end;
    } else if (interval.end > currentEnd) {
      // Overlapping, only add the non-overlapping portion
      scriptTimeUs += interval.end - currentEnd;
      currentEnd = interval.end;
    }
    // Else: fully contained in previous interval, skip
  }

  const script = scriptTimeUs / 1000;

  if (debug) {
    console.log(
      `  DEBUG: Script events: ${scriptEvents.length}, merged script time: ${script.toFixed(2)}ms`,
    );
  }

  return { total, script };
}

/**
 * Create a simple HTTP server to serve benchmark files.
 */
function createBenchServer(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = req.url || "/";
      const urlPath = url.split("?")[0]!; // Strip query params
      let filePath = join(
        BENCH_DIR,
        urlPath === "/" ? "benchmark.html" : urlPath,
      );

      // Handle framework-specific pages
      if (urlPath.startsWith("/bench/")) {
        filePath = join(BENCH_DIR, "benchmark.html");
      }

      if (!existsSync(filePath)) {
        console.log(`404: ${filePath}`);
        res.writeHead(404);
        res.end("Not found: " + filePath);
        return;
      }

      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      try {
        const content = readFileSync(filePath);
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
      } catch (error) {
        console.log(`500: ${filePath}`, error);
        res.writeHead(500);
        res.end("Server error");
      }
    });

    server.listen(port, () => {
      resolve(server);
    });

    server.on("error", reject);
  });
}

/**
 * Run a single benchmark for a framework using CDP tracing.
 * Uses click events to trigger benchmarks so we can measure click → commit.
 */
async function runBenchmark(
  page: Page,
  cdp: CDPSession,
  benchmark: string,
  warmupRuns: number,
  measurementRuns: number,
): Promise<{ times: number[]; traceTimes: number[]; scriptTimes: number[] }> {
  const times: number[] = [];
  const traceTimes: number[] = [];
  const scriptTimes: number[] = [];

  const totalRuns = warmupRuns + measurementRuns;

  for (let i = 0; i < totalRuns; i++) {
    const isWarmup = i < warmupRuns;

    // Reset state
    await page.evaluate(() => {
      (window as unknown as { benchReset?: () => void }).benchReset?.();
    });

    // Setup if needed (for benchmarks that require existing rows)
    const needsSetup = [
      "append1000",
      "updateEvery10th",
      "selectRow",
      "swapRows",
      "removeRow",
      "clear",
    ].includes(benchmark);

    if (needsSetup) {
      await page.evaluate(() => {
        (window as unknown as { benchSetup?: () => void }).benchSetup?.();
      });
      // Wait for setup to complete with double-RAF
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => r(undefined)),
            ),
          ),
      );
    }

    // Force GC if available
    try {
      await cdp.send("HeapProfiler.collectGarbage");
    } catch {
      // GC not available, continue anyway
    }

    // Wait for idle (double-RAF to ensure any pending work is done)
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => r(undefined)),
          ),
        ),
    );

    // Start tracing
    const traceCategories = [
      "blink.user_timing",
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
    ];

    const traceEvents: TraceEvent[] = [];
    const tracePromise = new Promise<void>((resolve) => {
      const onChunk = (params: { value: unknown[] }) => {
        traceEvents.push(...(params.value as TraceEvent[]));
      };
      const onComplete = () => {
        cdp.off("Tracing.tracingComplete", onComplete);
        cdp.off("Tracing.dataCollected", onChunk);
        resolve();
      };
      cdp.on("Tracing.dataCollected", onChunk);
      cdp.on("Tracing.tracingComplete", onComplete);
    });

    await cdp.send("Tracing.start", {
      categories: traceCategories.join(","),
    });

    // Run benchmark via button click (so we get EventDispatch in trace)
    // Also measure with performance.now() as fallback
    const perfDuration = await page.evaluate(async (benchName: string) => {
      const start = performance.now();

      // Find and click the benchmark button
      const button = document.querySelector(
        `[data-benchmark="${benchName}"]`,
      ) as HTMLButtonElement | null;
      if (button) {
        button.click();
      } else {
        // Fallback: call benchmark directly
        const benchFn = (
          window as unknown as { benchmarks?: Record<string, () => void> }
        ).benchmarks?.[benchName];
        if (benchFn) {
          await benchFn();
        }
      }

      // Force reflow
      void document.body.offsetHeight;

      // Wait for paint (double RAF ensures paint has completed)
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      return performance.now() - start;
    }, benchmark);

    // Small delay to ensure commit events are captured
    await new Promise((r) => setTimeout(r, 50));

    // Stop tracing
    await cdp.send("Tracing.end");
    await tracePromise;

    const traceResult = extractDurationFromTrace(traceEvents, false);

    // Only record after warmup
    if (!isWarmup) {
      times.push(perfDuration);
      if (traceResult !== null) {
        traceTimes.push(traceResult.total);
        scriptTimes.push(traceResult.script);
      }
    }
  }

  return { times, traceTimes, scriptTimes };
}

/**
 * Calculate statistics from an array of times.
 */
function calculateStats(times: number[]): {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  median: number;
} {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const variance =
    times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);
  return { mean, min, max, stdDev, median };
}

/**
 * Format a table of results.
 */
function formatResultsTable(
  results: Map<string, Map<string, number[]>>,
  scriptResults: Map<string, Map<string, number[]>>,
  benchmarks: string[],
): void {
  const frameworks = [...results.keys()];

  // Header
  console.log("\n" + "=".repeat(100));
  console.log("BENCHMARK RESULTS (times in ms, lower is better)");
  console.log("=".repeat(100) + "\n");

  // Column widths
  const benchWidth = 20;
  const fwWidth = 18; // Wider to fit "total/script" format

  // Print header row
  let header = "Benchmark".padEnd(benchWidth);
  for (const fw of frameworks) {
    header += fw.padStart(fwWidth);
  }
  console.log(header);
  console.log("-".repeat(benchWidth + frameworks.length * fwWidth));

  // Print each benchmark row
  for (const bench of benchmarks) {
    let row = bench.padEnd(benchWidth);
    const means: number[] = [];

    for (const fw of frameworks) {
      const times = results.get(fw)?.get(bench);
      const scripts = scriptResults.get(fw)?.get(bench);

      if (times && times.length > 0) {
        const { mean } = calculateStats(times);
        means.push(mean);

        // Show total/script format when script times are available
        if (scripts && scripts.length > 0) {
          const scriptMean = calculateStats(scripts).mean;
          const cell = `${mean.toFixed(1)}/${scriptMean.toFixed(1)}`;
          row += cell.padStart(fwWidth);
        } else {
          row += mean.toFixed(2).padStart(fwWidth);
        }
      } else {
        row += "N/A".padStart(fwWidth);
        means.push(Infinity);
      }
    }

    // Highlight fastest (by total time)
    const minMean = Math.min(...means);
    if (minMean !== Infinity) {
      const fastestIdx = means.indexOf(minMean);
      const fastestFw = frameworks[fastestIdx];
      row += `  <- ${fastestFw}`;
    }

    console.log(row);
  }

  // Print summary
  console.log("\n" + "-".repeat(100));
  console.log("GEOMETRIC MEAN (overall performance score, lower is better):");
  console.log("-".repeat(100));

  const geoMeans: { framework: string; geoMean: number }[] = [];

  for (const fw of frameworks) {
    const fwResults = results.get(fw);
    if (!fwResults) continue;

    const means: number[] = [];
    for (const bench of benchmarks) {
      const times = fwResults.get(bench);
      if (times && times.length > 0) {
        means.push(calculateStats(times).mean);
      }
    }

    if (means.length > 0) {
      const geoMean = Math.pow(
        means.reduce((a, b) => a * b, 1),
        1 / means.length,
      );
      geoMeans.push({ framework: fw, geoMean });
    }
  }

  // Sort by geometric mean
  geoMeans.sort((a, b) => a.geoMean - b.geoMean);

  for (let i = 0; i < geoMeans.length; i++) {
    const { framework, geoMean } = geoMeans[i]!;
    const rank = i + 1;
    const ratio = geoMeans[0] ? geoMean / geoMeans[0].geoMean : 1;
    console.log(
      `  ${rank}. ${framework.padEnd(12)} ${geoMean.toFixed(2).padStart(8)} ms ${ratio > 1 ? `(${ratio.toFixed(2)}x slower)` : "(fastest)"}`,
    );
  }

  console.log("\n" + "=".repeat(100) + "\n");
}

/**
 * Main benchmark runner.
 */
async function main() {
  const args = process.argv.slice(2);
  const isQuick = args.includes("--quick");
  const config = isQuick ? QUICK_CONFIG : DEFAULT_CONFIG;

  console.log(`\nDOM Benchmark Runner (Playwright + CDP Tracing)`);
  console.log(`Mode: ${isQuick ? "Quick" : "Full"}`);
  console.log(`Frameworks: ${config.frameworks.join(", ")}`);
  console.log(`Benchmarks: ${config.benchmarks.join(", ")}`);
  console.log(`Warmup runs: ${config.warmupRuns}`);
  console.log(`Measurement runs: ${config.measurementRuns}\n`);

  // Start server
  const PORT = 3456;
  const server = await createBenchServer(PORT);
  console.log(`Server running at http://localhost:${PORT}`);

  let browser;
  try {
    // Launch browser with --expose-gc for garbage collection
    browser = await chromium.launch({
      headless: true,
      args: [
        "--expose-gc",
        "--disable-gpu-vsync",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });
  } catch (error) {
    // Clean up server if browser launch fails
    server.close();
    throw error;
  }

  const results = new Map<string, Map<string, number[]>>();
  const scriptResults = new Map<string, Map<string, number[]>>();

  try {
    for (const framework of config.frameworks) {
      console.log(`\nRunning benchmarks for: ${framework}`);
      results.set(framework, new Map());
      scriptResults.set(framework, new Map());

      // Create fresh context for each framework (isolation)
      const context = await browser.newContext();
      const page = await context.newPage();

      // Create CDP session for tracing and garbage collection
      const cdp = await context.newCDPSession(page);

      // Load the benchmark page for this framework
      await page.goto(
        `http://localhost:${PORT}/benchmark.html?framework=${framework}`,
      );

      // Wait for framework to initialize
      await page.waitForFunction(
        () => (window as unknown as { benchReady?: boolean }).benchReady,
        { timeout: 10000 },
      );

      for (const benchmark of config.benchmarks) {
        process.stdout.write(`  ${benchmark}... `);

        try {
          const { times, traceTimes, scriptTimes } = await runBenchmark(
            page,
            cdp,
            benchmark,
            config.warmupRuns,
            config.measurementRuns,
          );

          // Use trace times (total time to commit)
          const timesToUse = traceTimes.length > 0 ? traceTimes : times;
          const stats = calculateStats(timesToUse);
          results.get(framework)!.set(benchmark, timesToUse);

          // Store script times separately
          if (scriptTimes.length > 0) {
            scriptResults.get(framework)!.set(benchmark, scriptTimes);
          }

          // Also show script time for comparison
          const scriptStats =
            scriptTimes.length > 0 ? calculateStats(scriptTimes) : null;
          const scriptInfo = scriptStats
            ? ` (script: ${scriptStats.mean.toFixed(2)}ms)`
            : "";

          console.log(
            `${stats.mean.toFixed(2)} ms (±${stats.stdDev.toFixed(2)})${scriptInfo}`,
          );
        } catch (error) {
          console.log(`FAILED: ${error}`);
        }
      }

      await context.close();
    }

    // Print results table
    formatResultsTable(results, scriptResults, config.benchmarks);

    // Export machine-readable results (script times per framework/benchmark)
    const out: Record<string, Record<string, number>> = {};
    for (const [fw, benches] of scriptResults) {
      out[fw] = {};
      for (const [bench, times] of benches) {
        out[fw][bench] = calculateStats(times).mean;
      }
    }
    writeFileSync(
      join(BENCH_DIR, "results.json"),
      JSON.stringify(out, null, 2),
    );
    console.log("\nResults written to bench-dom/results.json");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
