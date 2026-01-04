# AGENTS.md

**Guide for AI agents working in the balises codebase**

## Project Overview

**Balises** is a minimal reactive HTML templating library (~2.8KB gzipped) for building websites and web components. It provides:

- **Reactive signals system** - standalone reactivity (can be used without DOM)
- **HTML templating** - tagged template literals with reactive bindings
- **Web Components integration** - natural fit with Custom Elements API
- **Tree-shakeable** - modular exports for minimal bundle size

The library was built in a couple of days using LLM assistance as an experiment. It's thoroughly tested, performant, and production-ready, but is a personal side project with limited maintenance guarantees.

## Essential Commands

### Build & Test

```bash
yarn build          # Build library to dist/ (TypeScript + Rolldown bundles)
yarn test           # Run tests with Node's native test runner
yarn typecheck      # Run TypeScript type checking
yarn lint           # Run ESLint
yarn lint:fix       # Fix ESLint issues automatically
yarn format         # Format code with Prettier
yarn check          # Format + lint:fix + typecheck (full check)
```

### Development Workflow

```bash
yarn examples       # Build and serve examples (uses serve from dlx)
yarn examples:build # Build examples without serving
yarn docs           # Build and serve documentation site
yarn docs:build     # Build documentation to _site/
```

### Benchmarking

```bash
yarn bench                 # Run all benchmarks in isolated processes
yarn bench:update-readme   # Update benchmark results in README.md
yarn bench:self           # Run self-benchmarks
yarn bench:layers         # Test deep dependency chains
yarn bench:wide           # Test parallel signal updates
yarn bench:diamond        # Test diamond dependencies
yarn bench:conditional    # Test dynamic subscriptions
yarn bench:list           # Test list operations
yarn bench:create         # Test creation benchmarks
```

## Project Structure

```
balises/
├── src/
│   ├── index.ts           # Main entry point, exports all public APIs
│   ├── template.ts        # HTML templating (html``, each())
│   ├── parser.ts          # Streaming HTML parser (state machine)
│   └── signals/
│       ├── index.ts       # Signals entry point
│       ├── signal.ts      # Signal class (reactive value)
│       ├── computed.ts    # Computed class (derived reactive)
│       ├── effect.ts      # Effect function (side effects)
│       ├── store.ts       # Store function (proxy-based reactivity)
│       └── context.ts     # Batch/scope utilities + tracking context
├── tests/                 # Test files (*.test.ts)
├── examples/              # Example web components
├── bench/                 # Performance benchmarks
├── docs/                  # Documentation website
└── dist/                  # Build output (gitignored)
    ├── esm/              # TypeScript build (modular)
    ├── balises.esm.js    # Single-file ESM bundle
    ├── balises.iife.js   # Browser IIFE bundle
    └── balises.iife.min.js  # Minified IIFE
```

## Build System

- **TypeScript Compiler**: Builds modular ESM output to `dist/esm/` with types
- **Rolldown**: Bundles single-file ESM and IIFE distributions
- **Package Manager**: Yarn (with proto toolchain for version management)
- **Node.js**: LTS version (managed by `.prototools`)

### Output Files

The library has multiple export points for tree-shaking:

- `balises` - Full library (signals + templates)
- `balises/bundle` - Single-file bundled ESM
- `balises/signals` - Signals only (no HTML)
- `balises/signals/signal`, `balises/signals/computed`, etc. - Individual modules
- `balises/template` - Template module
- `balises/parser` - Parser module

## Code Architecture

### Signals System

**Core reactive primitives:**

- **Signal** - Mutable reactive value container. Uses `Object.is()` for equality checks. Tracks dependent computeds and subscribers.
- **Computed** - Derived reactive value. Lazy evaluation (only recomputes on access when dirty). Auto-tracks dependencies during computation.
- **Effect** - Side effect that runs when dependencies change. Implemented as a computed with an automatic subscription.
- **Store** - Proxy-based reactivity for objects. Recursively wraps nested plain objects. **Important**: Array mutations don't trigger reactivity (must reassign).

**Tracking mechanism:**

- Global `context` variable tracks the currently executing computed
- When signals/computeds are accessed, they register with the current context
- Dependency graph: Signal -> Computed (targets), Computed -> Signal/Computed (sources)
- Cleanup: When computed recomputes, it unlinks old sources and links new ones

