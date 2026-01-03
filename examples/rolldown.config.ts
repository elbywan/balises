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
  })),
]);
