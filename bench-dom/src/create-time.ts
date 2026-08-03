import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { extname, join } from "path";
import { chromium } from "playwright";
import { fileURLToPath } from "url";

const BENCH_DIR = fileURLToPath(new URL("..", import.meta.url));
const PORT = 3464;
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
  await page.goto(`http://localhost:${PORT}/benchmark.html?framework=balises`);
  await page.waitForFunction(
    () => (window as never as { benchReady?: boolean }).benchReady,
  );
  const runs: string[] = [];
  for (let i = 0; i < 4; i++) {
    const res = await page.evaluate(() => {
      const g = globalThis as never as {
        __eachTiming?: { render: number; insert: number };
        __tplTiming?: { clone: number; walk: number; bind: number };
        __bindTiming?: number[];
      };
      g.__eachTiming = { render: 0, insert: 0 };
      g.__tplTiming = { clone: 0, walk: 0, bind: 0 };
      g.__bindTiming = [0, 0, 0, 0];
      const t0 = performance.now();
      (
        window as never as { benchmarks: Record<string, () => void> }
      ).benchmarks.create1000();
      const t1 = performance.now();
      return {
        total: t1 - t0,
        e: g.__eachTiming!,
        t: g.__tplTiming!,
        b: g.__bindTiming!,
      };
    });
    runs.push(
      `run${i}: total=${res.total.toFixed(1)} render=${res.e.render.toFixed(1)} insert=${res.e.insert.toFixed(1)} clone=${res.t.clone.toFixed(1)} walk=${res.t.walk.toFixed(1)} bind=${res.t.bind.toFixed(1)} [c=${res.b[0]!.toFixed(1)} a=${res.b[1]!.toFixed(1)} e=${res.b[3]!.toFixed(1)}]`,
    );
  }
  console.log(runs.join("\n"));
  await browser.close();
  server.close();
  process.exit(0);
});
