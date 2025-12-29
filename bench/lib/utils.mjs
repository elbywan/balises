import v8 from "node:v8";
import vm from "vm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const sum = (array) => array.reduce((a, b) => a + b, 0);
export const avg = (array) => sum(array) / array.length || 0;
export const median = (array) => {
  const sorted = [...array].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
export const stdDev = (array) => {
  const mean = avg(array);
  const variance = avg(array.map((x) => (x - mean) ** 2));
  return Math.sqrt(variance);
};

export function getVersion(pkgName) {
  try {
    const pkgPath = require.resolve(`${pkgName}/package.json`);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version;
  } catch {
    try {
      const benchPkgPath = path.resolve(__dirname, "..", "package.json");
      const benchPkg = JSON.parse(fs.readFileSync(benchPkgPath, "utf-8"));
      const version = benchPkg.dependencies?.[pkgName];
      if (version) {
        return version.replace(/^[\^~]/, "");
      }
    } catch {
      // ignore
    }
    return "?";
  }
}

export function getBalisesVersion() {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version;
  } catch {
    return "?";
  }
}

export function calculateStats(runs, discardCount = 10) {
  const sorted = [...runs].sort((a, b) => a - b);
  const trimmed = sorted.slice(discardCount, -discardCount);
  return {
    mean: avg(trimmed),
    median: median(trimmed),
    stdDev: stdDev(trimmed),
    min: Math.min(...trimmed),
    max: Math.max(...trimmed),
  };
}
