<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/logo.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/logo-light.svg">
  <img alt="balises" src="./assets/logo.svg" width="280">
</picture>

### A minimal reactive HTML templating library for building websites and web components. ~3.4KB gzipped.

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
- [Memo Components](#memo-components)
- [Async Generators](#async-generators)
- [Web Components](#web-components)
- [Server-Side Rendering](#server-side-rendering)
- [Hot Module Replacement](#hot-module-replacement)
- [Template Syntax](#template-syntax)
- [Reactivity API](#reactivity-api)
- [Tree-Shaking / Modular Imports](#tree-shaking--modular-imports)
- [Writing Plugins](#writing-plugins)
- [Using as a Standalone Signals Library](#using-as-a-standalone-signals-library)
- [Full Example](#full-example)
- [Benchmarks](#benchmarks)
- [License](#license)

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
import { html } from "balises";
import { store } from "balises/signals/store";

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

## Memo Components

<details>
<summary><b>Click to expand</b></summary>

<br/>

The `memo()` utility prevents unnecessary DOM re-renders of functional components by memoizing their output per call site: when the same component is called with equal props again (shallow equality by default), it returns the previous result unchanged and the template skips the DOM work entirely.

**Note:** Memo is opt-in via `balises/memo` and requires plugin registration with `html.with(memoPlugin)`.

```ts
import { html as baseHtml, signal } from "balises";
import memoPlugin, { memo } from "balises/memo";

const html = baseHtml.with(memoPlugin);
const count = signal(0);

const Counter = memo(({ count }) => {
  console.log("Counter rendered"); // Only logs when props change
  return html`<div>Count: ${count}</div>`;
});

// Re-called when count changes; equal props skip re-rendering
html`<div>${() => Counter({ count: count.value })}</div>`.render();
```

### Custom Comparison

Provide an optional comparator function for fine-grained control over when components re-render. Return `true` if props are equal (skip re-render):

```ts
const Counter = memo(
  ({ count }) => html`<div>${count}</div>`,
  (prev, next) => {
    // Only re-render if count differs by more than 5
    return Math.abs(prev.count - next.count) <= 5;
  },
);
```

### When to Use Memo

**Use memo() when:**

- Component is inside a reactive binding and may be re-called with identical props
- Component function performs expensive computation

**Don't use memo() when:**

- Component is used statically — it already runs only once
- Props always change, or the component is trivial — memo adds overhead without benefit

</details>

## Async Generators

<details>
<summary><b>Click to expand</b></summary>

<br/>

Async generator functions handle loading states and async data flows. The generator automatically restarts when any tracked signal changes.

**Note:** Async generators are opt-in via `balises/async` to keep the base bundle small.

```ts
import { html as baseHtml, signal } from "balises";
import asyncPlugin from "balises/async";

const html = baseHtml.with(asyncPlugin);
const userId = signal(1);

html`
  ${async function* (settled, ctx) {
    void settled;
    const id = userId.value; // Track dependency - restarts when userId changes
    const prev = ctx?.lastId;
    if (ctx) ctx.lastId = id;

    yield html`<div class="loading">Loading...</div>`;

    const user = await fetch(`/api/users/${id}`).then((r) => r.json());
    yield html`<div class="profile">${user.name}</div>`;
  }}
`.render();

// Changing userId restarts the generator automatically
userId.value = 2;
```

Async generators replace the entire yielded content on each yield. For surgical updates within a stable DOM structure, use reactive bindings (`${() => state.value}`) instead.

Generators receive a mutable context object as their second argument. This object persists across restarts and can hold user-defined state for diffing or caching. Use the `AsyncGeneratorContext<T>` type from `balises/async` for type safety.

Every run gets a fresh `ctx.signal` (`AbortSignal`) that aborts when the generator restarts (a tracked signal changed mid-run) or the binding is disposed - and server-side, when a `renderToStringStream` consumer stops early. Wire your requests to it so in-flight work is cancelled instead of wasted:

```ts
html`
  ${async function* (settled, ctx) {
    void settled;
    const id = userId.value; // Tracked: changes restart the generator
    const user = await fetch(`/api/users/${id}`, {
      signal: ctx?.signal, // Cancelled on restart/dispose/stream stop
    }).then((r) => r.json());
    return html`<div>${user.name}</div>`;
  }}
`.render();
```

### DOM Preservation on Restart

When a signal changes, the generator restarts and normally replaces the DOM. To preserve existing DOM and enable surgical updates via reactive bindings, return the `settled` parameter:

```ts
import { html as baseHtml, signal } from "balises";
import { store } from "balises/signals/store";
import asyncPlugin, { type RenderedContent } from "balises/async";

const html = baseHtml.with(asyncPlugin);
const userId = signal(1);
const state = store({ user: null, loading: false });

html`
  ${async function* (settled?: RenderedContent, ctx?: { lastId?: number }) {
    const id = userId.value;
    if (ctx) ctx.lastId = id;

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

</details>

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

## Server-Side Rendering

SSR is opt-in (`balises/ssr` + `balises/hydrate`) and never touches the base bundle: `renderToString` produces the HTML for a template in a DOM-less Node environment, and `hydrate` attaches the same reactive bindings to that HTML on the client - reusing the server markup instead of re-rendering it.

### The workflow

**1. Render** - on the server (or at build time), render the template to a string:

```ts
// server.ts (Node - no DOM needed)
import { html, signal } from "balises";
import { renderToString } from "balises/ssr";

const count = signal(0);
const markup = renderToString(html`<p>Count: ${count}</p>`);
// "<p>Count: <!--b-->0<!--/b--></p>"
```

**2. Ship** - embed the markup and the initial state in the page.

**3. Hydrate** - on the client, build the _same_ template with the _same_ state and call `hydrate`:

```ts
// client.ts
import { html, signal } from "balises";
import { hydrate } from "balises/hydrate";

const count = signal(0); // Restore the state the server rendered with
const template = html`<p>Count: ${count}</p>`; // Same structure as the server
const dispose = hydrate(template, document.querySelector("#app"));
count.value = 5; // Updates the text in place - the server markup is reused
```

<details>
<summary><b>Fetching data</b></summary>

<br/>
Your normal data-loading code runs on the server: `renderToStringAsync` executes each async generator to completion in Node (real fetches happen there) and renders the generator's final content into the HTML. The loading yields are discarded - the shipped page contains the settled result.

On the client, the same generator hydrates that content **without refetching**: the adopted DOM is passed to the generator as its `settled` handle, and returning it preserves the markup. When a tracked signal changes, the generator restarts and fetches fresh - the exact same code path a client-only render takes:

```ts
async function* loadUser(settled) {
  const id = userId.value; // Tracked: a change restarts the generator.
  if (settled) return settled; // Hydration: keep the server-rendered DOM.
  yield html`<p>Loading...</p>`;
  const user = await fetchUser(id); // Runs in Node at build time, in the browser afterwards.
  return html`<p>${user.name}</p>`;
}
```

A complete recipe - the `state` option serializes the listed signals on the server and restores them before hydrating, so no manual JSON plumbing is needed:

```ts
// app.ts - the piece both the server and the browser run
const userId = signal(1);
const user = signal<User | null>(null); // fetched data, restored from the payload

function App() {
  return html`
    <div>
      ${async function* (settled?: unknown) {
        const id = userId.value; // Tracked: changes restart the generator.
        if (settled) return settled; // Hydration: keep the server DOM.
        if (user.value?.id === id) {
          // Data restored from the payload: render it, no fetch.
          return UserCard(user.value);
        }
        yield html`<p>Loading user ${id}...</p>`;
        const u = await fetchUser(id); // Node at build time, browser afterwards.
        user.value = u; // Stored so the payload can carry it.
        return UserCard(u);
      }}
    </div>
  `;
}
```

```ts
// build time (Node) - pass the state to serialize
import { renderToStringAsync } from "balises/ssr";

const { html, payload } = await renderToStringAsync(App(), {
  state: { userId, user }, // anything with a .value: signals, computeds...
});
// ship `html` + <script id="ssr-data" type="application/json">${payload}</script>
```

```ts
// client bootstrap - the state option restores before hydrating
import { hydrate } from "balises/hydrate";

hydrate(App(), document.querySelector("#app"), { state: { userId, user } });
```

Fetching happens in three phases with the same code: the server runs the generators (real fetches in Node); hydration restores the payload state and the generators render from it without refetching; and a tracked-signal change restarts a generator, fetching fresh in the browser. Data the initial render needs goes in the payload; navigation-driven data is refetched by the generator itself; auth/user-specific data stays client-only (fetch after hydration).

For custom restore logic (URLs, localStorage, validation), `serializeState`/`deserializeState` are exported from `balises/ssr` and `balises/hydrate` as the manual building blocks.

</details>

<details>
<summary><b>Sharing state between the server and the client</b></summary>

<br/>
The client must recreate the state the server rendered with, or the markup and the bindings disagree. The `state` option of `renderToString(Async)` / `hydrate` does this automatically for any signal or computed (see "Fetching data" above). The manual equivalent - for custom restore logic around URLs, localStorage or validation:

```ts
// server.ts
import { serializeState } from "balises/ssr";

const markup = renderToString(template);
const page = `<div id="app">${markup}</div>
  <script id="ssr-data" type="application/json">${serializeState({ count: count.value })}</script>`;
```

```ts
// client.ts
import { deserializeState } from "balises/hydrate";

const state = deserializeState<{ count: number }>(
  document.getElementById("ssr-data"),
);
const count = signal(state?.count ?? 0);
hydrate(html`<p>Count: ${count}</p>`, document.querySelector("#app"));
```

Rules of thumb:

- **The route comes from the URL, not the payload.** If the app is addressable (`#/users/42`), the URL hash is the source of truth - the server cannot know it at build time. Reloading such a URL on a page pre-rendered with a different id must show the requested resource (the data loader refetches).
- **Client-only state stays on the client.** Anything in localStorage (preferences, drafts, persisted data): the server renders the defaults and the client restores its own values _before_ hydrating - the bindings pick them up in place (they apply the current value when it differs from the markup).
- **The template must be identical on both sides** - same structure and same plugins (`html.with(...)`). Build both from a shared factory so the markup and the bindings can never drift.

</details>

<details>
<summary><b>Static generation (no server)</b></summary>

<br/>
You don't need a running server - generate the HTML at build time and ship it. `examples/pokemon/` is the client-only app; `examples/pokemon-ssr/` is the exact same code pre-rendered at build time (`yarn examples:build` runs `examples/pokemon/build-html.ts`, which calls `renderToStringAsync` in Node and writes the page). The client entry hydrates when markup is present and renders fresh otherwise:

```ts
const template = buildAppTemplate(stores, service, api);
if (target.firstChild)
  hydrate(template, target); // Pre-rendered page
else target.appendChild(template.render().fragment); // Client-only page
```

</details>

<details>
<summary><b>Async rendering</b></summary>

<br/>
Async generators are supported server-side via `renderToStringAsync`, which runs each generator to completion and renders its final content (the loading yields are discarded):

```ts
import { html as baseHtml, signal } from "balises";
import asyncPlugin from "balises/async";
import { renderToStringAsync } from "balises/ssr";

const html = baseHtml.with(asyncPlugin);
const userId = signal(1);

const markup = await renderToStringAsync(
  html`<div>
    ${async function* () {
      const id = userId.value;
      yield html`<p>Loading...</p>`;
      const user = await fetchUser(id);
      return html`<p>${user.name}</p>`;
    }}
  </div>`,
);
```

On the client the same generator hydrates its settled content without refetching: the adopted DOM is passed to the generator as the `settled` handle - return it to preserve it across restarts (the [DOM Preservation pattern](#dom-preservation-on-restart)).

**Streaming** - `renderToStringStream` emits the HTML progressively instead of waiting for every generator:

```ts
import { renderToStringStream, serializeState } from "balises/ssr";

const stream = renderToStringStream(App());
res.write('<!doctype html><div id="app">');
for await (const chunk of stream) res.write(chunk); // shell first, then each generator's content as it settles
// Read the state after the render completes: generator writes count.
res.write(
  `</div><script id="ssr-data">${serializeState({ user: user.value })}</script>`,
);
```

Chunks are emitted in order of appearance (not resolution order) and every chunk is a text prefix of the final HTML, so the browser parses the page incrementally and content appears as the slowest fetch completes. Stopping iteration early (break/return/throw - e.g. the client disconnected) aborts the render: the generators' context signal fires, cancelling in-flight requests.

</details>

<details>
<summary><b>Writing SSR-compatible components</b></summary>

<br/>
Components are pure `(state, props) -> template` functions; the server executes the same functions in Node, so the rules follow from that.

**1. No browser globals in component bodies.** `window`, `document`, `localStorage`, `navigator`, `new Audio()`, `setTimeout` side effects crash the build or leak in the build process. Events only fire client-side, so referencing the browser from `@click` handlers is fine:

```ts
// SSR-safe: pure function of state -> template
function UserCard({ user, onSelect }) {
  return html`<article @click=${onSelect}>
    <h3>${() => user.name}</h3>
    <p>${() => user.bio}</p>
  </article>`;
}

// Browser-only: crashes server-side
function UserCard({ user }) {
  const el = document.createElement("div"); // ReferenceError in Node
  return html`<div>${user.name}</div>`;
}
```

**2. The template structure must be identical on both sides.** Same tags, static text and plugins (`html.with(...)`). Never branch the structure on the environment; conditional _content_ goes through `match()`/`when()`:

```ts
// Wrong: server sees <p>, client sees <span> - the walk bails and the
// whole subtree re-renders instead of being reused.
return typeof window === "undefined"
  ? html`<p>${user.name}</p>`
  : html`<span>${user.name}</span>`;

// Right: one structure, conditional content through match()/when().
return html`<div>${user.name}</div>`;
```

**3. Data loading lives in async generators** (see "Fetching data" above), not in `effect()` or `connectedCallback` - those run in Node at build time with no server path, so the SSR page would show the empty/loading state:

```ts
// Right: the generator is the only loading shape with a server path.
return html`<div>
  ${async function* (settled) {
    const id = userId.value;
    if (settled) return settled;
    if (user.value?.id === id) return UserCard(user.value);
    yield html`<p>Loading...</p>`;
    const u = await fetchUser(id);
    user.value = u;
    return UserCard(u);
  }}
</div>`;

// Wrong: this effect runs in Node at build time and never affects the
// server-rendered markup.
effect(() => {
  fetchUser(userId.value).then((u) => (user.value = u));
});
return html`<div>${UserCard(user)}</div>`;
```

**4. Client-only values never shape the template.** The server renders defaults; restore localStorage/auth state _before_ hydrating and the bindings converge in place:

```ts
// Wrong: reads the browser at component-build time (and the structure
// would differ between server and client).
function Header() {
  const lang = localStorage.getItem("lang") ?? "en";
  return html`<p>${lang === "en" ? "Hello" : "Bonjour"}</p>`;
}

// Right: the value is reactive state restored before hydrating.
function Header({ lang }) {
  return html`<p>${() => (lang.value === "en" ? "Hello" : "Bonjour")}</p>`;
}
```

**5. Use valid HTML nesting.** The browser parser restructures invalid nesting (a `<button>` inside a `<button>`, a `<div>` inside a `<table>`), the walk detects the mismatch and re-renders the subtree - correct, but the server markup is not reused. Valid nesting keeps the reuse.

**6. Keep custom elements thin.** They are browser-only shells: restore state, then `hydrate(template, this)` or render fresh, with the template coming from a shared factory both sides import:

```ts
// app.ts - imported by Node AND the browser
export function createApp(stores) {
  return html`<div>${/* ... */}</div>`;
}
```

```ts
// element.ts - browser only
class MyApp extends HTMLElement {
  connectedCallback() {
    const template = createApp(this.#stores);
    if (this.firstChild) hydrate(template, this);
    else this.appendChild(template.render().fragment);
  }
}
```

</details>

### What works

- Text, reactive attributes, `.prop` properties and `@event` listeners (the last two render nothing server-side and are attached during hydration)
- Nested templates and arrays
- `each()` keyed lists - rows hydrate in place and keep their identity across list updates
- `when()`/`match()` branches and `memo()` components - the server renders the active branch
- Async generators with `renderToStringAsync` and progressive HTML via `renderToStringStream`

### Notes

- The rendered HTML contains `<!--b-->`/`<!--/b-->` marker comments that locate the bindings - don't strip them. If the markup does not match the template (markers stripped, structure changed since the build), `hydrate()` falls back to a fresh render of the subtree - the client always wins, exactly like a client-only render.
- `renderToString` throws on async generators - use `renderToStringAsync` or `renderToStringStream`.
- Call `dispose()` when removing a hydrated subtree to release all subscriptions.
- Zero runtime dependencies; the SSR modules are tree-shaken out of the main bundle (`balises` stays ~3.4 KB gzipped).

## Hot Module Replacement

HMR is opt-in (`balises/hmr`) and dev-only. The `mount()` module never touches `import.meta.hot`, and the slot re-binding machinery it relies on is **compiled out of production bundles**: the core renderer guards it with `process.env.NODE_ENV`, which bundlers replace statically — production builds fold it away (~3.4 KB gzipped total; dev builds carry an extra ~0.4 KB). Mount templates with `mount()` and hot reloads update the DOM in place — no page reload, no framework runtime, and no Fast Refresh plugin required. (The modular `balises/*` imports assume a bundler or Node; the pre-built bundle and IIFE are ready for script-tag/import-map use.)

```ts
// app.ts
import { html, signal } from "balises";
import { mount } from "balises/hmr";

const count = signal(0);
mount(
  document.querySelector("#app")!,
  html` <button @click=${() => count.update((n) => n + 1)}>${count}</button> `,
);

// Vite: opt in to hot updates for this module
import.meta.hot?.accept();
```

### How it works

- `mount(container, template)` renders the template into the container and records the render in a registry keyed by container. When the module re-executes (the hot reload), calling `mount()` again with the same container re-binds the previous render in place. In production builds `mount()` is simply render + append + dispose — the re-binding machinery is compiled out, and since modules never re-execute, the registry is inert. It lives in `balises/hmr` rather than the main entry purely for tree-shaking (the registry and the dev-only re-binding are only worth shipping to users who want HMR); importing it is safe and idiomatic in production too.
- **Only changed slots update.** Slots whose value changed are re-bound individually — text, attributes, properties, and event handlers — while the rest of the DOM keeps its nodes, focus, and scroll position. This applies recursively to nested templates: a child component with an unchanged source re-binds its own slots, so editing a sibling (or the parent) leaves it untouched.
- **Signal state is preserved.** When a slot's value was a signal and the new module provides a fresh instance, the old value is carried into the new instance before binding — state wins over initial values, exactly like React Fast Refresh. The new instance is the live one, so subsequent updates flow through the new module's code.
- **Changed template source** (the static markup differs) falls back to replacing the whole region in place, disposing the old subscriptions.
- `mount()` returns an idempotent dispose function that removes the nodes, releases the subscriptions, and unregisters the render.

### What still resets on a reload

- **Derived values recompute.** A `computed()` slot (or a function slot) re-evaluates against the new module's inputs — if its underlying signal is also module-scope, that signal starts at its initial value. Bind signals directly to preserve their state, or hoist the signal into a separate module.
- **Plugin-wrapped state.** `each()` lists and `memo()` props are wrapped inside descriptors created at module scope; the slot re-renders with the fresh descriptor, so mutations to a module-scope list signal are not carried over. Hoist the list signal to keep rows, or accept the re-render (rows are rebuilt in place, siblings untouched).
- **Module-scope `effect()`s** are not covered by `mount()` — dispose them on reload with `import.meta.hot?.dispose(() => cleanup())` to avoid orphaned subscriptions.

## Template Syntax

<details>
<summary><b>Click to expand</b></summary>

<br/>

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

```ts
import { html as baseHtml, signal } from "balises";
import eachPlugin, { each } from "balises/each";

const html = baseHtml.with(eachPlugin);

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
```

Signature:

```ts
each(list, keyFn, renderFn); // keyFn extracts key, renderFn receives ReadonlySignal<T>
```

**Important:** Access item properties through `itemSignal.value` and wrap in `() => ...` for reactive updates.

### Conditional Rendering with `when()` and `match()`

When conditionally rendering content, a naive approach re-creates templates on every change, even when the condition result stays the same. Use `when()` and `match()` for conditional rendering where branches are rendered based on the selector's **result**, not the underlying data.

**Note:** Import from `balises/match` and use `html.with(matchPlugin)` to enable.

```ts
import { html as baseHtml } from "balises";
import { store } from "balises/signals/store";
import matchPlugin, { when } from "balises/match";

const html = baseHtml.with(matchPlugin);
const state = store({ user: null });

html`
  ${when(
    () => !!state.user,
    [
      () => html`<Profile>${() => state.user.name}</Profile>`,
      () => html`<LoginPrompt />`,
    ],
  )}
`.render();

// When user changes from Alice to Bob, !!state.user stays true
// so the Profile branch is REUSED (not recreated)
state.user = { name: "Alice" };
state.user = { name: "Bob" }; // Same branch, just updates the name binding
```

The second argument is an array `[ifTrue, ifFalse?]`. If `ifFalse` is omitted, renders nothing when false.

For multiple cases, use `match()`:

```ts
import matchPlugin, { match } from "balises/match";

const status = signal<"idle" | "loading" | "error" | "success">("idle");

html`
  ${match(() => status.value, {
    idle: () => html`<IdleState />`,
    loading: () => html`<Spinner />`,
    error: () => html`<ErrorMessage />`,
    success: () => html`<content />`,
    _: () => html`<Fallback />`, // Optional default case
  })}
`.render();
```

By default, branches are disposed when switching away (freeing memory). For scenarios where you want instant switching back (like tabs), use `{ cache: true }`:

```ts
html`
  ${match(
    () => state.activeTab,
    {
      home: () => html`<Home />`,
      settings: () => html`<Settings />`,
    },
    { cache: true }, // Keep branches in memory for instant switching
  )}
`.render();

// With cache: true, switching back reuses the same DOM nodes
state.activeTab = "settings"; // Creates Settings
state.activeTab = "home"; // Creates Home
state.activeTab = "settings"; // Reuses cached Settings (same DOM!)
```

Reactive bindings inside branches continue to work normally regardless of caching.

</details>

## Reactivity API

<details>
<summary><b>Click to expand</b></summary>

<br/>

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

**Note:** `store` is a separate module to keep the core bundle minimal — import it from `balises/signals/store`:

```ts
import { store } from "balises/signals/store";
```

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

**Note:** `delete` is a structural operation, not a reactive one. Deleting a property removes it (`"key" in state` becomes `false`, reads return `undefined`), but existing computeds that depended on it keep their last value until disposed. To remove a property reactively, set it to `undefined` instead:

```ts
state.user = undefined; // ✅ Triggers reactivity
delete state.user; // ❌ Structural removal, no notification
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

### `.is(value)`

Checks equality with O(1) update performance - ideal for selection patterns.

When you have a signal representing a selected item (like `selectedId`), using `.is()` inside computed/templates creates optimized subscriptions. Only computeds checking the **previous** or **new** value are notified on change, not all of them.

```ts
import { html, signal } from "balises";

const selected = signal<number | null>(null);

// In a list of 1000 rows, only 2 rows update when selection changes
// (the previously selected and newly selected)
function Row({ id, label }) {
  return html`
    <tr class=${() => (selected.is(id) ? "danger" : "")}>
      <td>${id}</td>
      <td>${label}</td>
    </tr>
  `;
}

selected.value = 5; // Only row 5 gets "danger" class
selected.value = 10; // Only rows 5 and 10 update
```

Works on both `Signal` and `Computed`. Uses `Object.is()` for equality checks.

### `.dispose()`

Stops a computed from tracking dependencies and frees memory.

```ts
const doubled = computed(() => count.value * 2);
doubled.dispose(); // Stops tracking, frees memory
```

After dispose, reading `.value` returns the last computed value, but the computed is no longer part of the reactive graph — it never updates, never notifies, and cannot be tracked as a new dependency.

</details>

## Tree-Shaking / Modular Imports

You can import just what you need to keep bundle size down:

```ts
// Full library (~3.4KB gzipped)
import { html, signal, computed, effect } from "balises";

// Signals only (no HTML templating - use in any JS project)
import { signal, computed, effect, store, batch, scope } from "balises/signals";

// Individual modules
import { signal } from "balises/signals/signal";
import { computed } from "balises/signals/computed";
import { effect } from "balises/signals/effect";
import { store } from "balises/signals/store";
import { batch, scope } from "balises/signals/context";

// Server-side rendering (opt-in - never part of the main bundle)
import {
  renderToString,
  renderToStringAsync,
  renderToStringStream,
} from "balises/ssr";
import { hydrate } from "balises/hydrate";

// Hot module replacement (opt-in - dev-only, never part of the main bundle)
import { mount } from "balises/hmr";
```

### Template Plugins

The `each()`, `when()`/`match()`, `memo()`, and async generator features are provided as opt-in plugins to keep the base bundle minimal. Use `html.with()` to compose plugins:

```ts
// With each() support for keyed lists
import { html as baseHtml } from "balises";
import eachPlugin, { each } from "balises/each";

const html = baseHtml.with(eachPlugin);

// With when()/match() for cached conditional rendering
import { html as baseHtml } from "balises";
import matchPlugin, { when, match } from "balises/match";

const html = baseHtml.with(matchPlugin);

// With async generator support
import { html as baseHtml } from "balises";
import asyncPlugin from "balises/async";

const html = baseHtml.with(asyncPlugin);

// With multiple plugins
import { html as baseHtml } from "balises";
import eachPlugin, { each } from "balises/each";
import matchPlugin, { when, match } from "balises/match";
import asyncPlugin from "balises/async";
import memoPlugin, { memo } from "balises/memo";

const html = baseHtml.with(eachPlugin, matchPlugin, asyncPlugin, memoPlugin);
```

## Writing Plugins

<details>
<summary><b>Click to expand</b></summary>

<br/>

A plugin teaches the template system how to handle a new type of interpolated value. The built-in `each`, `async`, `memo`, and `match` features are all plugins - there's nothing special about them.

### The plugin interface

A plugin is a function that receives an interpolated value and either returns `null` (not my thing) or a binder function that owns the slot. Here's a plugin that renders `Date` objects as formatted strings:

```ts
import { html as baseHtml } from "balises";
import { type InterpolationPlugin } from "balises/template";

const datePlugin: InterpolationPlugin = (value) => {
  // Return null if you don't handle this value.
  if (!(value instanceof Date)) return null;

  // Return a binder function to own this slot.
  return (marker, disposers) => {
    // `marker` is a Comment node - insert content before it.
    const text = document.createTextNode(value.toLocaleDateString());
    marker.parentNode!.insertBefore(text, marker);
    // Push cleanup functions to `disposers` — required when the plugin
    // might run in the reactive path (e.g. `${() => new Date()}`),
    // otherwise nodes would accumulate on each re-evaluation.
    disposers.push(() => text.remove());
  };
};

const html = baseHtml.with(datePlugin);
html`<p>Today is ${new Date()}</p>`.render();
```

A binder can return `false` to signal "skip clearing — preserve existing DOM". This is used internally by the memo plugin. Most plugins should not return `false`.

That's the whole contract. First plugin to return a binder wins.

### How it works

Plugins are checked in two situations:

1. **Static path** - when the raw interpolated value is not a function/signal/primitive. The plugin's binder runs once and any disposers it pushes run on template `dispose()`.

2. **Reactive path** - when a function like `${() => myValue()}` produces a value that a plugin handles. The template system wraps the function in a `computed`, and on each re-evaluation it checks plugins against the new value. Disposers pushed by the binder are automatically captured and run before the next update (or on dispose).

You don't need to worry about which path you're in - push your cleanup to `disposers` and the template system handles the rest.

### The binder function

The binder receives two arguments:

- **`marker: Comment`** - a comment node in the DOM that marks where your content goes. Always insert before it: `parent.insertBefore(node, marker)`.
- **`disposers: (() => void)[]`** - push any cleanup functions here (removing nodes, unsubscribing, clearing caches, etc).

### Using `renderValue`

If your plugin produces a value that could be a `Template`, a string, an array, or `null`, use the `renderValue` helper instead of reimplementing the logic:

```ts
import { renderValue, type InterpolationPlugin } from "balises/template";

const myPlugin: InterpolationPlugin = (value) => {
  if (!isMyThing(value)) return null;

  return (marker, disposers) => {
    const nodes: Node[] = [];
    const childDisposers: (() => void)[] = [];

    // Transform the value somehow, then render the result
    const result = transform(value);
    renderValue(marker, result, nodes, childDisposers);

    // Push cleanup
    disposers.push(() => {
      for (const d of childDisposers) d();
      for (const n of nodes) (n as ChildNode).remove();
    });
  };
};
```

`renderValue` handles `Template` instances (calls `.render()`), arrays (flattened one level), primitives (text nodes), and `null`/`undefined`/`boolean` (renders nothing). It pushes created nodes into `nodes` and template disposers into `childDisposers`.

### Descriptor pattern

Most plugins follow the same pattern: a factory function creates a descriptor object branded with a `Symbol`, and the plugin detects that symbol. The `async` plugin is the exception — it auto-detects `async function*` values directly instead of using a descriptor.

```ts
const MY_THING = Symbol("myThing");

interface MyDescriptor {
  [MY_THING]: true;
  data: string;
}

export function myThing(data: string): MyDescriptor {
  return { [MY_THING]: true, data };
}

const myPlugin: InterpolationPlugin = (value) => {
  if (!(value && typeof value === "object" && MY_THING in value)) return null;
  const desc = value as MyDescriptor;

  return (marker, disposers) => {
    // Use desc.data to render
  };
};

export default myPlugin;
```

This keeps the detection cheap (symbol lookup) and lets you carry structured data from the call site to the binder.

### Things to watch out for

- **Insert before the marker**, not after. Inserting after would break ordering with subsequent slots.
- **`marker.parentNode` can be `null`** if the marker is in a detached fragment (e.g., a cached but hidden `when()` branch). The `each` plugin handles this by retrying via `queueMicrotask`.
- **First plugin wins.** If two plugins could match the same value, only the first one registered via `.with()` gets it.
- **Internal reactivity is your job.** If your plugin needs to react to signal changes, set up your own `computed`/`subscribe` calls inside the binder. The template system won't wrap your plugin's output in a computed.
- **`html.with()` returns a new tag.** You must assign the result: `const html = baseHtml.with(myPlugin)`. Calling `html.with(myPlugin)` without capturing the return value has no effect.

</details>

## Using as a Standalone Signals Library

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

<details>
<summary><b>Click to expand</b></summary>

<br/>

```ts
import { html, computed } from "balises";
import { store } from "balises/signals/store";

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
│ #1 🏆 │ preact@1.14.4     │ 0.005 │ 48.43         │ 1.00x (baseline) │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #2    │ balises@0.11.0    │ 0.005 │ 78.28         │ 1.62x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #3    │ vue@3.5.40        │ 0.043 │ 67.57         │ 1.40x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #4    │ maverick@6.0.0    │ 0.097 │ 105.83        │ 2.19x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #5    │ usignal@0.10.0    │ 0.108 │ 105.44        │ 2.18x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #6    │ angular@22.1.0    │ 0.123 │ 122.92        │ 2.54x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #7    │ solid@1.9.14      │ 0.200 │ 245.17        │ 5.06x            │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #8    │ hyperactiv@0.11.3 │ 0.347 │ 796.45        │ 16.45x           │
├───────┼───────────────────┼───────┼───────────────┼──────────────────┤
│ #9    │ mobx@7.0.0        │ 1.000 │ 4304.54       │ 88.88x           │
└───────┴───────────────────┴───────┴───────────────┴──────────────────┘
```

### Performance by Scenario

```
┌───────────────────┬───────────────┬─────────────┬────────────────┬────────────────────┬─────────────┬──────────────┬──────────────────────────────┬──────────┐
│ Library           │ S1: 1: Layers │ S2: 2: Wide │ S3: 3: Diamond │ S4: 4: Conditional │ S5: 5: List │ S6: 6: Batch │ S7: Signal Creation Overhead │ Avg Rank │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────────────────────────┼──────────┤
│ preact@1.14.4     │ #1 🏆         │ #2          │ #2             │ #1 🏆              │ #1 🏆       │ #5           │ #2                           │ 2.0      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────────────────────────┼──────────┤
│ balises@0.11.0    │ #4            │ #1 🏆       │ #1 🏆          │ #2                 │ #2          │ #2           │ #1 🏆                        │ 1.9      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────────────────────────┼──────────┤
│ vue@3.5.40        │ #2            │ #3          │ #3             │ #3                 │ #3          │ #4           │ #3                           │ 3.0      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────────────────────────┼──────────┤
│ maverick@6.0.0    │ #6            │ #4          │ #5             │ #4                 │ #4          │ #3           │ FAIL                         │ 4.3      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────────────────────────┼──────────┤
│ usignal@0.10.0    │ #3            │ #5          │ #4             │ #5                 │ #5          │ #6           │ FAIL                         │ 4.7      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────────────────────────┼──────────┤
│ angular@22.1.0    │ #5            │ #6          │ #6             │ #6                 │ #6          │ #1 🏆        │ FAIL                         │ 5.0      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────────────────────────┼──────────┤
│ solid@1.9.14      │ #7            │ #7          │ #7             │ #7                 │ #7          │ #7           │ #4                           │ 6.6      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────────────────────────┼──────────┤
│ hyperactiv@0.11.3 │ #8            │ #8          │ #8             │ #8                 │ #8          │ #8           │ FAIL                         │ 8.0      │
├───────────────────┼───────────────┼─────────────┼────────────────┼────────────────────┼─────────────┼──────────────┼──────────────────────────────┼──────────┤
│ mobx@7.0.0        │ #9            │ #9          │ #9             │ #9                 │ #9          │ #9           │ FAIL                         │ 9.0      │
└───────────────────┴───────────────┴─────────────┴────────────────┴────────────────────┴─────────────┴──────────────┴──────────────────────────────┴──────────┘
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

_Last updated: 2026-08-04_

<!-- BENCHMARK_RESULTS_END -->

</details>

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
