#!/usr/bin/env node

/**
 * Script to run benchmarks and update README.md with results
 * Usage: node update-readme.mjs
 */

import { spawn } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const README_PATH = join(__dirname, "..", "README.md");
const BENCHMARK_MARKER_START = "<!-- BENCHMARK_RESULTS_START -->";
const BENCHMARK_MARKER_END = "<!-- BENCHMARK_RESULTS_END -->";

/**
 * Run benchmark and capture output
 */
async function runBenchmark() {
  return new Promise((resolve, reject) => {
    console.log("🚀 Running benchmarks in isolated mode...\n");

    // Use 'yarn node' to work with Yarn PnP
    const child = spawn(
      "yarn",
      ["node", "index.mjs", "--isolated", "--quiet"],
      {
        cwd: __dirname,
        stdio: ["inherit", "pipe", "inherit"],
      },
    );

    let output = "";
    child.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(text); // Show progress
      output += text;
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Benchmark failed with code ${code}`));
      } else {
        resolve(output);
      }
    });

    child.on("error", reject);
  });
}

/**
 * Extract the final summary table from benchmark output
 */
function extractSummaryTable(output) {
  // Find the FINAL SUMMARY section - match the table that comes after it
  const lines = output.split("\n");
  let inSummary = false;
  let tableLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Start capturing when we see FINAL SUMMARY
    if (line.includes("📊 FINAL SUMMARY")) {
      inSummary = true;
      continue;
    }

    // If we're in the summary section and see a table border
    if (inSummary && line.startsWith("┌───────")) {
      // Capture the entire table
      for (let j = i; j < lines.length; j++) {
        tableLines.push(lines[j]);
        // Stop when we hit the closing border
        if (lines[j].startsWith("└───────")) {
          break;
        }
      }
      break;
    }
  }

  if (tableLines.length === 0) {
    throw new Error("Could not find summary table in benchmark output");
  }

  return tableLines.join("\n");
}

/**
 * Extract the rankings by scenario table
 */
function extractRankingsTable(output) {
  const lines = output.split("\n");
  let inRankings = false;
  let tableLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Start capturing when we see Rankings by Scenario
    if (line.includes("🏅 Rankings by Scenario")) {
      inRankings = true;
      continue;
    }

    // If we're in the rankings section and see a table border
    if (inRankings && line.startsWith("┌───────")) {
      // Capture the entire table
      for (let j = i; j < lines.length; j++) {
        tableLines.push(lines[j]);
        // Stop when we hit the closing border
        if (lines[j].startsWith("└───────")) {
          break;
        }
      }
      break;
    }
  }

  if (tableLines.length === 0) {
    throw new Error("Could not find rankings table in benchmark output");
  }

  return tableLines.join("\n");
}

/**
 * Update README with benchmark results
 */
function updateReadme(summaryTable, rankingsTable) {
  let readme = readFileSync(README_PATH, "utf-8");

  // Check if benchmark section exists
  const hasMarkers =
    readme.includes(BENCHMARK_MARKER_START) &&
    readme.includes(BENCHMARK_MARKER_END);

  const benchmarkSection = `${BENCHMARK_MARKER_START}

## Benchmarks

Performance comparison of Balises against other popular reactive libraries. Benchmarks run in isolated processes to prevent V8 JIT contamination.

**Test Environment:**

- Node.js with V8 engine
- Each test runs in a separate process (isolated mode)
- **10 warmup runs** to stabilize JIT
- **100 iterations per test**, keeping middle 20 (discarding 40 best + 40 worst to reduce outliers)
- Tests measure pure reactive propagation (not DOM rendering)

**Scoring Methodology:**

- Overall ranking uses a combined score (50% average rank + 50% normalized average time)
- This ensures both consistency across scenarios (rank) and absolute performance (time) are valued equally
- "vs Fastest" compares average time to the fastest library

### Overall Performance

\`\`\`
${summaryTable}
\`\`\`

### Performance by Scenario

\`\`\`
${rankingsTable}
\`\`\`

**Scenarios:**

- **S1: Layers** - Deep dependency chains (A→B→C→D...)
- **S2: Wide** - Many independent signals updating in parallel
- **S3: Diamond** - Multiple paths to same computed (diamond dependencies)
- **S4: Conditional** - Dynamic subscriptions (like v-if logic)
- **S5: List** - List operations with filtering (like v-for patterns)
- **S6: Batch** - Batched/transactional updates

**Interpretation:**

- Balises performs well across all scenarios, particularly excelling at diamond dependencies, list operations, and batching
- These are synthetic benchmarks measuring pure reactivity - real apps should consider the whole picture (ecosystem, docs, community, etc.)
- Lower rank = better performance

_Last updated: ${new Date().toISOString().split("T")[0]}_

${BENCHMARK_MARKER_END}`;

  if (hasMarkers) {
    // Replace existing section
    const regex = new RegExp(
      `${BENCHMARK_MARKER_START}[\\s\\S]*?${BENCHMARK_MARKER_END}`,
      "g",
    );
    readme = readme.replace(regex, benchmarkSection);
  } else {
    // Insert before "## Scripts" section (or at the end if not found)
    const scriptsIndex = readme.indexOf("## Scripts");
    if (scriptsIndex !== -1) {
      readme =
        readme.slice(0, scriptsIndex) +
        benchmarkSection +
        "\n\n" +
        readme.slice(scriptsIndex);
    } else {
      // Append at end
      readme += "\n\n" + benchmarkSection + "\n";
    }
  }

  writeFileSync(README_PATH, readme, "utf-8");
  console.log("\n✅ README.md updated with benchmark results!");
}

/**
 * Main execution
 */
async function main() {
  try {
    const output = await runBenchmark();
    const summaryTable = extractSummaryTable(output);
    const rankingsTable = extractRankingsTable(output);
    updateReadme(summaryTable, rankingsTable);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
