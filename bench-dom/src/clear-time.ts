import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { extname, join } from "path";
import { chromium } from "playwright";
import { fileURLToPath } from "url";

const BENCH_DIR = fileURLToPath(new URL("..", import.meta.url));
const PORT = 3459;
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
  page.on("console", (m) => console.log("[page]", m.text()));
  await page.goto(`http://localhost:${PORT}/benchmark.html?framework=balises`);
  await page.waitForFunction(
    () => (window as never as { benchReady?: boolean }).benchReady,
  );
  const b = () =>
    (window as never as { benchmarks: Record<string, () => void> }).benchmarks;
  await page.evaluate(() =>
    (
      window as never as { benchmarks: Record<string, () => void> }
    ).benchmarks.create10000(),
  );
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() =>
      (
        window as never as { benchmarks: Record<string, () => void> }
      ).benchmarks.clear(),
    );
    await page.evaluate(() =>
      (
        window as never as { benchmarks: Record<string, () => void> }
      ).benchmarks.create10000(),
    );
  }
  await browser.close();
  server.close();
  process.exit(0);
});
