# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.12.0] - 2026-08-06

### Added

#### Hot module replacement (`balises/hmr`)

`mount(container, template)` renders a root template; when a hot reload re-executes the module, it re-binds the previous render **in place** instead of rebuilding it:

```ts
import { html, signal } from "balises";
import { mount } from "balises/hmr";

const count = signal(0);
mount(
  document.querySelector("#app")!,
  html`<button @click=${() => count.update((n) => n + 1)}>${count}</button>`,
);
// Vite: opt in to hot updates for this module
import.meta.hot?.accept();
```

On a hot reload only changed slots update (text, attributes, properties, events), signal state is carried into fresh module-scope instances ("state wins", like React Fast Refresh), and nested templates re-bind recursively so child components survive edits to siblings. A changed template source falls back to an in-place region replace. In production, `mount()` is simply render + append + dispose.

#### HMR playground and documentation

- `examples/hmr`: a Vite playground demonstrating the real-app shape — one root `mount()`, imported component modules, live state/focus/DOM preservation.
- README sections for Mounting and Hot Module Replacement; the docs site gains an HMR feature card and a `mount()` API entry.

### Changed

#### Production bundles compile out the machinery

The slot re-binding machinery is gated by `process.env.NODE_ENV` and folded out of production builds (main bundle ~3.4 KB gzipped; +76 B of `@internal` API residue remains).

### Fixed

- The dev-mode guard now works in bundled browsers (a `typeof process` prefix disabled the machinery everywhere a bundler had replaced `process.env.NODE_ENV`).
- `mount()` re-renders from scratch when the container was cleared externally, even with an unchanged template source.

## [0.11.0] - 2026-08-04

### Added

#### Abortable async generators

Every generator run gets a fresh `ctx.signal` that aborts when the generator restarts, is disposed, or a stream consumer stops early — wire requests to it so in-flight work is cancelled:

```ts
html`
  ${async function* (settled, ctx) {
    const id = userId.value; // Tracked: changes restart the generator
    const user = await fetch(`/api/users/${id}`, {
      signal: ctx?.signal, // Cancelled on restart/dispose/stream stop
    }).then((r) => r.json());
    return html`<div>${user.name}</div>`;
  }}
`;
```

#### Streaming SSR (`renderToStringStream`)

`renderToStringStream` emits HTML progressively — the shell first, then each generator's content as it settles:

```ts
import { renderToStringStream } from "balises/ssr";

const stream = renderToStringStream(App());
res.write('<!doctype html><div id="app">');
for await (const chunk of stream) res.write(chunk);
```

State is serialized after the render; the stream API was made leaner.

### Fixed

- Error propagation and cancellation paths for the stream (superseded runs, disposal before errors).
- Docs site: responsive on mobile, and all imports come from a single build of the library.

## [0.10.0] - 2026-08-03

### Added

#### Server-side rendering with hydration

`renderToString` produces the HTML in a DOM-less Node environment; `hydrate` reuses the server markup on the client instead of re-rendering it:

```ts
// server.ts
import { renderToString, serializeState } from "balises/ssr";

const markup = renderToString(template);
const page = `<div id="app">${markup}</div>
  <script id="ssr-data" type="application/json">${serializeState({ count: count.value })}</script>`;
```

```ts
// client.ts
import { deserializeState } from "balises/hydrate";

const state = deserializeState(document.getElementById("ssr-data")!);
const count = signal(state.count);
const dispose = hydrate(template, document.querySelector("#app"));
count.value = 5; // Updates the text in place — the server markup is reused
```

#### Automatic state hand-off

The `state` option on the SSR render functions serializes non-derivable signal values for the client; `serializeState`/`deserializeState` are exported from the entry modules.

## [0.9.0] - 2026-08-03

### Added

#### `memo()` component memoization

Opt-in `balises/memo` plugin — components re-render only when their props change:

```ts
const Counter = memo(({ count }) => {
  console.log("Counter rendered"); // Only logs when props change
  return html`<div>Count: ${count}</div>`;
});
```

#### `store()` as a subpath

`store()` moved to the opt-in `balises/signals/store` subpath, out of the main entry:

```ts
import { store } from "balises/signals/store";
```

