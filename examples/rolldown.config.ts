import { defineConfig } from "rolldown";

const examples = [
  "counter",
  "timer",
  "pokemon",
  "todo-list",
  "performance",
  "async-data",
];

export default defineConfig([
  ...examples.map((name) => ({
    input: `examples/${name}/${name}.ts`,
    output: {
      file: `examples/${name}/${name}.js`,
      format: "esm" as const,
    },
    // The examples run in the browser with no `process` global — fold the
    // dev-mode guard to its production value.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  })),
]);
