/**
 * DOM Benchmark Runner
 *
 * Runs benchmarks for different frameworks and displays results.
 */

import type { BenchmarkSuite, AdvancedBenchmarkSuite } from "./types.js";
import { extractDOMState } from "./types.js";

interface BenchmarkConfig {
  name: string;
  warmupRuns: number;
  measurementRuns: number;
  verifyCorrectness: boolean;
}

interface RunResult {
  benchmark: string;
  times: number[];
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  correctness?: { valid: boolean; errors: string[] };
}

interface FrameworkResults {
  framework: string;
  results: RunResult[];
}

// Default configuration
const DEFAULT_CONFIG: BenchmarkConfig = {
  name: "DOM Benchmark",
  warmupRuns: 3,
  measurementRuns: 5,
  verifyCorrectness: true,
};

// Benchmark scenarios to run
const BENCHMARKS = [
  { id: "create1000", name: "Create 1,000 rows", setup: "clear" },
  { id: "create10000", name: "Create 10,000 rows", setup: "clear" },
  { id: "append1000", name: "Append 1,000 rows", setup: "create1000" },
  { id: "updateEvery10th", name: "Update every 10th row", setup: "create1000" },
  { id: "selectRow", name: "Select row", setup: "create1000", arg: 5 },
  { id: "swapRows", name: "Swap rows", setup: "create1000" },
  { id: "removeRow", name: "Remove row", setup: "create1000", arg: 5 },
  { id: "clear", name: "Clear rows", setup: "create1000" },
] as const;

/**
 * Pre-benchmark state captured for verification
 */
interface PreBenchmarkState {
  rowCount: number;
  /** IDs of first few rows */
  firstRowIds: string[];
  /** ID at index 1 (for swap verification) */
  id1?: string;
  /** ID at index 998 (for swap verification) */
  id998?: string;
  /** ID at the removal index */
  removeTargetId?: string;
  /** Labels of rows at indices 0, 10, 20, ... (for update verification) */
  everyTenthLabels?: string[];
  /** Full row data for detailed checks */
  rows: Array<{ id: string; label: string; selected: boolean }>;
}

/**
 * Capture pre-benchmark state for verification.
 */
function capturePreState(
  container: HTMLElement,
  benchmarkId: string,
  arg?: number,
): PreBenchmarkState {
  const state = extractDOMState(container);

  const preState: PreBenchmarkState = {
    rowCount: state.rowCount,
    firstRowIds: state.rows.slice(0, 10).map((r) => r.id),
    rows: state.rows,
  };

  // Capture specific state based on benchmark
  if (benchmarkId === "swapRows" && state.rows.length >= 999) {
    const id1 = state.rows[1]?.id;
    const id998 = state.rows[998]?.id;
    if (id1) preState.id1 = id1;
    if (id998) preState.id998 = id998;
  }

  if (benchmarkId === "removeRow") {
    const idx = arg ?? 5;
    const removeId = state.rows[idx]?.id;
    if (removeId) preState.removeTargetId = removeId;
  }

  if (benchmarkId === "updateEvery10th") {
    preState.everyTenthLabels = [];
    for (let i = 0; i < state.rows.length; i += 10) {
      const row = state.rows[i];
      if (row) preState.everyTenthLabels.push(row.label);
    }
  }

  return preState;
}

/**
 * Comprehensive benchmark verification.
 * Verifies DOM state after benchmark execution against expected results.
 */
