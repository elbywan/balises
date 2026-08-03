# DOM Benchmarks

Browser-based DOM rendering benchmarks comparing balises against popular frameworks.

Based on the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) methodology.

## Quick Start

```bash
# Run automated benchmarks with Playwright + CDP tracing
yarn bench-dom:run      # Full: all 8 frameworks, 8 benchmarks, 10 runs each
yarn bench-dom:quick    # Quick: vanilla, balises, solid, preact, svelte - 4 benchmarks

# Evaluate the goal criteria (majority fastest, never last, <=1.3x floor)
yarn bench-dom:check    # Runs the full suite, then check-standings.ts (exit 0 = all pass)

# Manual browser testing
yarn bench-dom          # Build and serve at http://localhost:3000
```

Results are written to `bench-dom/results.json` (script-time means) by the runner.

## Current Standings (2026-08, script ms, 10-run averages, vs the 5 goal frameworks)

| Scenario        | fastest         | balises | ratio |
| --------------- | --------------- | ------- | ----- |
| create1000      | solid 16.6      | 26.3    | 1.58x |
| create10000     | solid 159.6     | 237.9   | 1.49x |
| append1000      | solid 23.6      | 31.3    | 1.33x |
| updateEvery10th | solid 4.3       | 4.8     | 1.11x |
| selectRow       | preact 2.5      | 2.6     | 1.01x |
| swapRows        | **balises 6.7** | 6.7     | 1.00x |
| removeRow       | solid 9.7       | 10.0    | 1.02x |
| clear           | preact 1.8      | 12.3    | 6.83x |

(Run-to-run variance is ~±1.5ms on the 25-250ms measurements; ratios are
representative, not exact.)

### Why the creation and clear scenarios are hard for balises (measured)

- **Creation (create1000/10000, append)**: solid compiles templates to direct DOM
  code; balises instantiates tagged templates at runtime (clone + bind ~9us/row
  warm) plus ~25-30 allocated objects per row (2 computeds, signals, closures,
  slots). A warm CPU profile shows JS self-time is only ~5ms of a 25ms
  create1000 - the rest is native DOM work, allocation and GC.
- **clear**: tearing down 1000 rows costs ~4.4us/row of reactive disposal (2
  computeds + 2 listeners + binding closures each) plus DOM removal and GC.
  Coarse frameworks (preact/vue/svelte) do no per-row reactive teardown and
  finish in ~2ms. Note: solid - the overall winner - is itself 3.1x over the
  1.3x floor on clear (5.6ms vs preact 1.8ms), which suggests the 1.3x rule
  discriminates against fine-grained reactivity by construction.

### Optimizations applied (all 526 tests green)

- template: single-slot fast path for attribute bindings
- template: `nodeValue` instead of `textContent` in the reactive text path
- each: append fast path (old list is a prefix of the new one)
- each: batched DocumentFragment inserts for initial render and append
- each: bulk clear via replaceChildren fast path; remove-before-dispose

## Included Frameworks

| Framework    | Version | Implementation Notes                                                     |
| ------------ | ------- | ------------------------------------------------------------------------ |
| **vanilla**  | -       | Hand-optimized baseline: template cloning, `nodeValue`, event delegation |
| **balises**  | 0.9     | `each()` for keyed lists, `signal.is()` for O(1) selection               |
| **solid**    | 1.9+    | `createSelector` for O(1) selection, per-row signals for labels          |
| **vue**      | 3.5+    | `shallowRef` + `triggerRef`, in-place mutations                          |
| **lit-html** | 3.2+    | `repeat()` directive, event delegation                                   |
| **react**    | 19+     | `memo` with custom comparator, `useReducer`, `flushSync`                 |
| **preact**   | 10.29+  | hooks + `memo` (from preact/compat), keyed rows                          |
| **svelte**   | 5.56+   | Svelte 5 runes (`$state` module), keyed `each` block                     |

## Benchmark Scenarios

| Benchmark           | Description                                          |
| ------------------- | ---------------------------------------------------- |
| **create1000**      | Create a table with 1,000 rows from scratch          |
| **create10000**     | Create a table with 10,000 rows from scratch         |
| **append1000**      | Append 1,000 rows to an existing table of 1,000 rows |
| **updateEvery10th** | Modify the label of every 10th row (100 updates)     |
| **selectRow**       | Highlight a single row (CSS class toggle)            |
| **swapRows**        | Swap two rows (positions 1 and 998)                  |
| **removeRow**       | Remove a single row                                  |
| **clear**           | Remove all rows at once                              |

## Measurement Methodology

The Playwright runner (`yarn bench-dom:run`) uses Chrome DevTools Protocol (CDP) tracing for accurate measurements:

1. **Click Event Start** - Benchmark triggered via button click (captured as `EventDispatch` trace event)
2. **Script Time** - Sum of all JS execution time between click and commit (merged intervals to avoid double-counting nested events)
3. **Commit Time** - First `Commit` event after all meaningful work completes
4. **Total Time** - `(commit.end - click.start)` in milliseconds

This methodology matches the official js-framework-benchmark approach:

- True isolation: each framework runs in a fresh browser context
- Forced GC between benchmark runs
- Warmup runs for JIT optimization
- Multiple measurement runs for statistical accuracy

### Output Format

Results show `total/script` times:

```
Benchmark            vanilla          balises           solid
create1000         12.5/11.8        14.2/13.5        13.1/12.4
```