**Batching:**

- `batch(fn)` - Groups updates, notifies subscribers once at the end
- Uses a Set to deduplicate subscriber notifications
- Batch state tracked via `batchDepth` counter

**Scoping:**

- `scope(fn)` - Creates disposable reactive context. Returns `[result, dispose]`.
- Collects all computeds/effects created during execution
- `dispose()` cleans up all at once

### Template System

**HTML Parser (`parser.ts`):**

- Streaming state machine parser (no AST)
- States: Text, TagOpen, TagName, InTag, AttrName, AttrEq, AttrVal, CloseTag, Comment
- Handles slots (interpolations) at `${...}` positions
- Emits callbacks: `onText`, `onOpenTag`, `onClose`, `onSlot`
- Supports SVG namespacing

**Template Class (`template.ts`):**

- Created by `html` tagged template literal
- `render()` method returns `{ fragment, dispose }`
- Fragment contains the live DOM
- Dispose function cleans up all subscriptions

**Binding types:**

- Text content: `${value}` - Updates text nodes
- Attributes: `attr=${value}` - Single-value or multi-part (`attr="a ${b} c"`)
- Properties: `.prop=${value}` - Sets DOM properties directly
- Events: `@event=${handler}` - addEventListener/removeEventListener
- Nested: `${html`...`}` - Renders sub-templates
- Arrays: `${[...]}` - Flattens and renders each item
- Functions: `${() => value}` - Auto-wrapped in `computed()` for reactivity

**Keyed list rendering (`each()`):**

- Opt-in via `balises/each` import, enabled with `html.with(eachPlugin)`
- Efficiently renders lists with keys to avoid recreating DOM
- Caches templates by key
- Two signatures:
  - `each(list, keyFn, renderFn)` - Explicit key function
  - `each(list, renderFn)` - Uses object reference or index
- Supports arrays, signals, computeds, and getter functions
- Reorders/adds/removes nodes surgically

**Important details:**

- `null`, `undefined`, and booleans render nothing (enables conditional: `${cond && html`...`}`)
- Functions are wrapped in `computed()` automatically
- All reactive values subscribe during render
- Dispose must be called to prevent memory leaks

### Array Operations

**Swap-and-pop removal:**

- Utility: `removeFromArray(array, item)` in `signal.ts`
- O(1) removal by swapping with last element and popping
- Used for unsubscribing from signals/computeds
- Order doesn't matter for subscriber arrays

## TypeScript Configuration

**Strict configuration** (`tsconfig.json`):

- `strict: true` - All strict checks enabled
- `noUncheckedIndexedAccess: true` - Array/object access returns T | undefined
- `exactOptionalPropertyTypes: true` - Distinguishes undefined from missing
- `verbatimModuleSyntax: true` - Import/export must match runtime semantics
- `isolatedModules: true` - Each file can be compiled independently
- `noUncheckedSideEffectImports: true` - Import side effects must be explicit
- `module: "nodenext"` - Node.js ESM resolution
- `target: "esnext"` - Modern JS features

**Important implications:**

- Always use `.js` extension in imports (not `.ts`) - verbatimModuleSyntax requirement
- Array access must check for undefined: `array[i]!` or null-check
- Optional properties can't be set to undefined explicitly

**Separate typechecking config:**

- `tsconfig.typecheck.json` - Used by `yarn typecheck`
- Includes additional files beyond src/ (tests, examples)

## Code Conventions

### Style & Formatting

- **Formatter**: Prettier (default config)
- **Linter**: ESLint with TypeScript plugin
- **Naming**:
  - Private fields: `#fieldName` (TypeScript private fields)
  - Internal methods: JSDoc `@internal` tag
  - Reactive values: Descriptive names (e.g., `count`, `fullName`, `items`)

### Module Patterns

**Export style:**

```typescript
// Named exports only (no default exports)
export { html, each, type Template } from "./template.js";
export { signal, computed, effect } from "./signals/index.js";
```

**Import conventions:**

```typescript
// Always use .js extension (not .ts)
import { signal } from "./signals/index.js";
import type { Reactive } from "./signals/index.js";
```

### Reactivity Patterns

**Signal usage:**

```typescript
const count = signal(0);
count.value = 1; // Direct assignment
count.update((n) => n + 1); // Functional update
```

**Computed patterns:**

