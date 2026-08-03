/**
 * Warm-state CPU profile of a balises benchmark operation.
 * Usage: node --import tsx/esm bench-dom/src/profile.ts [create1000|clear|...]
 */
import { createServer } from "http";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { extname, join } from "path";
import { chromium } from "playwright";
import { fileURLToPath } from "url";

const BENCH_DIR = fileURLToPath(new URL("..", import.meta.url));
const PORT = 3465;
const benchmark = process.argv[2] || "create1000";

const server = createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0]!;
  const filePath = join(
    BENCH_DIR,
    urlPath === "/" ? "benchmark.html" : urlPath,
  );
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    "Content-Type":
      extname(filePath) === ".js" ? "text/javascript" : "text/html",
  });
  res.end(readFileSync(filePath));
});
server.listen(PORT, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`http://localhost:${PORT}/benchmark.html?framework=balises`);
  await page.waitForFunction(
    () => (window as never as { benchReady?: boolean }).benchReady,
  );
  const b = () =>
    (window as never as { benchmarks: Record<string, () => void> }).benchmarks;
  // Warmup
  for (let i = 0; i < 5; i++) {
    await page.evaluate(
      (bench) =>
        (
          window as never as { benchmarks: Record<string, () => void> }
        ).benchmarks[bench]?.(),
      benchmark,
    );
  }
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  await page.evaluate(
    (bench) =>
      (
        window as never as { benchmarks: Record<string, () => void> }
      ).benchmarks[bench]?.(),
    benchmark,
  );
  const profile = await cdp.send("Profiler.stop");
  writeFileSync(
    `src/profile-${benchmark}.cpuprofile`,
    JSON.stringify(profile.profile),
  );
  console.log(`saved src/profile-${benchmark}.cpuprofile`);
  await browser.close();
  server.close();
  process.exit(0);
});
