import kleur from "kleur";
import Table from "cli-table";

export function displayResults(report, tiers, scenarioName, verbose = false) {
  if (!verbose) return;

  console.log(
    kleur.bold(`\n📊 ${scenarioName} - Results (μs - lower is better)\n`),
  );

  const libNames = Object.keys(report);

  // Calculate min/max for each tier and overall average
  const minMaxByTier = tiers.map((_, i) => {
    let min = Infinity,
      max = -Infinity;
    for (const lib of libNames) {
      const stats = report[lib].times[i];
      if (stats && typeof stats === "object" && !stats.error) {
        const val = stats.mean * 1000;
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    return { min, max };
  });

  // Calculate averages for each library to determine ranking
  const libAverages = {};
  for (const lib of libNames) {
    let totalTime = 0;
    let validCount = 0;
    for (let i = 0; i < tiers.length; i++) {
      const stats = report[lib].times[i];
      if (stats && typeof stats === "object" && stats.mean) {
        totalTime += stats.mean * 1000;
        validCount++;
      }
    }
    libAverages[lib] = validCount > 0 ? totalTime / validCount : Infinity;
  }

  // Sort by average to get rankings
  const sortedLibs = [...libNames].sort(
    (a, b) => libAverages[a] - libAverages[b],
  );
  const rankings = {};
  sortedLibs.forEach((lib, index) => {
    rankings[lib] = index + 1;
  });

  const table = new Table({
    head: [
      kleur.bold("Rank"),
      "",
      ...tiers.map((n) => kleur.bold(kleur.cyan(n))),
      kleur.bold(kleur.yellow("avg")),
      kleur.bold(kleur.yellow("vs fastest")),
    ],
  });

  // Build table rows in ranked order
  for (const lib of sortedLibs) {
    const row = [];
    const rank = rankings[lib];
    const isFirst = rank === 1;
    const isLast = rank === sortedLibs.length;

    // Rank column with trophy for winner
    row.push(isFirst ? kleur.green(`#${rank} 🏆`) : `#${rank}`);

    // Library name
    row.push(kleur.magenta(lib));

    // Per-tier results with relative performance
    for (let i = 0; i < tiers.length; i++) {
      const stats = report[lib].times[i];
      const { min } = minMaxByTier[i];

      if (typeof stats === "string") {
        row.push(kleur.red(stats));
      } else if (stats && typeof stats === "object") {
        const meanUs = stats.mean * 1000;
        const stdDevUs = stats.stdDev * 1000;
        const relative = meanUs / min;

        let display = `${meanUs.toFixed(2)} ±${stdDevUs.toFixed(2)}`;

        // Color fastest green, slowest red
        if (meanUs === min) {
          display = kleur.green(display);
        } else if (meanUs === minMaxByTier[i].max) {
          display = kleur.red(display);
        }

        row.push(display);
      } else {
        row.push("N/A");
      }
    }

    // Average column
    const avgTime = libAverages[lib];
    const avgDisplay = avgTime < Infinity ? avgTime.toFixed(2) : "N/A";
    row.push(
      isFirst
        ? kleur.green(avgDisplay)
        : isLast
          ? kleur.red(avgDisplay)
          : avgDisplay,
    );

    // Relative to fastest column
    const fastestAvg = libAverages[sortedLibs[0]];
    if (avgTime < Infinity) {
      const overallRelative = avgTime / fastestAvg;
      const relDisplay = `${overallRelative.toFixed(2)}x`;
      row.push(
        overallRelative === 1
          ? kleur.green(relDisplay)
          : overallRelative < 2
            ? kleur.cyan(relDisplay)
            : overallRelative < 3
              ? kleur.yellow(relDisplay)
              : kleur.red(relDisplay),
      );
    } else {
      row.push("N/A");
    }

    table.push(row);
  }

  console.log(table.toString());
}

export function displayFinalSummary(allResults) {
  console.log(kleur.bold("\n" + "=".repeat(80)));
  console.log(
    kleur.bold("📊 FINAL SUMMARY - Average Performance Across All Scenarios"),
  );
  console.log(kleur.bold("=".repeat(80) + "\n"));

  // Collect all library names
  const allLibs = new Set();
  allResults.forEach(({ report }) => {
    Object.keys(report).forEach((lib) => allLibs.add(lib));
  });

  const libNames = Array.from(allLibs);

  // First, calculate rankings for each scenario
  const scenarioRankings = {};

  allResults.forEach(({ name, report, tiers }) => {
    // Calculate averages for this scenario
    const libAverages = {};
    const libNames = Object.keys(report);

    for (const lib of libNames) {
      let totalTime = 0;
      let validCount = 0;
      let hasFailure = false;

      for (let i = 0; i < tiers.length; i++) {
        const stats = report[lib].times[i];
        if (stats && typeof stats === "object" && stats.mean) {
          totalTime += stats.mean * 1000;
          validCount++;
        } else if (typeof stats === "string") {
          // This is an error/failure - mark library as failed for this scenario
          hasFailure = true;
        }
      }

      // If library failed any tier in this scenario, don't rank it
      if (hasFailure || validCount === 0) {
        libAverages[lib] = Infinity;
      } else {
        libAverages[lib] = totalTime / validCount;
      }
    }

    // Sort and rank libraries for this scenario (failed libraries get Infinity)
    const sorted = [...libNames].sort(
      (a, b) => libAverages[a] - libAverages[b],
    );
    const rankings = {};
    sorted.forEach((lib, idx) => {
      // Only assign rank if library didn't fail (has finite average)
      if (libAverages[lib] < Infinity) {
        rankings[lib] = idx + 1;
      }
      // Libraries with failures get no rank for this scenario
    });

    scenarioRankings[name] = rankings;
  });

  // Calculate average rank and average time for each library across all scenarios
  const scores = {};

  for (const lib of libNames) {
    let totalScore = 0;
    let totalRank = 0;
    let count = 0;

    allResults.forEach(({ name, report }) => {
      if (!report[lib]) return;

      // Add to rank total
      if (scenarioRankings[name] && scenarioRankings[name][lib]) {
        totalRank += scenarioRankings[name][lib];
      }

      // Calculate average time for this scenario
      const times = report[lib].times.filter(
        (t) => t && typeof t === "object" && t.mean,
      );
      if (times.length > 0) {
        const avg =
          times.reduce((sum, t) => sum + t.mean * 1000, 0) / times.length;
        totalScore += avg;
        count++;
      }
    });

    scores[lib] = {
      avgTime: count > 0 ? totalScore / count : 0,
      avgRank: count > 0 ? totalRank / count : Infinity,
    };
  }

  // Normalize scores to 0-1 range for fair comparison
  const avgTimes = libNames
    .map((lib) => scores[lib].avgTime)
    .filter((t) => t > 0);
  const avgRanks = libNames
    .map((lib) => scores[lib].avgRank)
    .filter((r) => r < Infinity);

  const minTime = Math.min(...avgTimes);
  const maxTime = Math.max(...avgTimes);
  const minRank = Math.min(...avgRanks);
  const maxRank = Math.max(...avgRanks);

  // Calculate combined score (25% rank, 75% normalized time)
  for (const lib of libNames) {
    const normalizedRank =
      (scores[lib].avgRank - minRank) / (maxRank - minRank);
    const normalizedTime =
      (scores[lib].avgTime - minTime) / (maxTime - minTime);

    // Combined score: 25% rank weight, 75% time weight (lower is better)
    scores[lib].combinedScore = normalizedRank * 0.25 + normalizedTime * 0.75;
  }

  // Sort by combined score (lower is better)
  const sortedLibs = libNames.sort(
    (a, b) => scores[a].combinedScore - scores[b].combinedScore,
  );

  // Create summary table with combined score as primary metric
  const fastestAvg = scores[sortedLibs[0]].avgTime;
  const table = new Table({
    head: [
      kleur.bold("Rank"),
      kleur.bold("Library"),
      kleur.bold("Score"),
      kleur.bold("Avg Time (μs)"),
      kleur.bold("vs Fastest"),
    ],
  });

  sortedLibs.forEach((lib, index) => {
    const score = scores[lib];
    const isFirst = index === 0;
    const isLast = index === sortedLibs.length - 1;

    // Display combined score (0-1 scale, lower is better)
    const scoreDisplay =
      score.combinedScore !== undefined
        ? score.combinedScore.toFixed(3)
        : "N/A";
    const avgTimeDisplay = score.avgTime > 0 ? score.avgTime.toFixed(2) : "N/A";
    const relative = score.avgTime / fastestAvg;
    const relDisplay =
      relative === 1
        ? `${relative.toFixed(2)}x (baseline)`
        : `${relative.toFixed(2)}x`;

    table.push([
      isFirst ? kleur.green(`#${index + 1} 🏆`) : `#${index + 1}`,
      kleur.magenta(lib),
      isFirst
        ? kleur.green(scoreDisplay)
        : isLast
          ? kleur.red(scoreDisplay)
          : scoreDisplay,
      avgTimeDisplay,
      relative === 1
        ? kleur.green(relDisplay)
        : relative < 1.5
          ? kleur.cyan(relDisplay)
          : relative < 3
            ? kleur.yellow(relDisplay)
            : kleur.red(relDisplay),
    ]);
  });

  console.log(table.toString());

  // Show rankings per scenario
  console.log(kleur.bold("\n🏅 Rankings by Scenario\n"));

  // Create table with libraries as rows and scenarios as columns
  const scenarioNames = allResults.map((r) => {
    // Shorten scenario names for table header
    return r.name
      .replace("Scenario ", "S")
      .replace("Deep Layers (Dependency Chain)", "1: Layers")
      .replace("Wide Graph (Independent Signals)", "2: Wide")
      .replace("Diamond Dependencies (Multiple Paths)", "3: Diamond")
      .replace("Conditional Updates (like v-if)", "4: Conditional")
      .replace("List Updates (like v-for)", "5: List")
      .replace("Batching / Transactions", "6: Batch")
      .replace("Dynamic Dependencies", "7: Dynamic");
  });

  const rankTable = new Table({
    head: [
      kleur.bold("Library"),
      ...scenarioNames.map((n) => kleur.bold(kleur.cyan(n))),
      kleur.bold(kleur.yellow("Avg Rank")),
    ],
  });

  sortedLibs.forEach((lib) => {
    const row = [kleur.magenta(lib)];
    let totalRank = 0;
    let count = 0;

    allResults.forEach(({ name, report, tiers }) => {
      if (scenarioRankings[name] && scenarioRankings[name][lib]) {
        const rank = scenarioRankings[name][lib];
        totalRank += rank;
        count++;

        // Color code: #1 green, #2-3 cyan, rest default
        const rankDisplay = `#${rank}`;
        if (rank === 1) {
          row.push(kleur.green(rankDisplay + " 🏆"));
        } else if (rank <= 3) {
          row.push(kleur.cyan(rankDisplay));
        } else {
          row.push(rankDisplay);
        }
      } else {
        // Check if library has any failures in this scenario
        const libReport = report[lib];
        if (libReport) {
          const hasFailed = libReport.times.some((t) => typeof t === "string");
          if (hasFailed) {
            row.push(kleur.red("FAIL"));
          } else {
            row.push("N/A");
          }
        } else {
          row.push("N/A");
        }
      }
    });

    const avgRank = count > 0 ? (totalRank / count).toFixed(1) : "N/A";
    row.push(avgRank);
    rankTable.push(row);
  });

  console.log(rankTable.toString());
}