- **total**: Click → Commit (includes frame scheduling overhead)
- **script**: Pure JS execution time (what the framework actually spent)

## Architecture

```
bench-dom/
├── benchmark.html          # Playwright runner target page
├── index.html              # Interactive browser UI
├── src/
│   ├── types.ts            # Shared types and data generators
│   ├── runner.ts           # In-browser benchmark runner
│   ├── playwright-runner.ts # Automated CDP tracing runner
│   └── frameworks/         # Framework implementations
│       ├── vanilla.ts      # Baseline (template cloning, nodeValue)
│       ├── balises.ts      # Balises with each()
│       ├── solid.tsx       # SolidJS with createSelector
│       ├── vue.tsx         # Vue 3 Composition API + JSX
│       ├── lit.ts          # lit-html with repeat()
│       ├── react.tsx       # React 19 with memo + useReducer
│       ├── vanilla-advanced.ts  # Advanced benchmark suite
│       └── balises-advanced.ts  # Advanced benchmark suite
└── dist/                   # Built output (generated)
```

## Implementation Optimizations

Each framework is optimized following official js-framework-benchmark patterns:

### Vanilla JS

- Template cloning (`cloneNode`) instead of `createElement`
- `nodeValue` for text updates (faster than `textContent`)
- Detach tbody during bulk operations (prevents layout thrashing)
- Event delegation on tbody
- Parallel `rows[]` array for O(1) DOM element access

### Balises

- `signal.is(id)` for O(1) selection (only 2 rows recompute on selection change)
- `peek()` to capture static row ID without reactive dependency
- `each()` for efficient keyed list rendering

### SolidJS

- `createSelector(selected)` for O(1) selection updates
- Per-row signals: `{ id, label: Accessor, setLabel: Setter }`
- `batch()` for grouped updates
- `toSpliced()` for immutable array operations

### Vue

- `shallowRef` for the rows array (more predictable reactivity)
- `triggerRef()` for in-place array mutations
- Direct label mutation: `rows[i].label += " !!!"`
- Note: JSX cannot use `v-memo` (template-only feature)

### lit-html

- `repeat()` directive for keyed rendering
- Event delegation with `data-interaction` attribute
- In-place mutations for updates

### React

- `memo()` with custom comparator: `(prev, next) => prev.selected === next.selected && prev.item === next.item`
- `useReducer` pattern (matches official benchmark)
- `flushSync` for synchronous updates

## Adding a New Framework

1. Create `src/frameworks/your-framework.ts`:

```typescript
import type { BenchmarkSuite } from "../types.js";

// Row type
interface Row {
  id: number;
  label: string;
}

// Data generation (copy from existing implementation)
const adjectives = [/* ... */];
const colors = [/* ... */];
const nouns = [/* ... */];
let nextId = 1;

function buildData(count: number): Row[] {
  // ... generate rows
}

export const yourFrameworkSuite: BenchmarkSuite = {
  name: "your-framework",

  init(container: HTMLElement): void {
    // Mount to container
  },

  cleanup(): void {
    nextId = 1; // Reset ID counter for consistent benchmarks
    // Unmount and cleanup
  },

  create1000(): void {
    /* ... */
  },
  create10000(): void {
    /* ... */
  },
  append1000(): void {
    /* ... */
  },
  updateEvery10th(): void {
    /* ... */
  },
  selectRow(index: number): void {
    /* ... */
  },
  swapRows(): void {
    /* ... */
  },
  removeRow(index: number): void {
    /* ... */
  },
  clear(): void {
    /* ... */
  },
};

export default yourFrameworkSuite;
```

2. Add dependencies to `package.json`

3. Update `rolldown.config.ts` if special transforms needed (e.g., Solid's JSX)

4. Add to `index.html` and `benchmark.html`

5. Add to `playwright-runner.ts` framework lists

## Notes

- **Vanilla JS** represents the theoretical best-case performance (no framework overhead)
- Each framework uses its own `buildData()` function with local `nextId` for consistency
- All implementations reset `nextId = 1` in cleanup for reproducible benchmarks
- Vue JSX cannot use `v-memo` (template-only feature) - this is a known limitation
- The geometric mean score gives equal weight to each benchmark regardless of absolute time

## Prospective: compiled-template ceiling (experiment)

`balises-compiled.ts` measures what a compiled-template architecture could
achieve: rows built with direct DOM construction (what a compiler would emit
instead of cloneNode + binding setup) while reactivity uses the real balises
primitives (signals, direct subscriptions, `is()` slots).

Measured (full run, script ms): create1000 14.6 (wins, solid 17.6),
create10000 185.1 (1.16x solid), append1000 20.3 (wins, solid 22.8),
updateEvery10th 4.4 (parity), selectRow 0.7 (wins), swapRows 10.0 (loses to
the current each-based 7.0), removeRow 10.9 (solid 9.8), clear 6.8 (vs 11.3
current; still 3.8x vue's 1.8). Geomean 1.05x - essentially tied with the
leader.

Conclusion: compilation makes balises genuinely competitive (creation-class
wins + parity on updates) but yields only 3-4 of 8 scenario wins - NOT a
majority - and clear stays 3.8x over the 1.3x floor (solid itself is 3.1x).
Even the full compiled rewrite cannot satisfy the goal's criteria; the 1.3x
clear rule is structurally unreachable for fine-grained reactivity.
