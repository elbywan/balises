# Benchmarks

Performance comparison of balises signals against other reactive libraries.

## Running the benchmark

```bash
cd bench
yarn install
yarn start
```

## What it tests

The "layers" benchmark creates a deep chain of computed signals and measures how quickly updates propagate through the graph.

- Creates 4 base signals (a, b, c, d)
- Builds N layers of computed signals, each depending on the previous layer
- Measures the time to update all base signals and read the final computed values

## Libraries compared

- `@preact/signals-core` - Preact's signals implementation
- `@maverick-js/signals` - Maverick.js signals
- `s-js` - S.js reactive library
- `cellx` - Cellx reactive library
- `hyperactiv` - Hyperactiv reactive library
- `mobx` - MobX observable library
- `balises` - This library
