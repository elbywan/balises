# Benchmark Structure

This directory contains a comprehensive benchmark suite for reactive libraries.

## Directory Structure

```
bench/
├── index.mjs              # Main entry point
├── lib/                   # Core benchmark infrastructure
│   ├── config.mjs        # Configuration constants
│   ├── display.mjs       # Display and reporting functions
│   ├── runner.mjs        # Benchmark runner logic
│   └── utils.mjs         # Utility functions (stats, versions, GC)
├── scenarios/            # Benchmark scenario implementations
│   ├── layers.mjs        # Deep dependency chains
│   ├── wide.mjs          # Independent parallel signals
│   ├── diamond.mjs       # Diamond-shaped dependencies
│   └── create-dispose.mjs # Creation and disposal performance
├── package.json
└── README.md
```

## Files

### Core Files

- **index.mjs** - Main entry point that orchestrates all benchmarks
- **lib/config.mjs** - Benchmark configuration (run counts, tiers, etc.)
- **lib/utils.mjs** - Utility functions for statistics, version detection, and garbage collection
- **lib/runner.mjs** - Core benchmark running logic with progress reporting
- **lib/display.mjs** - Result formatting and summary tables

### Scenario Files

Each scenario file exports a benchmarks object with implementations for each library:

- **scenarios/layers.mjs** - Tests deep dependency chains (layers of computed values)
- **scenarios/wide.mjs** - Tests many independent signals updating in parallel
- **scenarios/diamond.mjs** - Tests diamond-shaped dependency graphs
- **scenarios/create-dispose.mjs** - Tests signal creation and disposal overhead

## Adding New Scenarios

To add a new benchmark scenario:

1. Create a new file in `scenarios/` (e.g., `scenarios/my-scenario.mjs`)
2. Export a benchmarks object with implementations for each library
3. Import it in `index.mjs`
4. Add the scenario to the `scenarios` object in `main()`
5. Update `lib/config.mjs` with tier configuration if needed
6. Add a script in `package.json` for running just that scenario

## Adding New Libraries

To benchmark a new reactive library:

1. Add it to `package.json` dependencies
2. Import it in each scenario file in `scenarios/`
3. Implement the benchmark for that library in each scenario
4. Add the library name to `allLibraries` array in `lib/runner.mjs`
5. Add version detection logic in `lib/runner.mjs` if needed
