import { defineConfig } from "rolldown";
import { babel } from "@rollup/plugin-babel";
import { readdirSync } from "fs";
import { join } from "path";
import { compile as compileSvelte, compileModule } from "svelte/compiler";

// Get all framework implementation files
const frameworksDir = join(import.meta.dirname, "src/frameworks");
const frameworkFiles = readdirSync(frameworksDir).filter(
  (f) =>
    f.endsWith(".ts") ||
    f.endsWith(".tsx") ||
    f.endsWith(".jsx") ||
    f.endsWith(".svelte") ||
    f.endsWith(".svelte.js"),
);

const entries = {};
for (const file of frameworkFiles) {
  if (file.endsWith(".svelte") || file.endsWith(".svelte.js")) {
    // Svelte components/state modules are bundled through their importers
    continue;
  }
  const name = file.replace(/\.(tsx?|jsx)$/, "");
  entries[name] = join(frameworksDir, file);
}
entries["runner"] = join(import.meta.dirname, "src/runner.ts");

/** Compile .svelte components and .svelte.js runes modules (Svelte 5). */
function sveltePlugin() {
  return {
    name: "bench-svelte",
    transform(code: string, id: string) {
      if (!id.endsWith(".svelte") && !id.endsWith(".svelte.js")) return null;
      const options = {
        generate: "client" as const,
        runes: true,
        filename: id,
      };
      const result = id.endsWith(".svelte.js")
        ? compileModule(code, options)
        : compileSvelte(code, options);
      return { code: result.js.code, map: result.js.map };
    },
  };
}

export default defineConfig({
  input: entries,
  output: {
    dir: "dist",
    format: "esm",
    entryFileNames: "[name].js",
    minify: false, // Preserve export names for dynamic imports
  },
  // The benchmarks run in the browser with no `process` global — fold the
  // dev-mode guard to its production value.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: {
    alias: {
      balises: join(import.meta.dirname, "../dist/esm/index.js"),
      "balises/each": join(import.meta.dirname, "../dist/esm/each.js"),
    },
  },
  // Use Rolldown's native JSX support for React
  jsx: {
    mode: "automatic",
  },
  plugins: [
    sveltePlugin(),
    // Solid requires babel-preset-solid for its special JSX transform
    // (compiles to fine-grained reactive DOM, not createElement calls)
    babel({
      include: ["**/solid.tsx"],
      babelHelpers: "bundled",
      extensions: [".tsx"],
      presets: ["@babel/preset-typescript", "babel-preset-solid"],
    }),
    // Preact JSX (automatic runtime, preact/jsx-runtime)
    babel({
      include: ["**/preact.tsx"],
      babelHelpers: "bundled",
      extensions: [".tsx"],
      presets: [
        "@babel/preset-typescript",
        [
          "@babel/preset-react",
          { runtime: "automatic", importSource: "preact" },
        ],
      ],
    }),
  ],
});