```typescript
// Lazy - only recomputes when accessed and dirty
const doubled = computed(() => count.value * 2);
```

**Effect patterns:**

```typescript
// Eager - runs immediately and on every dependency change
const dispose = effect(() => {
  console.log(count.value);
  // Side effects here
});

// With cleanup function - runs before re-execution and on dispose
const dispose = effect(() => {
  const subscription = api.subscribe(userId.value);
  return () => subscription.unsubscribe(); // cleanup
});
```

**Store caveats:**

```typescript
const state = store({ items: [1, 2, 3] });

// ❌ Does NOT trigger reactivity
state.items.push(4);

// ✅ Triggers reactivity
state.items = [...state.items, 4];
```

### Web Component Patterns

**Standard structure:**

```typescript
class MyElement extends HTMLElement {
  #state = signal(initialValue);
  #dispose?: () => void;

  connectedCallback() {
    const { fragment, dispose } = html`...`.render();
    this.appendChild(fragment);
    this.#dispose = dispose;
  }

  disconnectedCallback() {
    this.#dispose?.(); // Clean up subscriptions
  }
}

customElements.define("x-my-element", MyElement);
```

**Multiple cleanup functions:**

```typescript
connectedCallback() {
  const syncEffect = effect(() => {
    localStorage.setItem("key", this.#state.value);
  });

  const { fragment, dispose } = html`...`.render();
  this.appendChild(fragment);

  this.#dispose = () => {
    syncEffect();  // Dispose effect
    dispose();     // Dispose template
  };
}
```

### Function Component Patterns

For lighter-weight composition without full web components, use **function components** that receive a store and return templates. This is the recommended approach for most UIs as it's simpler and better for composition:

```typescript
// Define a function component - receives store, returns template
function SearchBox({ state, onInput, onSelect }) {
  return html`
    <div class="search-box">
      <input @input=${onInput} placeholder="Search..." />
      <div
        class="results"
        style=${() => (state.results.length ? "" : "display:none")}
      >
        ${() =>
          state.results.map(
            (r) => html`<div @click=${() => onSelect(r)}>${r.name}</div>`,
          )}
      </div>
    </div>
  `;
}

// Use in parent - pass store reference, it stays reactive
const state = store({ query: "", results: [] });

html`
  <div class="app">
    ${SearchBox({ state, onInput: handleInput, onSelect: handleSelect })}
  </div>
`.render();
```

**Key principles:**

1. **Pass the store, not values** - The store is a stable reference; accessing `state.property` inside function wrappers tracks dependencies
2. **Use function wrappers for reactivity** - `${() => state.count}` creates a computed that updates when `state.count` changes
3. **Event handlers as props** - Pass callbacks for actions, keeping logic in the parent
4. **No lifecycle needed** - Function components render once; reactivity handles updates

**When to use function components vs web components:**

| Function Components      | Web Components              |
| ------------------------ | --------------------------- |
| Internal UI composition  | Reusable standalone widgets |
| Shared state from parent | Self-contained state        |
| No Shadow DOM needed     | Need style encapsulation    |
| Quick composition        | Publishing packages         |

### Async Generator Patterns

Async generator functions enable progressive loading and automatic dependency-driven restarts. **Note:** Async generators are opt-in via the `balises/async` import to keep the base bundle small. Use `html.with(asyncPlugin)` to enable async generator support.

```typescript
import { html as baseHtml, signal } from "balises";
import asyncPlugin from "balises/async";

const html = baseHtml.with(asyncPlugin);
const userId = signal(1);

// Basic async generator - yields loading state, then content
// No wrapper needed - async generator functions are auto-detected
html`
  ${async function* () {
    const id = userId.value; // Track dependency - restarts when userId changes

    yield html`<div class="loading">Loading...</div>`;

    const user = await fetchUser(id);
    yield html`<div class="user">${user.name}</div>`;
  }}
`.render();
```

**Progressive loading** (loading → content → posts):

```typescript
import { html as baseHtml, signal } from "balises";
import asyncPlugin from "balises/async";

const html = baseHtml.with(asyncPlugin);

async function* loadUserProfile() {
  const id = userId.value; // Track dependency

  yield html`<div class="loading">Loading user...</div>`;

  const user = await fetchUser(id);
  yield html`
    <div class="user">
      <h2>${user.name}</h2>
      <p>Loading posts...</p>
    </div>
  `;

  const posts = await fetchUserPosts(id);
  return html`
    <div class="user">
      <h2>${user.name}</h2>
      <ul>
        ${posts.map((p) => html`<li>${p.title}</li>`)}
      </ul>
    </div>
  `;
}

// Async generator functions are auto-detected - no wrapper needed
html`${loadUserProfile}`.render();
```

