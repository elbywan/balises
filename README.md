<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/logo.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/logo-light.svg">
  <img alt="balises" src="./assets/logo.svg" width="280">
</picture>

### A minimal reactive HTML templating library. ~3.0KB gzipped.

**[📚️ Documentation & Examples](https://elbywan.github.io/balises/)**

## Note

This is a personal side project with limited maintenance. Most of the code was written with LLM assistance.

🚧 Use at your own discretion.

## Installation

```bash
npm install balises
```

## Quick Start

```ts
import { html, signal } from "balises";

const count = signal(0);

const { fragment, dispose } = html`
  <button @click=${() => count.update((n) => n + 1)}>
    Clicked ${count} times
  </button>
`.render();

document.body.appendChild(fragment);
// Call dispose() when done to clean up subscriptions
```

## Template Syntax

The `html` tagged template creates reactive DOM fragments.

### Interpolation Types

| Syntax            | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `${value}`        | Text content (strings, numbers, templates, arrays)    |
| `attr=${value}`   | Attribute (`null`/`false` removes, `true` sets empty) |
| `attr="a ${b} c"` | Multi-part attribute (string concatenation)           |
| `.prop=${value}`  | Property binding (sets element property directly)     |
| `@event=${fn}`    | Event listener                                        |

All interpolations accept reactive values (`Signal` or `Computed`) and will auto-update when they change.

### Nested Templates

Templates can be nested, and arrays of templates are flattened:

```ts
const items = signal(["a", "b", "c"]);

html`
  <ul>
    ${computed(() => items.value.map((item) => html`<li>${item}</li>`))}
  </ul>
`.render();
```

### Efficient List Rendering with `each()`

For lists that change frequently, use `each()` for keyed reconciliation. Templates are cached by key and reused:

```ts
import { html, signal, each } from "balises";

const items = signal([
  { id: 1, name: signal("Alice") },
  { id: 2, name: signal("Bob") },
]);

html`
  <ul>
    ${each(
      items,
      (item) => item.id,
      (item) => html`<li>${item.name}</li>`,
    )}
  </ul>
`.render();

// Append: only creates one new node
items.value = [...items.value, { id: 3, name: signal("Carol") }];

// Update content: surgical update, no list diffing
items.value[0].name.value = "Alicia";

// Reorder: moves existing nodes, no recreation
items.value = [...items.value].reverse();
```

The `each()` helper has two forms:

**With key function (recommended when objects may be recreated with same identity):**

```ts
each(list, keyFn, renderFn);
```

- `list` - A reactive array (Signal, Computed, or getter function)
- `keyFn` - Extracts a unique key from each item: `(item, index) => key`
- `renderFn` - Renders each item (called once per unique key)

**Without key function (automatic keying):**

```ts
each(list, renderFn);
```

- Objects use their reference as key (reordering works correctly)
- Primitives use index as key (duplicates are handled correctly)

For content updates without list reconciliation, use nested signals (like `name: signal("Alice")` above).

## Reactivity API

### `signal<T>(value)` / `new Signal<T>(value)`

Creates a reactive value container.

```ts
const name = signal("world");
console.log(name.value); // "world"
name.value = "everyone"; // Notifies subscribers
```

**Updating based on current value:**

```ts
const count = signal(0);

// Using update() for functional updates
count.update((n) => n + 1);
count.update((n) => n * 2);

// Equivalent to:
count.value = count.value + 1;
count.value = count.value * 2;
```

### `computed<T>(fn)` / `new Computed<T>(fn)`

Creates a derived value that auto-tracks dependencies.

```ts
const firstName = signal("John");
const lastName = signal("Doe");
const fullName = computed(() => `${firstName.value} ${lastName.value}`);

console.log(fullName.value); // "John Doe"
firstName.value = "Jane";
console.log(fullName.value); // "Jane Doe"
```

Computeds are lazy - they only recompute when accessed and when their dependencies have changed.

### `effect(fn)`

Creates a side effect that automatically re-runs when its dependencies change. Unlike `computed()`, effects run immediately and are intended for side effects like DOM updates, logging, or persistence.

```ts
import { signal, effect } from "balises";

const count = signal(0);

// Runs immediately, then whenever count changes
const dispose = effect(() => {
  console.log("Count is now:", count.value);
  document.title = `Count: ${count.value}`;
});

count.value = 1; // Logs "Count is now: 1" and updates title
dispose(); // Stop the effect
```

**Use cases:**

- Syncing state to localStorage
- Updating document.title or other DOM properties
- Logging and analytics
- Network requests triggered by state changes

Effects are automatically disposed when the component that created them is disposed (via the template's `dispose()` function).

**Example: Auto-sync to localStorage**

```ts
const favorites = signal([]);

effect(() => {
  localStorage.setItem("favorites", JSON.stringify(favorites.value));
});

// localStorage automatically updates whenever favorites changes
favorites.value = [...favorites.value, "new item"];
```

### `store<T>(obj)`

Proxy-based reactive wrapper. Nested plain objects are wrapped recursively.

```ts
const state = store({ count: 0, user: { name: "Alice" } });
state.count++; // Reactive
state.user.name = "Bob"; // Also reactive (nested)
```

**Note:** Array mutations like `push()`, `pop()`, `splice()` do **not** trigger reactivity. To update arrays reactively, reassign them:

```ts
const state = store({ items: [1, 2, 3] });

// ❌ Does NOT trigger reactivity
state.items.push(4);

// ✅ Triggers reactivity
state.items = [...state.items, 4];

// Alternative: Use signal for arrays if you want .update() method
const items = signal([1, 2, 3]);
items.update((arr) => [...arr, 4]);
items.update((arr) => arr.filter((n) => n !== 2));
```

### `batch<T>(fn)`

Batch multiple signal updates to defer subscriber notifications until the batch completes.

```ts
import { batch, signal } from "balises";

const a = signal(1);
const b = signal(2);

batch(() => {
  a.value = 10;
  b.value = 20;
}); // Subscribers notified once after both updates
```

### `scope(fn)`

Create a disposal scope that automatically collects all computeds and effects created within, allowing cleanup with a single `dispose()` call.

```ts
import { scope, signal, computed, effect } from "balises";

const [state, dispose] = scope(() => {
  const count = signal(0);
  const doubled = computed(() => count.value * 2);
  effect(() => console.log(doubled.value));
  return { count, doubled };
});

// Use state.count, state.doubled...

// Later: clean up everything at once
dispose();
```

Useful for components, temporary reactive contexts, or any scenario where you want automatic cleanup of multiple reactive primitives.

### `isSignal(value)`

Type guard to check if a value is reactive (`Signal` or `Computed`).

```ts
isSignal(signal(1)); // true
isSignal(computed(() => 1)); // true
isSignal(42); // false
```

### `.subscribe(fn)`

Subscribe to value changes on any reactive (`Signal` or `Computed`).

```ts
const count = signal(0);
const unsubscribe = count.subscribe(() => {
  console.log("count changed to", count.value);
});

count.value = 1; // logs "count changed to 1"
unsubscribe(); // Stop listening
```

### `.dispose()`

Dispose a computed, removing all dependency links.

```ts
const doubled = computed(() => count.value * 2);
doubled.dispose(); // Stops tracking, frees memory
```

## Tree-Shaking / Modular Imports

The library supports granular imports for optimal bundle size:

```ts
// Full library (~3.0KB gzipped)
import { html, signal, computed, effect } from "balises";

// Signals only
import { signal, computed, effect, store, batch, scope } from "balises/signals";

// Individual modules
import { signal } from "balises/signals/signal";
import { computed } from "balises/signals/computed";
import { effect } from "balises/signals/effect";
import { store } from "balises/signals/store";
import { batch, scope } from "balises/signals/context";
```

## Full Example

```ts
import { html, store, computed } from "balises";

class Counter extends HTMLElement {
  private dispose?: () => void;

  connectedCallback() {
    const state = store({ count: 0 });
    const double = computed(() => state.count * 2);

    const { fragment, dispose } = html`
      <div>
        <p>Count: ${computed(() => state.count)} (double: ${double})</p>
        <button @click=${() => state.count++}>+</button>
        <button @click=${() => state.count--}>-</button>
      </div>
    `.render();

    this.appendChild(fragment);
    this.dispose = dispose;
  }

  disconnectedCallback() {
    this.dispose?.();
  }
}

customElements.define("x-counter", Counter);
```

**With `signal.update()` for functional updates:**

```ts
import { html, signal, effect } from "balises";

class Counter extends HTMLElement {
  #count = signal(0);
  #dispose?: () => void;

  connectedCallback() {
    // Auto-sync to localStorage
    const syncEffect = effect(() => {
      localStorage.setItem("counter", String(this.#count.value));
    });

    const { fragment, dispose } = html`
      <div>
        <p>Count: ${this.#count}</p>
        <button @click=${() => this.#count.update((n) => n - 1)}>-</button>
        <button @click=${() => this.#count.update((n) => n + 1)}>+</button>
      </div>
    `.render();

    this.appendChild(fragment);
    this.#dispose = () => {
      syncEffect();
      dispose();
    };
  }

  disconnectedCallback() {
    this.#dispose?.();
  }
}
```

<!-- BENCHMARK_RESULTS_START -->

## Benchmarks

Performance comparison of Balises against other popular reactive libraries. Benchmarks run in isolated processes to prevent V8 JIT contamination.

**Test Environment:**

- Node.js with V8 engine
- Each test runs in a separate process (isolated mode)
- **10 warmup runs** to stabilize JIT
- **100 iterations per test**, keeping middle 20 (discarding 40 best + 40 worst to reduce outliers)
- Tests measure pure reactive propagation (not DOM rendering)

**Scoring Methodology:**

- Overall ranking uses a combined score (50% average rank + 50% normalized average time)
- This ensures both consistency across scenarios (rank) and absolute performance (time) are valued equally
- "vs Fastest" compares average time to the fastest library

### Overall Performance

```
┌───────┬───────────────────┬──────────┬───────────────┬──────────────────┐
│ Rank  │ Library           │ Avg Rank │ Avg Time (μs) │ vs Fastest       │
├───────┼───────────────────┼──────────┼───────────────┼──────────────────┤
│ #1 🏆 │ balises@0.2.1     │ 1.5      │ 69.76         │ 1.00x (baseline) │
├───────┼───────────────────┼──────────┼───────────────┼──────────────────┤
│ #2    │ preact@1.12.1     │ 1.7      │ 51.59         │ 0.74x            │
├───────┼───────────────────┼──────────┼───────────────┼──────────────────┤
│ #3    │ vue@3.5.26        │ 3.0      │ 72.79         │ 1.04x            │
├───────┼───────────────────┼──────────┼───────────────┼──────────────────┤
│ #4    │ maverick@6.0.0    │ 3.8      │ 91.40         │ 1.31x            │
├───────┼───────────────────┼──────────┼───────────────┼──────────────────┤
│ #5    │ solid@1.9.10      │ 5.3      │ 225.26        │ 3.23x            │
├───────┼───────────────────┼──────────┼───────────────┼──────────────────┤
│ #6    │ mobx@6.15.0       │ 5.8      │ 719.17        │ 10.31x           │
├───────┼───────────────────┼──────────┼───────────────┼──────────────────┤
│ #7    │ hyperactiv@0.11.3 │ 6.8      │ 833.03        │ 11.94x           │
└───────┴───────────────────┴──────────┴───────────────┴──────────────────┘
```

### Performance by Scenario

```
┌───────────────────┬───────────────┬─────────────┬────────────────┬────────────────────┬─────────────┬──────────────┬──────────┐
│ Library           │ S1: 1: Layers │ S2: 2: Wide │ S3: 3: Diamond │ S4: 4: Conditional │ S5: 5: List │ S6: 6: Batch │ Avg Rank │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ balises@0.2.1     │ #3            │ #1 🏆       │ #1 🏆          │ #2                 │ #1 🏆       │ #1 🏆        │ 1.5      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ preact@1.12.1     │ #1 🏆         │ #2          │ #2             │ #1 🏆              │ #2          │ #2           │ 1.7      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ vue@3.5.26        │ #2            │ #3          │ #3             │ #3                 │ #3          │ #4           │ 3.0      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ maverick@6.0.0    │ #4            │ #4          │ #4             │ #4                 │ #4          │ #3           │ 3.8      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ solid@1.9.10      │ #5            │ #6          │ #5             │ #5                 │ #6          │ #5           │ 5.3      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ mobx@6.15.0       │ #7            │ #5          │ #6             │ #6                 │ #5          │ #6           │ 5.8      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ hyperactiv@0.11.3 │ #6            │ #7          │ #7             │ #7                 │ #7          │ #7           │ 6.8      │
└───────────────────┴───────────────┴─────────────┴────────────────┴────────────────────┴─────────────┴──────────────┴──────────┘
```

**Scenarios:**

- **S1: Layers** - Deep dependency chains (A→B→C→D...)
- **S2: Wide** - Many independent signals updating in parallel
- **S3: Diamond** - Multiple paths to same computed (diamond dependencies)
- **S4: Conditional** - Dynamic subscriptions (like v-if logic)
- **S5: List** - List operations with filtering (like v-for patterns)
- **S6: Batch** - Batched/transactional updates

**Interpretation:**

- Balises excels at diamond dependencies, list operations, and batching while maintaining competitive performance across all scenarios
- Results show pure reactivity performance - real-world apps should consider framework ecosystem, DX, and specific use cases
- Lower rank = better performance

_Last updated: 2025-12-30_

<!-- BENCHMARK_RESULTS_END -->

## Scripts

```bash
yarn build      # Build library to dist/
yarn test       # Run tests
yarn lint       # Run ESLint
yarn examples   # Build and serve examples
yarn bench      # Run performance benchmarks
```

## License

MIT