function verifyBenchmarkResult(
  container: HTMLElement,
  benchmarkId: string,
  preState: PreBenchmarkState,
  arg?: number,
): { valid: boolean; errors: string[] } {
  const actual = extractDOMState(container);
  const errors: string[] = [];

  switch (benchmarkId) {
    case "create1000": {
      // Should have exactly 1000 rows
      if (actual.rowCount !== 1000) {
        errors.push(`Expected 1000 rows, got ${actual.rowCount}`);
      }
      // IDs should be sequential 1-1000
      if (actual.rows[0]?.id !== "1") {
        errors.push(`First row ID should be "1", got "${actual.rows[0]?.id}"`);
      }
      if (actual.rows[999]?.id !== "1000") {
        errors.push(
          `Last row ID should be "1000", got "${actual.rows[999]?.id}"`,
        );
      }
      // No row should be selected
      const selected = actual.rows.filter((r) => r.selected);
      if (selected.length > 0) {
        errors.push(`No rows should be selected, got ${selected.length}`);
      }
      break;
    }

    case "create10000": {
      // Should have exactly 10000 rows
      if (actual.rowCount !== 10000) {
        errors.push(`Expected 10000 rows, got ${actual.rowCount}`);
      }
      // IDs should be sequential 1-10000
      if (actual.rows[0]?.id !== "1") {
        errors.push(`First row ID should be "1", got "${actual.rows[0]?.id}"`);
      }
      if (actual.rows[9999]?.id !== "10000") {
        errors.push(
          `Last row ID should be "10000", got "${actual.rows[9999]?.id}"`,
        );
      }
      break;
    }

    case "append1000": {
      // Should have 2000 rows (1000 original + 1000 appended)
      if (actual.rowCount !== 2000) {
        errors.push(`Expected 2000 rows, got ${actual.rowCount}`);
      }
      // Original rows should still be at the beginning
      for (let i = 0; i < Math.min(preState.firstRowIds.length, 5); i++) {
        if (actual.rows[i]?.id !== preState.firstRowIds[i]) {
          errors.push(
            `Row ${i} ID changed: was "${preState.firstRowIds[i]}", now "${actual.rows[i]?.id}"`,
          );
          break;
        }
      }
      // New rows should have IDs 1001-2000
      if (actual.rows[1000]?.id !== "1001") {
        errors.push(
          `First appended row ID should be "1001", got "${actual.rows[1000]?.id}"`,
        );
      }
      if (actual.rows[1999]?.id !== "2000") {
        errors.push(
          `Last appended row ID should be "2000", got "${actual.rows[1999]?.id}"`,
        );
      }
      break;
    }

    case "updateEvery10th": {
      // Row count should be unchanged
      if (actual.rowCount !== preState.rowCount) {
        errors.push(
          `Row count changed: was ${preState.rowCount}, now ${actual.rowCount}`,
        );
      }
      // Every 10th row (0, 10, 20, ...) should have " !!!" appended
      const everyTenthLabels = preState.everyTenthLabels ?? [];
      for (let i = 0; i < actual.rowCount; i += 10) {
        const row = actual.rows[i];
        const originalLabel = everyTenthLabels[i / 10];
        if (row && originalLabel) {
          const expectedLabel = originalLabel + " !!!";
          if (row.label !== expectedLabel) {
            errors.push(
              `Row ${i} label should be "${expectedLabel}", got "${row.label}"`,
            );
            break; // Only report first error
          }
        }
      }
      // Non-10th rows should be unchanged
      for (let i = 1; i < Math.min(10, actual.rowCount); i++) {
        if (i % 10 === 0) continue;
        const row = actual.rows[i];
        const preRow = preState.rows[i];
        if (row && preRow && row.label !== preRow.label) {
          errors.push(
            `Row ${i} should not have changed: was "${preRow.label}", now "${row.label}"`,
          );
          break;
        }
      }
      break;
    }

    case "selectRow": {
      const idx = arg ?? 5;
      // Row count should be unchanged
      if (actual.rowCount !== preState.rowCount) {
        errors.push(
          `Row count changed: was ${preState.rowCount}, now ${actual.rowCount}`,
        );
      }
      // Exactly one row should be selected
      const selectedRows = actual.rows.filter((r) => r.selected);
      if (selectedRows.length !== 1) {
        errors.push(`Expected 1 selected row, got ${selectedRows.length}`);
      }
      // The row at index should be selected
      const targetRow = actual.rows[idx];
      if (targetRow && !targetRow.selected) {
        errors.push(`Row at index ${idx} should be selected`);
      }
      // Other rows should not be selected
      for (let i = 0; i < Math.min(20, actual.rowCount); i++) {
        if (i === idx) continue;
        if (actual.rows[i]?.selected) {
          errors.push(`Row at index ${i} should NOT be selected`);
          break;
        }
      }
      break;
    }

    case "swapRows": {
      // Row count should be unchanged
      if (actual.rowCount !== preState.rowCount) {
        errors.push(
          `Row count changed: was ${preState.rowCount}, now ${actual.rowCount}`,
        );
      }
      // Rows at indices 1 and 998 should be swapped
      if (preState.id1 && preState.id998) {
        const currentId1 = actual.rows[1]?.id;
        const currentId998 = actual.rows[998]?.id;

        if (currentId1 !== preState.id998) {
          errors.push(
            `Swap failed: index 1 should have ID "${preState.id998}" (was at 998), got "${currentId1}"`,
          );
        }
        if (currentId998 !== preState.id1) {
          errors.push(
            `Swap failed: index 998 should have ID "${preState.id1}" (was at 1), got "${currentId998}"`,
          );
        }
        // Other rows should be unchanged
        if (actual.rows[0]?.id !== preState.rows[0]?.id) {
          errors.push(
            `Row 0 should be unchanged: was "${preState.rows[0]?.id}", now "${actual.rows[0]?.id}"`,
          );
        }
        if (actual.rows[2]?.id !== preState.rows[2]?.id) {
          errors.push(
            `Row 2 should be unchanged: was "${preState.rows[2]?.id}", now "${actual.rows[2]?.id}"`,
          );
        }
        if (actual.rows[997]?.id !== preState.rows[997]?.id) {
          errors.push(
            `Row 997 should be unchanged: was "${preState.rows[997]?.id}", now "${actual.rows[997]?.id}"`,
          );
        }
        if (actual.rows[999]?.id !== preState.rows[999]?.id) {
          errors.push(
            `Row 999 should be unchanged: was "${preState.rows[999]?.id}", now "${actual.rows[999]?.id}"`,
          );
        }
      } else {
        errors.push("Could not capture pre-swap state for verification");
      }
      break;
    }

    case "removeRow": {
      const idx = arg ?? 5;
      // Row count should decrease by 1
      if (actual.rowCount !== preState.rowCount - 1) {
        errors.push(
          `Expected ${preState.rowCount - 1} rows after removal, got ${actual.rowCount}`,
        );
      }
      // The removed row ID should not exist
      if (preState.removeTargetId) {
        const stillExists = actual.rows.some(
          (r) => r.id === preState.removeTargetId,
        );
        if (stillExists) {
          errors.push(
            `Row with ID "${preState.removeTargetId}" should have been removed`,
          );
        }
      }
      // Rows before the removal index should be unchanged
      for (let i = 0; i < idx && i < actual.rowCount; i++) {
        if (actual.rows[i]?.id !== preState.rows[i]?.id) {
          errors.push(
            `Row ${i} ID changed unexpectedly: was "${preState.rows[i]?.id}", now "${actual.rows[i]?.id}"`,
          );
          break;
        }
      }
      // Rows after removal should shift up
      for (let i = idx; i < Math.min(idx + 5, actual.rowCount); i++) {
        const expectedId = preState.rows[i + 1]?.id;
        if (actual.rows[i]?.id !== expectedId) {
          errors.push(
            `Row ${i} should have shifted: expected ID "${expectedId}", got "${actual.rows[i]?.id}"`,
          );
          break;
        }
      }
      break;
    }

    case "clear": {
      // Should have 0 rows
      if (actual.rowCount !== 0) {
        errors.push(`Expected 0 rows after clear, got ${actual.rowCount}`);
      }
      break;
    }

    default:
      errors.push(`Unknown benchmark: ${benchmarkId}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Force a reflow to ensure DOM layout is calculated.
 * This triggers synchronous layout but doesn't guarantee paint.
 */
function forceReflow(): void {
  // Reading offsetHeight forces the browser to calculate layout
  void document.body.offsetHeight;
}

/**
 * Wait for the browser to actually paint.
 *
 * Uses double-RAF technique:
 * - First RAF: schedules callback for next frame
 * - Second RAF: called after first frame has been painted
 *
 * This is the standard technique for ensuring paint has completed.
 * js-framework-benchmark uses Chrome DevTools Protocol trace events,
 * but for in-browser measurement, double-RAF is the best approximation.
 */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

/**
 * Wait for next frame before starting a benchmark.
 * Ensures clean state between benchmark runs.
 */
function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

/**
 * Wait for a specified number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to trigger garbage collection and let the browser settle.
 * This helps isolate benchmark runs from each other.
 *
 * Note: gc() is only available in Chrome with --expose-gc flag,
 * so we gracefully handle its absence.
 */
async function attemptGCAndSettle(): Promise<void> {
  // Try to trigger GC if available (Chrome with --expose-gc)
  const globalGC = (globalThis as unknown as { gc?: () => void }).gc;
  if (typeof globalGC === "function") {
    globalGC();
  }

  // Clear any pending microtasks
  await Promise.resolve();

  // Wait a few frames for browser to settle
  await waitForNextFrame();
  await waitForNextFrame();
  await waitForNextFrame();

  // Additional delay to let any background browser tasks complete
  await delay(50);
}

// Debug mode - set to true to see timing breakdown
let debugMode = false;

/**
 * Enable or disable debug mode
 */
export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

/**
 * Measure execution time of a function including DOM paint.
 *
 * IMPORTANT: This measures from start of JS execution to after paint completes.
 * Uses double-RAF technique to ensure paint has completed.
 *
 * @param fn - The benchmark function to measure
 * @param label - Optional label for debug logging
 */
async function measure(
  fn: () => void | Promise<void>,
  label?: string,
): Promise<number> {
  const start = performance.now();

  // Execute the benchmark function
  await fn();
  const afterFn = performance.now();

  // Force synchronous layout calculation
  forceReflow();
  const afterReflow = performance.now();

  // Wait for actual paint to complete (double-RAF)
  await waitForPaint();
  const afterPaint = performance.now();

  if (debugMode && label) {
    console.log(`[${label}] Timing breakdown:`, {
      fn: (afterFn - start).toFixed(2),
      reflow: (afterReflow - afterFn).toFixed(2),
      paint: (afterPaint - afterReflow).toFixed(2),
      total: (afterPaint - start).toFixed(2),
    });
  }

  return afterPaint - start;
}

/**
 * Calculate statistics from an array of numbers
 */
function calculateStats(times: number[]): {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
} {
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const variance =
    times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length;
  const stdDev = Math.sqrt(variance);
  return { mean, min, max, stdDev };
}

/**
 * Run a single benchmark scenario
 */
async function runScenario(
  suite: BenchmarkSuite,
  benchmark: (typeof BENCHMARKS)[number],
  container: HTMLElement,
  config: BenchmarkConfig,
): Promise<RunResult> {
  const times: number[] = [];
  let correctness: { valid: boolean; errors: string[] } | undefined;

  // Run warmup + measurement
  const totalRuns = config.warmupRuns + config.measurementRuns;

  for (let i = 0; i < totalRuns; i++) {
    // Reset state (each suite resets its own ID counter in cleanup())
    suite.cleanup();
    suite.init(container);

    // Setup (not measured)
    if (benchmark.setup === "create1000") {
      suite.create1000();
      forceReflow();
      // Wait for setup to complete
      await waitForPaint();
    }

    await waitForNextFrame();

    // Capture pre-benchmark state for verification (only on first measurement run)
    let preState: PreBenchmarkState | undefined;
    if (config.verifyCorrectness && i === config.warmupRuns) {
      preState = capturePreState(
        container,
        benchmark.id,
        "arg" in benchmark ? benchmark.arg : undefined,
      );
    }

    // Measure the benchmark
    const time = await measure(async () => {
      switch (benchmark.id) {
        case "create1000":
          await suite.create1000();
          break;
        case "create10000":
          await suite.create10000();
          break;
        case "append1000":
          await suite.append1000();
          break;
        case "updateEvery10th":
          await suite.updateEvery10th();
          break;
        case "selectRow":
          await suite.selectRow(benchmark.arg ?? 5);
          break;
        case "swapRows":
          await suite.swapRows();
          break;
        case "removeRow":
          await suite.removeRow(benchmark.arg ?? 5);
          break;
        case "clear":
          await suite.clear();
          break;
      }
    }, `${suite.name}:${benchmark.id}`);

    // Only record after warmup
    if (i >= config.warmupRuns) {
      times.push(time);

      // Verify correctness on the first measurement run
      if (config.verifyCorrectness && i === config.warmupRuns && preState) {
        correctness = verifyBenchmarkResult(
          container,
          benchmark.id,
          preState,
          "arg" in benchmark ? benchmark.arg : undefined,
        );
      }
    }

    await waitForNextFrame();
  }

  const stats = calculateStats(times);
  const result: RunResult = {
    benchmark: benchmark.name,
    times,
    ...stats,
  };
  if (correctness !== undefined) {
    result.correctness = correctness;
  }
  return result;
}

/**
 * Run all benchmarks for a framework
 */
export async function runFrameworkBenchmarks(
  suite: BenchmarkSuite,
  container: HTMLElement,
  config: Partial<BenchmarkConfig> = {},
  onProgress?: (current: number, total: number, name: string) => void,
): Promise<FrameworkResults> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const results: RunResult[] = [];

  // Attempt GC and settle before starting this framework's benchmarks
  // This helps isolate results from previous framework runs
  await attemptGCAndSettle();

  for (let i = 0; i < BENCHMARKS.length; i++) {
    const benchmark = BENCHMARKS[i]!;
    onProgress?.(i + 1, BENCHMARKS.length, benchmark.name);

    const result = await runScenario(suite, benchmark, container, fullConfig);
    results.push(result);
  }

  // Final cleanup
  suite.cleanup();

  return {
    framework: suite.name,
    results,
  };
}

/**
 * Format results as a table (for console/display)
 */
export function formatResults(frameworkResults: FrameworkResults[]): string {
  if (frameworkResults.length === 0) return "No results";

  const benchmarkNames = frameworkResults[0]!.results.map((r) => r.benchmark);
  const lines: string[] = [];

  // Header
  const header = ["Benchmark", ...frameworkResults.map((f) => f.framework)];
  lines.push(header.join("\t"));
  lines.push("-".repeat(80));

  // Data rows
  for (const benchmarkName of benchmarkNames) {
    const row = [benchmarkName];
    for (const framework of frameworkResults) {
      const result = framework.results.find(
        (r) => r.benchmark === benchmarkName,
      );
      if (result) {
        row.push(`${result.mean.toFixed(2)}ms`);
      } else {
        row.push("N/A");
      }
    }
    lines.push(row.join("\t"));
  }

  return lines.join("\n");
}

/**
 * Get available benchmark IDs
 */
export function getBenchmarkIds(): string[] {
  return BENCHMARKS.map((b) => b.id);
}

/**
 * Get benchmark info
 */
export function getBenchmarks(): typeof BENCHMARKS {
  return BENCHMARKS;
}

// ============================================================================
// Advanced Benchmarks - More realistic scenarios
// ============================================================================

// Advanced benchmark scenarios
const ADVANCED_BENCHMARKS = [
  { id: "createNested1000", name: "Create 1,000 nested rows", setup: "clear" },
  {
    id: "updateNestedProperty",
    name: "Update nested property (every 10th)",
    setup: "createNested1000",
  },
  {
    id: "updateNestedArray",
    name: "Update nested array (every 10th)",
    setup: "createNested1000",
  },
  {
    id: "updateSingleRow",
    name: "Update single row label",
    setup: "createNested1000",
    arg: 500,
  },
  {
    id: "toggleSelection",
    name: "Toggle selection",
    setup: "createNested1000",
    arg: 500,
  },
  {
    id: "filterRowsHigh",
    name: "Filter rows (high priority)",
    setup: "createNested1000",
  },
  {
    id: "filterRowsAll",
    name: "Filter rows (show all)",
    setup: "filterRowsHigh",
  },
  { id: "batchUpdate", name: "Batch update", setup: "createNested1000" },
  { id: "clear", name: "Clear nested rows", setup: "createNested1000" },
] as const;

/**
 * Run a single advanced benchmark scenario
 */
async function runAdvancedScenario(
  suite: AdvancedBenchmarkSuite,
  benchmark: (typeof ADVANCED_BENCHMARKS)[number],
  container: HTMLElement,
  config: BenchmarkConfig,
): Promise<RunResult> {
  const times: number[] = [];

  // Run warmup + measurement
  const totalRuns = config.warmupRuns + config.measurementRuns;

  for (let i = 0; i < totalRuns; i++) {
    // Reset state (each suite resets its own ID counter in cleanup())
    suite.cleanup();
    suite.init(container);

    // Setup (not measured)
    if (
      benchmark.setup === "createNested1000" ||
      benchmark.setup === "filterRowsHigh"
    ) {
      await suite.createNested1000();
      forceReflow();
    }
    if (benchmark.setup === "filterRowsHigh") {
      // For filterRowsAll, first filter to high
      await suite.filterRows("high");
      forceReflow();
    }

    await waitForNextFrame();

    // Measure the benchmark
    const time = await measure(async () => {
      switch (benchmark.id) {
        case "createNested1000":
          await suite.createNested1000();
          break;
        case "updateNestedProperty":
          await suite.updateNestedProperty();
          break;
        case "updateNestedArray":
          await suite.updateNestedArray();
          break;
        case "updateSingleRow":
          await suite.updateSingleRow(benchmark.arg ?? 500);
          break;
        case "toggleSelection":
          await suite.toggleSelection(benchmark.arg ?? 500);
          break;
        case "filterRowsHigh":
          await suite.filterRows("high");
          break;
        case "filterRowsAll":
          await suite.filterRows("all");
          break;
        case "batchUpdate":
          await suite.batchUpdate();
          break;
        case "clear":
          await suite.clear();
          break;
      }
    }, `${suite.name}:${benchmark.id}`);

    // Only record after warmup
    if (i >= config.warmupRuns) {
      times.push(time);
    }

    await waitForNextFrame();
  }

  const stats = calculateStats(times);
  return {
    benchmark: benchmark.name,
    times,
    ...stats,
  };
}

/**
 * Run all advanced benchmarks for a framework
 */
export async function runAdvancedBenchmarks(
  suite: AdvancedBenchmarkSuite,
  container: HTMLElement,
  config: Partial<BenchmarkConfig> = {},
  onProgress?: (current: number, total: number, name: string) => void,
): Promise<FrameworkResults> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const results: RunResult[] = [];

  // Attempt GC and settle before starting this framework's benchmarks
  // This helps isolate results from previous framework runs
  await attemptGCAndSettle();

  for (let i = 0; i < ADVANCED_BENCHMARKS.length; i++) {
    const benchmark = ADVANCED_BENCHMARKS[i]!;
    onProgress?.(i + 1, ADVANCED_BENCHMARKS.length, benchmark.name);

    const result = await runAdvancedScenario(
      suite,
      benchmark,
      container,
      fullConfig,
    );
    results.push(result);
  }

  // Final cleanup
  suite.cleanup();

  return {
    framework: suite.name,
    results,
  };
}

/**
 * Get advanced benchmark IDs
 */
export function getAdvancedBenchmarkIds(): string[] {
  return ADVANCED_BENCHMARKS.map((b) => b.id);
}

/**
 * Get advanced benchmark info
 */
export function getAdvancedBenchmarks(): typeof ADVANCED_BENCHMARKS {
  return ADVANCED_BENCHMARKS;
}
