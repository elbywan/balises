# balises

A minimal reactive HTML templating library. ~3.2KB gzipped.

> **Note:** This is a personal side project with limited maintenance. Most of the code was written with LLM assistance. Use at your own discretion.

## Installation

```bash
npm install balises
```

## Quick Start

```ts
import { html, signal } from "balises";

const count = signal(0);

const { fragment, dispose } = html`
  <button @click=${() => count.value++}>Clicked ${count} times</button>
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

- `list` - A reactive array
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

### `signal<T>(value, options?)` / `new Signal<T>(value, options?)`

Creates a reactive value container.

```ts
const name = signal("world");
console.log(name.value); // "world"
name.value = "everyone"; // Notifies subscribers
```

### `computed<T>(fn, options?)` / `new Computed<T>(fn, options?)`

Creates a derived value that auto-tracks dependencies.

```ts
const firstName = signal("John");
const lastName = signal("Doe");
const fullName = computed(() => `${firstName.value} ${lastName.value}`);

console.log(fullName.value); // "John Doe"
firstName.value = "Jane";
console.log(fullName.value); // "Jane Doe"
```

### `store<T>(obj, options?)`

Proxy-based reactive wrapper. Nested plain objects are wrapped recursively.

```ts
const state = store({ count: 0, user: { name: "Alice" } });
state.count++; // Reactive
state.user.name = "Bob"; // Also reactive (nested)
```

### `isSignal(value)`

Type guard to check if a value is reactive (`Signal` or `Computed`).

```ts
isSignal(signal(1)); // true
isSignal(computed(() => 1)); // true
isSignal(42); // false
```

### Options

All reactive primitives accept an optional `{ batched: boolean }` option:

```ts
const count = signal(0, { batched: true });
```

When `batched: true`, notifications are deferred to a microtask and coalesced, reducing redundant updates.

### Global Batched Mode

```ts
import { setBatched, getBatched } from "balises";

setBatched(true); // All new signals/computed default to batched
getBatched(); // Returns current default (false initially)
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

## Scripts

```bash
yarn build      # Build library to dist/
yarn test       # Run tests
yarn lint       # Run ESLint
yarn examples   # Build and serve examples
```

## License

MIT
