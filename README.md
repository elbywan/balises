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
