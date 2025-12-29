# Benchmarks

Performance comparison of balises signals against other reactive libraries.

## Project Structure

The benchmark suite is organized into modular components for maintainability:

- `index.mjs` - Main entry point
- `lib/` - Core infrastructure (config, runner, display, utils)
- `scenarios/` - Individual benchmark scenarios (layers, wide, diamond, create-dispose)

See [STRUCTURE.md](./STRUCTURE.md) for detailed documentation on adding new scenarios or libraries.

## Running the benchmarks

### From project root

```bash
yarn bench              # Run all benchmark scenarios, all libraries
yarn bench:self         # Run all scenarios, balises only
yarn bench:layers       # Run only layers scenario
yarn bench:wide         # Run only wide graph scenario
yarn bench:diamond      # Run only diamond dependencies scenario
yarn bench:create       # Run only creation/disposal scenario
yarn bench:conditional  # Run only conditional updates scenario
yarn bench:list         # Run only list updates scenario
```

### From bench directory

```bash
cd bench
yarn install
yarn start              # Run all scenarios, all libraries
yarn start:self         # Run all scenarios, balises only
yarn start:layers       # Run only layers scenario
yarn start:wide         # Run only wide graph scenario
yarn start:diamond      # Run only diamond dependencies scenario
yarn start:create       # Run only creation/disposal scenario
yarn start:conditional  # Run only conditional updates scenario
yarn start:list         # Run only list updates scenario
```

### Options

- Add `--verbose` to see detailed per-tier results (e.g., `yarn bench --verbose`)
- Add `--quiet` to disable verbose output for single scenarios
- Add `--isolated` to run each framework in a separate process for fair comparison (e.g., `yarn bench --isolated`)
- By default, output is concise with a final summary table at the end

### Isolated Mode

The `--isolated` flag runs each framework in a separate child process. This provides:

- **Memory Isolation**: No shared heap between frameworks
- **JIT Reset**: Fresh V8 optimization for each framework
- **Fair Comparison**: Prevents cross-contamination from previous tests
- **Consistent Results**: Eliminates test ordering effects

**Example:**

```bash
yarn bench --scenario=batching --isolated
```

This mode is recommended for accurate performance comparisons, especially when testing a single scenario or when you notice results vary based on test execution order.

## Benchmark Scenarios

### 1. Deep Layers (Dependency Chain)

Tests propagation through deep dependency chains.

- Creates 4 base signals (a, b, c, d)
- Builds N layers of computed signals, each depending on the previous layer
- Measures how quickly updates propagate through the entire chain
- Tests: 10, 100, 500, 1000, 2000, 2500, 5000 layers

### 2. Wide Graph (Independent Signals)

Tests performance with many independent signals updating simultaneously.

- Creates N independent signals
- Each signal has one computed value dependent on it
- Measures parallel update performance
- Tests: 10, 50, 100, 500, 1000, 2500, 5000 signals

### 3. Diamond Dependencies (Multiple Paths)

Tests handling of multiple paths to the same computed value (avoids redundant computations).

- Creates a single source signal
- Splits into two branches (left and right)
- Each branch has N layers of computations
- Both branches merge into a final computed value
- Tests: 5, 10, 20, 50, 100 depth levels

### 4. Creation & Disposal

Tests signal creation overhead.

- Repeatedly creates signals and computed values
- Measures setup performance
- Tests disposal mechanisms where applicable
- Tests: 100, 500, 1000, 2500, 5000 iterations

### 5. Conditional Updates (like v-if)

Tests performance when computed values are conditionally activated/deactivated. Simulates real-world UI patterns like conditional rendering.

- Creates N source signals with conditional computed values
- Toggles condition flag to enable/disable computations
- Updates source values while toggling conditions
- Measures efficiency of handling dynamic dependency graphs
- Tests: 10, 50, 100, 500, 1000, 2500 signals

### 6. List Updates (like v-for)

Tests performance of array operations and aggregations. Simulates common patterns like todo lists, data tables, etc.

- Creates N items with reactive properties (value, completed status)
- Each item has computed values and aggregations (total, count)
- Updates multiple items and toggles completion states
- Measures typical list manipulation performance
- Tests: 10, 50, 100, 500, 1000, 2500 items

## Libraries Compared

- `@preact/signals-core` - Preact's signals implementation
- `@maverick-js/signals` - Maverick.js fine-grained reactivity
- `@vue/reactivity` - Vue 3's reactivity system
- `solid-js` - SolidJS reactive primitives
- `hyperactiv` - Hyperactiv reactive library
- `mobx` - MobX observable state management
- `balises` - This library

## Output

### Default (Quiet) Mode

By default, benchmarks run in quiet mode showing:

- Progress indicators for each library and scenario
- A final summary table with overall rankings across all scenarios
- Average performance metrics (construction + update time)
- Relative performance comparison

### Verbose Mode (`--verbose`)

When running with `--verbose`, you get additional detailed output:

- Per-tier results for each library
- Standard deviation for each measurement
- Detailed tables with per-scenario results
- Relative performance tables per scenario

## What's Measured

The benchmarks focus on **reactive update performance** - how quickly changes propagate through the reactive graph. Construction time is not measured as it's a one-time setup cost and doesn't reflect the actual reactive performance that matters in real applications.

## Statistics Reported

For each benchmark, the following metrics are calculated:

- **Mean** - Average execution time across runs (after discarding outliers)
- **Standard Deviation (±)** - Variability in execution time
- **Median** - Middle value when results are sorted
- **Min/Max** - Fastest and slowest runs (after outlier removal)
- **Relative Performance** - How much slower/faster compared to the fastest library
- **Overall Ranking** - Average performance across all scenarios (when running all)

## Configuration

### Test Parameters

- **Warmup runs**: 10 (not counted in results)
- **Runs per tier**: 100
- **Outlier removal**: Best and worst 10 runs discarded
- **Build mode**: All libraries tested in production mode

### Environment

- Node.js with V8 engine
- Garbage collection forced between library tests
- Results in microseconds (μs)