**Key behaviors:**

1. **Dependency tracking** - Reading `.value` during generator execution tracks dependencies
2. **Auto-restart** - When tracked signals change, the generator is disposed and restarted
3. **Cleanup** - `generator.return()` is called on dispose/restart, triggering `finally` blocks
4. **Stale iteration handling** - If a signal changes mid-iteration, stale yields are ignored

**When to use async generators vs reactive bindings:**

| Async Generators                      | Reactive Bindings                    |
| ------------------------------------- | ------------------------------------ |
| Loading → Content → Error transitions | Data changes within stable structure |
| Progressive/streaming content         | High-frequency updates               |
| Structural changes on each step       | Surgical DOM updates                 |
| `yield html\`<NewStructure />\``      | `${() => state.value}`               |

**Important:** Async generators **replace the entire yielded content** on each yield. For surgical updates within a stable DOM structure (like updating a name or count), use reactive bindings instead:

```typescript
// ❌ Avoid: Re-yields entire card on every name update
async function* loadUser() {
  const user = await fetchUser();
  yield html`<div>${user.name}</div>`;
  // If you yield again, the whole div is replaced
}

// ✅ Better: Yield once, let reactive bindings handle updates
async function* loadUser() {
  const user = await fetchUser();
  state.userName = user.name;
  yield html`<div>${() => state.userName}</div>`;
  // Now state.userName changes trigger surgical text updates
}
```

**DOM Preservation on Restart:**

When a signal changes, the generator restarts. To preserve existing DOM instead of re-rendering, use the `settled` parameter:

```typescript
import { html as baseHtml, signal, store } from "balises";
import asyncPlugin, { type RenderedContent } from "balises/async";

const html = baseHtml.with(asyncPlugin);

const userId = signal(1);
const state = store({ user: null, loading: false, error: null });

async function* loadUser(settled?: RenderedContent) {
  const id = userId.value; // Track dependency

  // Fetch data (works for both first load and restarts)
  state.loading = true;
  state.error = null;

  try {
    const user = await fetchUser(id);
    state.user = user;
  } catch (e) {
    state.error = e instanceof Error ? e.message : "Failed to fetch";
  } finally {
    state.loading = false;
  }

  // On restart: preserve existing DOM
  if (settled) return settled;

  // First load: render with reactive bindings
  return html`
    <div class="profile">
      <h2>${() => state.user?.name ?? "Unknown"}</h2>
      <p class="loading" style=${() => (state.loading ? "" : "display:none")}>
        Updating...
      </p>
      <p class="error" style=${() => (state.error ? "" : "display:none")}>
        ${() => state.error}
      </p>
    </div>
  `;
}
```

The `settled` parameter:

- Is `undefined` on first run
- Contains an opaque `RenderedContent` handle on restarts
- When returned, preserves existing DOM and reactive bindings
- Enables surgical updates via reactive bindings instead of full re-renders

**Why this pattern is simpler:**

1. **Single code path for fetching** - Same logic runs on first load and restarts
2. **Reactive bindings handle all UI states** - Loading, error, and content are all reactive
3. **`settled` check at the end** - Only decides whether to preserve DOM or render new content
4. **No need for `Promise.race`** - Skip delayed skeleton if reactive bindings already show loading state

## Testing

**Test Framework:** Node.js native test runner (`node:test`)

**Test structure:**

```typescript
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html, signal } from "../src/index.js";

describe("feature", () => {
  it("should do something", () => {
    assert.strictEqual(actual, expected);
  });
});
```

**Test setup:**

- `tests/setup.ts` - Initializes jsdom for DOM testing
- Imported automatically via `--import ./tests/setup.ts`
- Uses jsdom to provide DOM APIs in Node.js

**Running tests:**

```bash
yarn test                                    # All tests
node --import tsx/esm --import ./tests/setup.ts --test tests/signal.test.ts  # Single file
```

**Coverage areas:**

