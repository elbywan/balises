# AGENTS.md

Balises is a minimal reactive HTML templating library (~3.3KB gzipped, zero
dependencies): signals + tagged-template DOM rendering with opt-in plugins
for keyed lists, conditionals, memoization, and async generators. A personal
side project — limited maintenance guarantees.

## Philosophy

- **Minimal API surface.** Every primitive must earn its place; prefer
  composition and boring solutions over new abstractions.
- **Bundle size is a feature.** The IIFE must stay under ~3.5KB gzipped (CI
  warns above 3500 bytes). Avoid avoidable allocations and copies in hot
  paths (subscription notification, recompute).
- **Reactivity is subtle.** Tracking, batching, disposal, `.is()` slots, and
  detached-marker handling have sharp edges that only tests catch. Fix bugs
  test-first: every behavioral change ships with a regression test that
  fails before the fix.
- **Zero dependencies, standards-based.** Works with Web Components and
  vanilla JS; no framework opinions.
- **Keep docs honest.** README is the public contract — update it with every
  API change, and keep size claims in line with measured reality.

## Architecture

- `src/signals/` — reactivity core: `Signal`, lazy `Computed` (dirty flags,
  index-based source tracking: dependencies are read in the same order every
  run), `effect` (computed + auto-subscription), `store` (proxy wrapper, own
  module), `batch`, `scope`.
- `src/parser.ts` — streaming state-machine parser (no AST). `src/template.ts`
  — templates cached by `TemplateStringsArray` identity, binding descriptors,
  `html.with()` plugin dispatch.
- **Plugins** (`each`, `match`, `memo`, `async`) — opt-in subpath modules,
  never imported by the main entry (tree-shaking keeps them out of the IIFE).
  Pattern: factory → `Symbol`-branded descriptor; binder `(marker,
disposers)`; a binder returning `false` means "skip clearing, preserve
  DOM". Memo's per-marker cache and the detached-marker retries are the
  subtlest parts — change with care.
- **SSR** (`src/ssr.ts`, `src/hydrate.ts`, `balises/ssr`, `balises/hydrate`)
  — opt-in, tree-shaken, zero deps. `renderToString(Async)` emit slot
  markers `<!--b-->…<!--/b-->` (close = anchor) and `<!--k-->` row
  separators; `hydrate()` walks the SSR DOM in lockstep with the template
  parse. State protocol: URL/localStorage are authoritative, only
  non-derivable data is serialized. Region clears MUST walk backward from
  the anchor to the region boundary (`clearRegion`) — forward walks break
  when a concurrent render detaches the start node. Run `yarn ssr:smoke`
  (22 jsdom e2e checks) after touching any of this.
- **HMR** (`src/hmr.ts`, `balises/hmr`) — opt-in, dev-only, bundler-agnostic
  (never touches `import.meta.hot`). `mount(container, template)` renders
  and registers per-container; repeated mounts replace in place (new nodes
  inserted before the old region, old range removed, old disposers run).
  Module re-execution is the only update signal.
- `package.json` `exports` mirrors the module layout; `store` is not part of
  the main entry.

## Behavioral contracts worth knowing

- `each()` render functions receive a `ReadonlySignal<T>` — unwrap via
  `.value` inside reactive wrappers; capture static fields with `peek()`.
- Store arrays must be reassigned, not mutated; `delete` is structural, not
  reactive (`state.x = undefined` is the reactive removal).
- Disposed computeds are graph-inert: they keep their last value but never
  update, notify, or gain new dependents.

## Conventions

- Strict TS: `noUncheckedIndexedAccess` (array access needs `!` or checks),
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax` (imports use `.js`),
  private state via `#field`.
- Tests: node:test + jsdom (`tests/setup.ts`), one file per module; GC/memory
  suites use real V8 GC (`tests/gc-utils.ts`).
- Commits: `feat:` / `fix:` / `chore:` / `refactor:` style.
- Generated output (`dist/`, `_site/`) is never edited by hand.

## Environment & commands

Node/Yarn come from the proto toolchain — prefix commands with
`proto run yarn -- ...` (plain `yarn` is not on PATH). PnP: no `node_modules`.

```bash
yarn test              # full suite
yarn typecheck         # src + tests + examples
yarn lint && yarn format
yarn build             # tsc + rolldown → dist/
yarn docs:build        # builds the docs site to _site/
```
