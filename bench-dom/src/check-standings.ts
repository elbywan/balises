/**
 * Evaluate the goal's success criteria against the latest results.
 * Usage: node --import tsx/esm bench-dom/src/check-standings.ts [results.json]
 * Exits 0 only when all criteria hold.
 *
 * Criteria (vs the 5 goal frameworks: vue, react, solid, preact, svelte):
 *  1. balises fastest in a majority (>50%) of scenarios
 *  2. never ranked last in any scenario
 *  3. never more than 1.3x slower than the fastest entry
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const BENCH_DIR = fileURLToPath(new URL("..", import.meta.url));
const FILE = process.argv[2] ?? join(BENCH_DIR, "results.json");

const GOAL_FRAMEWORKS = ["vue", "react", "solid", "preact", "svelte"];

if (!existsSync(FILE)) {
  console.error(`No results file at ${FILE} - run the full benchmark first.`);
  process.exit(2);
}
const results: Record<string, Record<string, number>> = JSON.parse(
  readFileSync(FILE, "utf8"),
);
const benchmarks = Object.keys(Object.values(results)[0] ?? {});
const balises = results["balises"];
if (!balises) {
  console.error("No balises results in file.");
  process.exit(2);
}

const rows: string[] = [];
let wins = 0;
let lastPlaces = 0;
const floorViolations: string[] = [];
const fastestList: string[] = [];

for (const bench of benchmarks) {
  const entries = Object.entries(results)
    .filter(([fw]) => GOAL_FRAMEWORKS.includes(fw) || fw === "balises")
    .map(([fw, b]) => [fw, b[bench]] as const)
    .filter(([, t]) => t !== undefined);
  entries.sort((a, b) => a[1] - b[1]);
  const fastest = entries[0]!;
  const balisesTime = balises[bench]!;
  const rank = entries.findIndex(([fw]) => fw === "balises") + 1;
  const isFastest = entries[0]![0] === "balises";
  const isLast = rank === entries.length;
  const ratio = balisesTime / fastest[1];
  if (isFastest) wins++;
  if (isLast) lastPlaces++;
  if (ratio > 1.3) floorViolations.push(`${bench} (${ratio.toFixed(2)}x)`);
  fastestList.push(fastest[0]);
  rows.push(
    `${bench.padEnd(16)} balises=${balisesTime.toFixed(1).padStart(7)} rank=${rank}/${entries.length} fastest=${fastest[0]} (${fastest[1].toFixed(1)}ms) ratio=${ratio.toFixed(2)}x ${isFastest ? "WIN" : isLast ? "LAST" : ""}`,
  );
}

console.log(`Results file: ${FILE}`);
console.log(`Scenarios: ${benchmarks.length}`);
console.log(rows.join("\n"));
console.log(`\nFastest per scenario: ${fastestList.join(", ")}`);
console.log(
  `Wins (fastest): ${wins}/${benchmarks.length} (need > ${benchmarks.length / 2})`,
);
console.log(`Last places: ${lastPlaces}`);
console.log(
  `Floor violations (>1.3x): ${floorViolations.length ? floorViolations.join(", ") : "none"}`,
);

const okWins = wins > benchmarks.length / 2;
const okLast = lastPlaces === 0;
const okFloor = floorViolations.length === 0;
console.log(`\nCriterion 1 (majority fastest): ${okWins ? "PASS" : "FAIL"}`);
console.log(`Criterion 2 (never last): ${okLast ? "PASS" : "FAIL"}`);
console.log(`Criterion 3 (<=1.3x floor): ${okFloor ? "PASS" : "FAIL"}`);
process.exit(okWins && okLast && okFloor ? 0 : 1);
