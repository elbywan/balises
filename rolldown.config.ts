import { defineConfig } from "rolldown";

// The `define` folds `process.env.NODE_ENV` to `"production"` in these
// production bundles; combined with the inline development-mode guards in
// template.ts, minifiers eliminate the HMR slot re-binding machinery as
// dead code. The raw `dist/esm` output keeps the runtime-safe guard so
// unbundled consumers and dev builds keep the machinery.
export default defineConfig([
  // ESM bundle (single file)
  {
    input: "src/index.ts",
    output: {
      file: "dist/balises.esm.js",
      format: "esm",
      sourcemap: true,
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  },
  // IIFE bundle (for script tags)
  {
    input: "src/index.ts",
    output: {
      file: "dist/balises.iife.js",
      format: "iife",
      name: "Balises",
      sourcemap: true,
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  },
  // IIFE bundle minified
  {
    input: "src/index.ts",
    output: {
      file: "dist/balises.iife.min.js",
      format: "iife",
      name: "Balises",
      sourcemap: true,
      minify: true,
    },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  },
]);