- Signal reactivity (subscriptions, updates, batching)
- Computed dependencies (tracking, disposal, lazy evaluation)
- Template rendering (static, dynamic, nested, keyed lists)
- Parser edge cases (comments, self-closing tags, SVG)
- Memory management (disposal, cleanup)
- Scope and context isolation

## Common Gotchas

### 1. Array Access with Strict TypeScript

```typescript
// ❌ Error: Object is possibly 'undefined'
const item = array[0];

// ✅ Use non-null assertion if you know it exists
const item = array[0]!;

// ✅ Or check explicitly
const item = array[0];
if (item !== undefined) {
  // use item
}
```

### 2. Import Extensions Must Be .js

```typescript
// ❌ Wrong - TypeScript will complain
import { signal } from "./signals/index";
import { signal } from "./signals/index.ts";

// ✅ Correct - use .js even though file is .ts
import { signal } from "./signals/index.js";
```

### 3. Store Array Mutations Don't Trigger Updates

```typescript
const state = store({ items: [] });

state.items.push(item); // ❌ No reactivity
state.items = [...state.items, item]; // ✅ Reactive
```

Use signals for arrays if you need functional updates:

```typescript
const items = signal([]);
items.update((arr) => [...arr, item]);
```

### 4. Dispose Must Be Called

```typescript
// ❌ Memory leak - subscriptions never cleaned up
const { fragment } = html`...`.render();

// ✅ Store dispose and call it
const { fragment, dispose } = html`...`.render();
// Later...
dispose();
```

### 5. Functions Auto-Wrap in Computed

```typescript
// This works - function is wrapped in computed() automatically
html`<div>${() => count.value * 2}</div>`;

// Equivalent to:
html`<div>${computed(() => count.value * 2)}</div>`;
```

### 6. Each() Expects Template Return

```typescript
// ❌ Wrong - returns string
each(items, (item) => item.name);

// ✅ Correct - returns Template
each(items, (item) => html`<li>${item.name}</li>`);
```

### 7. Batch Doesn't Prevent Recomputation

```typescript
const a = signal(1);
const b = signal(2);
const sum = computed(() => a.value + b.value);

batch(() => {
  a.value = 10;
  b.value = 20;
  // sum.value will recompute here if accessed
  console.log(sum.value); // Triggers recompute
});

// Batch only defers subscriber notifications, not computed recalculation
```

### 8. SVG Elements Need Correct Namespace

The parser automatically handles SVG namespacing:

```typescript
// ✅ Auto-detected - svg/SVG tag or parent with SVG namespace
html`<svg><circle r="10" /></svg>`;

// Children of <svg> also get SVG namespace
```

## Performance Considerations

### Bundle Size

- Full library: ~2.8KB gzipped
- Signals only: ~1.5KB gzipped
- CI warns if IIFE bundle exceeds 3500 bytes gzipped

**Tree-shaking optimization:**

```typescript
// Import only what you need
import { signal, computed } from "balises/signals/signal";
import { effect } from "balises/signals/effect";
```

### Benchmark Results

Balises ranks #2 overall in reactivity benchmarks, tied with Preact for average rank (1.5).

**Strengths:**

- Diamond dependencies (complex dependency graphs)
- List operations (keyed rendering)
- Batched updates

**See README.md for detailed benchmark results** (updated via `yarn bench:update-readme`)

### Optimization Techniques Used

1. **Swap-and-pop removal** - O(1) unsubscribe from subscriber arrays
2. **Lazy computed evaluation** - Only recomputes when accessed and dirty
3. **Dependency tracking with indices** - Reuses source array slots during tracking
4. **Object.is() equality** - Fast equality checks, handles NaN correctly
5. **Direct array iteration** - Avoids forEach overhead in hot paths
6. **Inline small functions** - Reduces call stack depth

## CI/CD

**GitHub Actions workflows:**

- **CI** (`.github/workflows/ci.yml`) - Runs on PRs and main branch
  - Format check (Prettier)
  - Lint (ESLint)
  - Type check
  - Build
  - Test
  - Bundle size check (warns if >3500 bytes gzipped)

- **Benchmark** (`.github/workflows/benchmark.yml`) - Automated benchmarks

- **Pages** (`.github/workflows/pages.yml`) - Deploys documentation

- **Release** (`.github/workflows/release.yml`) - NPM releases

**Proto toolchain:**

