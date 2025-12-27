import { defineConfig } from "rolldown";

export default defineConfig([
  // ESM output (preserves module structure)
  {
    input: "src/index.ts",
    output: {
      dir: "dist/esm",
      format: "esm",
      sourcemap: true,
    },
  },
  // ESM bundle (single file)
  {
    input: "src/index.ts",
    output: {
      file: "dist/balises.esm.js",
      format: "esm",
      sourcemap: true,
    },
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
  },
]);
