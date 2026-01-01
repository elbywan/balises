import { defineConfig } from "rolldown";

const examples = ["counter", "timer", "pokemon", "todo-list", "performance"];

// Additional entries that don't follow the standard naming convention
const additionalEntries = [
  { input: "examples/pokemon/battle.ts", output: "examples/pokemon/battle.js" },
];

export default defineConfig([
  ...examples.map((name) => ({
    input: `examples/${name}/${name}.ts`,
    output: {
      file: `examples/${name}/${name}.js`,
      format: "esm" as const,
    },
  })),
  ...additionalEntries.map((entry) => ({
    input: entry.input,
    output: {
      file: entry.output,
      format: "esm" as const,
    },
  })),
]);