- Uses moonrepo/setup-toolchain action
- Versions defined in `.prototools`
- Auto-installs correct Node.js and Yarn versions

## Development Tips

### Adding New Features

1. **Start with types** - Define interfaces/types first
2. **Write tests** - Add test cases before implementation
3. **Update exports** - Add to appropriate `index.ts` and `package.json` exports
4. **Document in README** - Update API documentation
5. **Check bundle size** - Run build and verify `dist/balises.iife.min.js` size

### Debugging Reactivity

**Enable logging in development:**

```typescript
// Track what's being subscribed to
const s = signal(0);
const originalSubscribe = s.subscribe.bind(s);
s.subscribe = (fn) => {
  console.log("New subscription", fn);
  return originalSubscribe(fn);
};
```

**Common reactivity issues:**

- Computed not updating → Check if sources are actually reactive
- Memory leak → Ensure dispose() is called
- Too many updates → Missing batch() around multiple signal changes
- Stale value → Computed might be disposed or sources changed

### Working with Examples

Examples are standalone web components in `examples/`:

```bash
cd examples/counter
# Each example has:
# - index.html (page structure)
# - component.ts (source)
# - component.js (built output)
```

Build all examples:

```bash
yarn examples:build  # Builds with Rolldown
```

### Updating Benchmarks

After performance changes:

```bash
yarn bench:update-readme  # Runs benchmarks and updates README.md
git add README.md
git commit -m "update benchmark numbers"
```

The README contains marked sections `<!-- BENCHMARK_RESULTS_START -->` and `<!-- BENCHMARK_RESULTS_END -->` that get updated automatically.

## Documentation Site

Located in `docs/` directory:

- **Static HTML** - No build step, just vanilla JS
- **Uses balises** - Documentation site built with balises itself
- **Examples embedded** - Copies example builds into `_site/examples/`

Build and serve:

```bash
yarn docs        # Build and serve with `serve`
yarn docs:build  # Build to _site/ only
```

## Common Tasks

### Add a new signal primitive

1. Create `src/signals/new-primitive.ts`
2. Export from `src/signals/index.ts`
3. Add to package.json exports: `"./signals/new-primitive"`
4. Write tests in `tests/new-primitive.test.ts`
5. Document in README.md

### Add a new template feature

1. Modify `src/template.ts` or `src/parser.ts`
2. Update Template class or parser state machine
3. Add tests in `tests/template.test.ts` or `tests/parser.test.ts`
4. Document syntax in README.md
5. Add example in `examples/`

### Fix a bug

1. Add failing test case first
2. Fix the issue
3. Verify test passes
4. Run full test suite: `yarn test`
5. Run type check: `yarn typecheck`
6. Run lint: `yarn lint:fix`

### Update dependencies

```bash
yarn upgrade-interactive  # Interactive upgrade
yarn install              # Install new versions
yarn test                 # Verify nothing broke
yarn typecheck
yarn build
```

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG (if exists)
3. Run full check: `yarn check && yarn test`
4. Build: `yarn build`
5. Commit: `git commit -am "vX.Y.Z"`
6. Tag: `git tag vX.Y.Z`
7. Push: `git push && git push --tags`
8. GitHub Actions handles NPM publish

## Additional Context

### History

- Built in a couple of days with LLM assistance (2024)
- Created for a Datadog internal project needing lightweight reactivity
- Inspired by Solid, Vue, Preact signals
- Prioritizes simplicity, performance, and small bundle size
- Personal side project - limited long-term maintenance guarantees

### Design Philosophy

- **Minimal API surface** - Few primitives, compose them
- **Zero dependencies** - Self-contained, no external deps
- **Tree-shakeable** - Use only what you need
- **Standards-based** - Works with Web Components, vanilla JS
- **LLM-friendly** - Clear patterns, consistent conventions

### When to Use Balises

✅ Good fit:

- Building web components
- Adding interactivity to existing sites
- Need reactive state without framework overhead
- Bundle size is critical
- Want standalone signals library

❌ Not ideal for:

- Large SPAs with routing (use full framework)
- Teams needing long-term support guarantees
- Complex state management (consider specialized tools)

### Community & Support

- **GitHub**: https://github.com/elbywan/balises
- **Documentation**: https://elbywan.github.io/balises/
- **Issues**: File on GitHub (personal project, best-effort support)
- **License**: MIT

---

_Last updated: 2024-12-30_