## [0.8.5] - 2026-01-26

### Fixed

- `each()` inside `when()`/`match()` branches with `cache: true` (detached-marker retry).

## [0.8.4] - 2026-01-26

### Added

#### `match()` and `when()`

Conditional rendering (opt-in `balises/match` plugin) — branches are reused while the condition result stays the same, and `{ cache: true }` keeps hidden branches in memory for instant switching:

```ts
html`${when(() => show.value, [
  () => html`<div>Visible</div>`,
  () => html`<div>Hidden</div>`,
])}`;

html`${match(() => state.tab, {
  home: () => html`<div>Home</div>`,
  settings: () => html`<div>Settings</div>`,
  _: () => html`<div>Not found</div>`,
})}`;
```

## [0.8.3] - 2026-01-21

### Added

#### Async generator context

A fresh `AbortSignal` per run, aborted on restart or dispose (see [0.11.0](#0110---2026-08-04) for the full pattern).

## [0.8.2] - 2026-01-19

### Fixed

- `each()` with empty item templates (rows now get a placeholder so the region stays addressable).
- `each()` no longer removes sibling nodes outside its region.
- Computeds stay dirty after errors instead of caching a stale value — a computed that threw recomputes on the next read instead of returning the last good value.

## [0.8.1] - 2026-01-11

### Changed

- Bundle size reduced to under 3.3 KB gzipped.
- `each()` internals cleaned up and simplified.

## [0.8.0] - 2026-01-10

### Changed

- Bulk DOM removal (`replaceChildren`) for faster `each()` clearing.

### Fixed

- Computed subscriber array copied before notification (safe self-unsubscription).

## [0.7.2] - 2026-01-07

### Fixed

- `each()` reordering for rows spanning multiple nodes.

## [0.7.1] - 2026-01-07

### Fixed

- `each()` reconciliation edge case (skip LIS when all elements are new).

## [0.7.0] - 2026-01-05

### Added

#### Keyed `each()` lists

Opt-in `balises/each` plugin — rows are reconciled by key instead of recreated, so reordering, adding, or removing items keeps existing DOM:

```ts
import { html as baseHtml } from "balises";
import eachPlugin, { each } from "balises/each";

const html = baseHtml.with(eachPlugin);
html`<ul>${each(items, (i) => i.id, (item) => html`<li>${item.name}</li>`)}</ul>`;
```

## [0.6.0] - 2026-01-04

### Added

#### Plugin system

`html.with(...plugins)` composes opt-in interpolation plugins; async generators were externalized to `balises/async`:

```ts
import { html as baseHtml } from "balises";
import asyncPlugin from "balises/async";

const html = baseHtml.with(asyncPlugin);
```

### Fixed

- Potential infinite loop in signal notification.

## [0.5.0] - 2026-01-04

### Changed

- Nested effects/computeds are disposed automatically on re-run (no more manual cleanup inside reactive functions).

## [0.4.1] - 2025-12-31

### Changed

- Byte golfing pass; Prettier config added.

## [0.4.0] - 2025-12-31

### Changed

- Documentation and examples overhaul; `AGENTS.md` added.

## [0.3.0] - 2025-12-30

### Added

#### `scope()`

Groups reactive primitives for disposal together:

```ts
const dispose = scope(() => {
  const a = computed(() => ...);
  const b = effect(() => ...);
});
dispose(); // disposes both
```

Type checking added to CI.

## [0.2.1] - 2025-12-29

### Added

#### `effect()` and `update()`

`effect()` for eager side effects, `update()` for functional signal writes:

```ts
const count = signal(0);
count.update((n) => n + 1); // functional update
const dispose = effect(() => console.log(count.value));
```

### Fixed

- Exception when disposing a computed.

## [0.2.0] - 2025-12-29

### Changed

- Simpler signals implementation; licence added.

## [0.1.0] - 2025-12-29

### Added

#### Initial release

Reactive signals and tagged-template HTML rendering:

```ts
import { html, signal } from "balises";

const count = signal(0);
const { fragment, dispose } = html`
  <button @click=${() => count.update((n) => n + 1)}>${count}</button>
`.render();
document.body.appendChild(fragment);
```
