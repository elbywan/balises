<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/logo.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/logo-light.svg">
  <img alt="balises" src="./assets/logo.svg" width="280">
</picture>

### A minimal reactive HTML templating library for building websites and web components. ~3.1KB gzipped.

Balises gives you reactive signals and HTML templates without the framework overhead. Works great with custom elements, vanilla JavaScript projects, or anywhere you need dynamic UIs but don't want to pull in React.

**You can also use it as a standalone signals library** - the reactivity system works independently of the templating, making it useful for any JavaScript project that needs reactive state management.

**[📚️ Documentation & Examples](https://elbywan.github.io/balises/)**

## Preamble

> [!WARNING]
> 🚧 Use at your own discretion

This library was built in a couple of days **using LLM assistance** as an experiment to see if it was possible to produce something high-quality and performant very quickly.

It all begun with me needing a lightweight reactive templating solution with zero dependencies for a non-critical work project at [Datadog](https://www.datadoghq.com/), and since I wanted to explore what modern AI-assisted development could achieve it was a good fit.

Ultimately it turns out that I am quite happy with the result! It is quite performant, ergonomic, has a very small bundle size, is thoroughly tested and suits my needs well. 🌟

**However, please be aware that this is a personal side project with limited maintenance and no guarantees of long-term support.**

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Function Components](#function-components)
- [Async Generators](#async-generators)
  - [DOM Preservation on Restart](#dom-preservation-on-restart)
- [Template Syntax](#template-syntax)
- [Reactivity API](#reactivity-api)
- [Web Components](#web-components)
- [Tree-Shaking / Modular Imports](#tree-shaking--modular-imports)
- [Benchmarks](#benchmarks)

## Installation

```bash
npm install balises
```

## Quick Start

Balises uses tagged template literals to create reactive HTML. Just interpolate signals into your markup and they'll automatically update the DOM when they change.

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

## Function Components

The recommended way to build UIs with balises is using function components - plain functions that receive props and return templates. This pattern is simpler than web components and better for composition.

```ts
import { html, store } from "balises";

// Define a reusable component as a function
function Counter({ state, onIncrement }) {
  return html`
    <div class="counter">
      <span>Count: ${() => state.count}</span>
      <button @click=${onIncrement}>+1</button>
    </div>
  `;
}

// Create shared state
const state = store({ count: 0 });

// Compose components together
const { fragment, dispose } = html`
  <div class="app">
    <h1>My App</h1>
    ${Counter({ state, onIncrement: () => state.count++ })}
    ${Counter({ state, onIncrement: () => (state.count += 10) })}
  </div>
`.render();

document.body.appendChild(fragment);
```

Pass the store itself (not individual values) so reactivity works.

Wrap expressions in functions like `${() => state.count}` to track dependencies.

## Async Generators

Async generator functions handle loading states and async data flows. The generator automatically restarts when any tracked signal changes.

**Note:** Async generators are opt-in via `balises/async` to keep the base bundle small.

```ts
import { html as baseHtml, signal } from "balises";
import asyncPlugin from "balises/async";

const html = baseHtml.with(asyncPlugin);
const userId = signal(1);

html`
  ${async function* () {
    const id = userId.value; // Track dependency - restarts when userId changes

    yield html`<div class="loading">Loading...</div>`;

    const user = await fetch(`/api/users/${id}`).then((r) => r.json());
    yield html`<div class="profile">${user.name}</div>`;
  }}
`.render();

// Changing userId restarts the generator automatically
userId.value = 2;
```

Async generators replace the entire yielded content on each yield. For surgical updates within a stable DOM structure, use reactive bindings (`${() => state.value}`) instead.

### DOM Preservation on Restart

When a signal changes, the generator restarts and normally replaces the DOM. To preserve existing DOM and enable surgical updates via reactive bindings, return the `settled` parameter:

```ts
import { html as baseHtml, signal, store } from "balises";
import asyncPlugin, { type RenderedContent } from "balises/async";

const html = baseHtml.with(asyncPlugin);
const userId = signal(1);
const state = store({ user: null, loading: false });

html`
  ${async function* (settled?: RenderedContent) {
    const id = userId.value;

    if (settled) {
      // Restart: update state, preserve existing DOM
      state.loading = true;
      const user = await fetch(`/api/users/${id}`).then((r) => r.json());
      state.user = user;
      state.loading = false;
      return settled;
    }

    // First load: render with reactive bindings
    yield html`<div class="skeleton">Loading...</div>`;
    const user = await fetch(`/api/users/${id}`).then((r) => r.json());
    state.user = user;
    return html`
      <div class="profile">
        <h2>${() => state.user?.name}</h2>
        <span>${() => (state.loading ? "Updating..." : "")}</span>
      </div>
    `;
  }}
`.render();
```

The `settled` parameter is `undefined` on first run, and contains an opaque handle to the previous render on restarts. Returning it preserves existing DOM nodes and reactive bindings.

## Web Components

For reusable widgets that need encapsulation or browser-native lifecycle, balises works naturally with the Web Components API:

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

customElements.define("x-counter", Counter);
```

Use it in your HTML:

```html
<x-counter></x-counter>
```

You can build entire apps this way, or just add interactive widgets to existing pages. No build step required if you use it from a CDN.

## Template Syntax

The `html` tagged template creates reactive DOM fragments. When you interpolate a signal, that specific part of the DOM updates automatically when the signal changes.

### Interpolation Types

| Syntax            | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `${value}`        | Text content (strings, numbers, templates, arrays)    |
| `attr=${value}`   | Attribute (`null`/`false` removes, `true` sets empty) |
| `attr="a ${b} c"` | Multi-part attribute (string concatenation)           |
| `.prop=${value}`  | Property binding (sets element property directly)     |
| `@event=${fn}`    | Event listener                                        |

All interpolations accept reactive values (`Signal` or `Computed`) and will auto-update when they change.

### Function Interpolation

Functions are wrapped in `computed()` automatically:

```ts
const state = store({ count: 0 });

html`
  <p>Count: ${() => state.count}</p>
  <p>Doubled: ${() => state.count * 2}</p>
  ${() => (state.count > 10 ? html`<p>High score!</p>` : null)}
`.render();
```

### Nested Templates

Templates can be nested, and arrays of templates are flattened:

```ts
const items = signal(["a", "b", "c"]);

html`
  <ul>
    ${() => items.value.map((item) => html`<li>${item}</li>`)}
  </ul>
`.render();
```

### Efficient List Rendering with `each()`

When rendering lists that change frequently, use `each()` for keyed reconciliation. It caches templates by key so items can be reordered, added, or removed without recreating the DOM nodes.

**Note:** The `each()` function is opt-in via the `balises/each` import to keep the base bundle small. Use `html.with(eachPlugin)` to enable keyed list support.

**Two forms:**

1. **Two-arg form** (object reference as key): Render receives raw item. DOM reused only when same object reference appears.
2. **Three-arg form** (explicit key function): Render receives `ReadonlySignal<T>`. DOM reused when keys match, even with new object references.

```ts
import { html as baseHtml, signal } from "balises";
import eachPlugin, { each } from "balises/each";

const html = baseHtml.with(eachPlugin);

// Three-arg form: explicit key, receives ReadonlySignal
// DOM is preserved when keys match (ideal for API data)
const users = signal([
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
]);

html`
  <ul>
    ${each(
      users,
      (user) => user.id,
      (userSignal) => html`<li>${() => userSignal.value.name}</li>`,
    )}
  </ul>
`.render();

// Refetch from API - DOM preserved, content updated via signal
users.value = [
  { id: 1, name: "Alicia" }, // Same key, new object - DOM preserved!
  { id: 2, name: "Bobby" },
  { id: 3, name: "Carol" }, // New key - new DOM created
];

// Two-arg form: object reference as key, receives raw item
const items = signal([{ name: "Item 1" }, { name: "Item 2" }]);

html`
  <ul>
    ${each(items, (item) => html`<li>${item.name}</li>`)}
  </ul>
`.render();
```

Signatures:

```ts
each(list, keyFn, renderFn); // Three-arg: keyFn extracts key, renderFn receives ReadonlySignal<T>
each(list, renderFn); // Two-arg: object reference as key, renderFn receives raw T
```

**Important:** When using the three-arg form, access item properties through `itemSignal.value` and wrap in `() => ...` for reactive updates.

## Reactivity API

### `signal<T>(value)`

Wraps a value to make it reactive.

```ts
const name = signal("world");
console.log(name.value); // "world"
name.value = "everyone"; // Notifies subscribers
```

**Updating based on the current value:**

```ts
const count = signal(0);

// Using update() for functional updates
count.update((n) => n + 1);
count.update((n) => n * 2);

// Equivalent to:
count.value = count.value + 1;
count.value = count.value * 2;
```

**Reading without tracking dependencies:**

```ts
const count = signal(0);

// peek() reads without creating a dependency
// Useful in event handlers where you don't want reactivity
button.onclick = () => console.log(count.peek());
```

### `computed<T>(fn)`

Derives a value from other signals. Automatically tracks dependencies.

```ts
const firstName = signal("John");
const lastName = signal("Doe");
const fullName = computed(() => `${firstName.value} ${lastName.value}`);

console.log(fullName.value); // "John Doe"
firstName.value = "Jane";
console.log(fullName.value); // "Jane Doe"
```

Computed values are lazy - they only recalculate when accessed and a dependency has changed.

### `effect(fn)`

Runs a side effect whenever its dependencies change. Under the hood, `effect()` is a computed with an automatic subscription, which makes it run eagerly on every dependency change rather than waiting to be accessed.

The effect function can optionally return a cleanup function that will be called before the effect re-runs and when the effect is disposed.

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

**Cleanup function:**

```ts
const userId = signal(1);

const dispose = effect(() => {
  const id = userId.value;
  const subscription = api.subscribe(id);

  // Cleanup: runs before next effect execution and on dispose
  return () => subscription.unsubscribe();
});

userId.value = 2; // Unsubscribes from user 1, subscribes to user 2
dispose(); // Final cleanup: unsubscribes from user 2
```

Good for things like:

- Syncing state to localStorage
- Updating document.title or other globals
- Logging and analytics
- Network requests based on state

When you call `dispose()` on a template, any effects created during rendering are cleaned up automatically.

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

A proxy-based alternative to signals. Nested plain objects become reactive automatically.

```ts
const state = store({ count: 0, user: { name: "Alice" } });
state.count++; // Reactive
state.user.name = "Bob"; // Also reactive (nested)
```

**Note:** Array mutations like `push()`, `pop()`, `splice()` do **not** trigger reactivity. You need to reassign the array:

```ts
const state = store({ items: [1, 2, 3] });

// ❌ Does NOT trigger reactivity
state.items.push(4);

// ✅ Triggers reactivity
state.items = [...state.items, 4];

// Alternative: Use signal for arrays to get the .update() helper
const items = signal([1, 2, 3]);
items.update((arr) => [...arr, 4]);
items.update((arr) => arr.filter((n) => n !== 2));
```

### `batch<T>(fn)`

Batches multiple signal updates so subscribers only get notified once at the end.

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

Groups reactive primitives together so you can dispose them all at once.

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

Handy for components or temporary reactive contexts where you need bulk cleanup.

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

Stops a computed from tracking dependencies and frees memory.

```ts
const doubled = computed(() => count.value * 2);
doubled.dispose(); // Stops tracking, frees memory
```

## Tree-Shaking / Modular Imports

You can import just what you need to keep bundle size down:

```ts
// Full library (~3.1KB gzipped)
import { html, signal, computed, effect } from "balises";

// Signals only (no HTML templating - use in any JS project)
import { signal, computed, effect, store, batch, scope } from "balises/signals";

// Individual modules
import { signal } from "balises/signals/signal";
import { computed } from "balises/signals/computed";
import { effect } from "balises/signals/effect";
import { store } from "balises/signals/store";
import { batch, scope } from "balises/signals/context";
```

### Template Plugins

The `each()` and async generator features are provided as opt-in plugins to keep the base bundle minimal. Use `html.with()` to compose plugins:

```ts
// With each() support for keyed lists
import { html as baseHtml } from "balises";
import eachPlugin, { each } from "balises/each";

const html = baseHtml.with(eachPlugin);

// With async generator support
import { html as baseHtml } from "balises";
import asyncPlugin from "balises/async";

const html = baseHtml.with(asyncPlugin);

// With both plugins
import { html as baseHtml } from "balises";
import eachPlugin, { each } from "balises/each";
import asyncPlugin from "balises/async";

const html = baseHtml.with(eachPlugin, asyncPlugin);
```

### Using as a Standalone Signals Library

The reactivity system is completely independent of the HTML templating. You can use just the signals in Node.js, Electron, or any JavaScript environment:

```ts
import { signal, computed, effect } from "balises/signals";

// Reactive state management without DOM
const users = signal([]);
const userCount = computed(() => users.value.length);

effect(() => {
  console.log(`Total users: ${userCount.value}`);
});

users.value = [{ name: "Alice" }, { name: "Bob" }];
// Logs: "Total users: 2"
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
        <p>Count: ${() => state.count} (double: ${double})</p>
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
┌───────┬───────────────────┬───────┬───────────────┬──────────────────┐
│ Rank  │ Library           │ Score │ Avg Time (μs) │ vs Fastest       │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #1 🏆 │ preact@1.12.1     │ 0.000 │ 64.00         │ 1.00x (baseline) │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #2    │ balises@0.7.2     │ 0.022 │ 85.76         │ 1.34x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #3    │ vue@3.5.26        │ 0.080 │ 94.69         │ 1.48x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #4    │ maverick@6.0.0    │ 0.142 │ 124.28        │ 1.94x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #5    │ usignal@0.10.0    │ 0.190 │ 135.64        │ 2.12x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #6    │ angular@19.2.17   │ 0.205 │ 163.90        │ 2.56x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #7    │ solid@1.9.10      │ 0.341 │ 269.71        │ 4.21x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #8    │ mobx@6.15.0       │ 0.846 │ 915.30        │ 14.30x           │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #9    │ hyperactiv@0.11.3 │ 1.000 │ 1067.91       │ 16.69x           │
└───────┴───────────────────┴───────┴───────────────┴──────────────────┘
```

### Performance by Scenario

```
┌───────────────────┬───────────────┬─────────────┬────────────────┬────────────────────┬─────────────┬──────────────┬──────────┐
│ Library           │ S1: 1: Layers │ S2: 2: Wide │ S3: 3: Diamond │ S4: 4: Conditional │ S5: 5: List │ S6: 6: Batch │ Avg Rank │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ preact@1.12.1     │ #1 🏆         │ #2          │ #2             │ #1 🏆              │ #1 🏆       │ #2           │ 1.5      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ balises@0.7.2     │ #3            │ #1 🏆       │ #1 🏆          │ #2                 │ #2          │ #1 🏆        │ 1.7      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ vue@3.5.26        │ #2            │ #3          │ #4             │ #3                 │ #3          │ #4           │ 3.2      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ maverick@6.0.0    │ #5            │ #5          │ #3             │ #4                 │ #4          │ #5           │ 4.3      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ usignal@0.10.0    │ #4            │ #4          │ #5             │ #5                 │ #8          │ #7           │ 5.5      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ angular@19.2.17   │ #6            │ #6          │ #6             │ #6                 │ #5          │ #3           │ 5.3      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ solid@1.9.10      │ #7            │ #8          │ #7             │ #7                 │ #7          │ #6           │ 7.0      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ mobx@6.15.0       │ #9            │ #7          │ #8             │ #8                 │ #6          │ #8           │ 7.7      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────┤
│ hyperactiv@0.11.3 │ #8            │ #9          │ #9             │ #9                 │ #9          │ #9           │ 8.8      │
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

- Balises performs well across all scenarios, particularly excelling at diamond dependencies, list operations, and batching
- These are synthetic benchmarks measuring pure reactivity - real apps should consider the whole picture (ecosystem, docs, community, etc.)
- Lower rank = better performance

_Last updated: 2026-01-07_

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
