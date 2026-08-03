/**
 * Client-side hydration for server-rendered balises markup.
 *
 * `hydrate(template, target)` attaches reactive bindings to DOM produced
 * by `renderToString` (from "balises/ssr") without re-rendering: the
 * server markup is reused, and subsequent signal changes update it.
 *
 * The SSR output format (see src/ssr.ts) wraps every content slot in
 * `<!--b-->` ... `<!--/b-->` markers, where the close marker doubles as
 * the binding anchor (content sits before it, matching the client's
 * `insertBefore(anchor)` semantics). `each()` rows are separated by
 * `<!--k-->` markers.
 *
 * Plugin descriptor types (each/match/memo/async) register hydration
 * handlers at module load via `registerHydrateHandler`, so this module
 * - and the core bundle - stays free of the plugin modules.
 */

import { HTMLParser } from "./parser.js";
import {
  Template,
  renderValue,
  wrapFn,
  bind,
  VOID_ELEMENTS,
} from "./template.js";
import { isSignal, type Reactive } from "./signals/index.js";
import { SSR_OPEN, SSR_CLOSE, ssrTemplateData } from "./ssr-shared.js";
import { deserializeState } from "./ssr-state.js";
import { MEMO, MATCH } from "./descriptors.js";

/**
 * Hydration callback for a plugin descriptor value: the handler receives
 * the slot region (between `contentStart` and the `anchor` comment) and
 * `recurse` to re-enter slot-value hydration for nested content. @internal
 */
export type HydrateFn = (
  contentStart: Node | null,
  anchor: Comment,
  disposers: (() => void)[],
  recurse: HydrateRecurse,
) => boolean;

/** Re-enter slot-value hydration for a value. @internal */
export type HydrateRecurse = (
  value: unknown,
  contentStart: Node | null,
  anchor: Comment,
  disposers: (() => void)[],
) => boolean;

/**
 * Remove everything currently sitting between a region's boundary (the
 * node before its open marker, which never gets removed by region
 * renders) and its anchor. Region clears MUST walk backward from the
 * anchor: a forward walk from a captured start node breaks once a
 * concurrent render detaches that node (its `nextSibling` becomes null
 * and the loop exits immediately), leaving stale content behind. @internal
 */
export function clearRegion(boundary: Node | null, anchor: Node): void {
  let current: Node | null = anchor.previousSibling;
  while (current && current !== boundary) {
    const prev: Node | null = current.previousSibling;
    (current as ChildNode).remove();
    current = prev;
  }
}

/**
 * Registry of hydration handlers for plugin descriptor types
 * (each/match/memo/async). Plugins register at module load, so the
 * core bundle stays free of the plugin modules. @internal
 */
const hydrateHandlers: ((value: unknown) => HydrateFn | null)[] = [];

/** @internal Register a hydration handler for a descriptor type. */
export function registerHydrateHandler(
  handler: (value: unknown) => HydrateFn | null,
): void {
  hydrateHandlers.push(handler);
}

function getHydrateHandler(value: unknown): HydrateFn | null {
  for (const handler of hydrateHandlers) {
    const fn = handler(value);
    if (fn) return fn;
  }
  return null;
}

/** Walk server-rendered DOM in lockstep with a template's structure.
 *  @internal Exported for plugin hydration (e.g. each rows). */
/** Result of a hydration walk: whether the template aligned with the
 *  server markup, and the node the walk ended on (for chained walks). */
export interface HydrateWalkResult {
  aligned: boolean;
  end: Node | null;
}

export function hydrateWalk(
  tpl: Template,
  startNode: Node | null,
  disposers: (() => void)[],
): HydrateWalkResult {
  const data = ssrTemplateData.get(tpl);
  if (!data) {
    throw new Error(
      "This template was created by a different balises build - import html and hydrate from the same package entry.",
    );
  }
  const [strings, values] = data;
  let cursor = startNode;
  let aligned = true;
  const elementStack: Element[] = [];
  const recurse: HydrateRecurse = (value, contentStart, anchor, d) => {
    return hydrateSlotValue(tpl, value, contentStart, anchor, d, recurse);
  };

  new HTMLParser().parseTemplate(strings, {
    onText: (text) => {
      // The SSR emits one text node per static chunk, but adjacent
      // chunks (e.g. split by template comments) merge into a single
      // DOM text node - only advance when the cursor is on a text node.
      // Static text is compared (whitespace-tolerantly) so a template
      // that does not match the server markup - e.g. a different
      // match() branch after a reload - is detected and re-rendered
      // fresh instead of being half-bound onto the wrong DOM.
      if (cursor && cursor.nodeType === 3) {
        const chunk = text.trim();
        if (chunk && !(cursor as Text).data.trim().startsWith(chunk)) {
          aligned = false;
        }
        cursor = cursor.nextSibling;
      }
    },

    onOpenTag: (tag, attrs, selfClose) => {
      // Advance to the next element.
      while (cursor && cursor.nodeType !== 1) cursor = cursor.nextSibling;
      const el = cursor as Element | null;
      if (!el) {
        aligned = false;
        return;
      }
      // The element must match the template's tag, or the server markup
      // belongs to a different structure (e.g. another match branch).
      if (el.tagName.toLowerCase() !== tag) {
        aligned = false;
        return;
      }

      for (const [name, statics, slots] of attrs) {
        if (!slots.length) continue;
        const c = name[0];
        if (c === "@") {
          // Events render nothing on the server - attach now.
          const handler = values[slots[0]!] as EventListener;
          el.addEventListener(name.slice(1), handler);
          disposers.push(() => el.removeEventListener(name.slice(1), handler));
        } else if (c === ".") {
          // Properties render nothing on the server - set now.
          const setProp = (v: unknown) => {
            (el as unknown as Record<string, unknown>)[name.slice(1)] = v;
          };
          bind(values[slots[0]!]!, setProp, disposers);
        } else {
          // Reactive attribute: the SSR emitted the current value;
          // subscribe so future changes update it.
          const resolved = slots.map((s) => {
            const v = values[s];
            return typeof v === "function"
              ? wrapFn(v as () => unknown, disposers)
              : v;
          });
          let prev: string | null | undefined;
          const update = () => {
            let result = statics[0]!,
              allNull = true;
            for (let j = 0; j < resolved.length; j++) {
              const val = isSignal(resolved[j])
                ? (resolved[j] as Reactive<unknown>).value
                : resolved[j];
              if (val != null && val !== false) allNull = false;
              result += (val === true ? "" : (val ?? "")) + statics[j + 1]!;
            }
            const next = slots.length === 1 && allNull ? null : result;
            if (next !== prev) {
              prev = next;
              if (next === null) el.removeAttribute(name);
              else el.setAttribute(name, next);
            }
          };
          update();
          for (const r of resolved)
            if (isSignal(r)) disposers.push(r.subscribe(update));
        }
      }

      if (!selfClose && !VOID_ELEMENTS.has(tag.toLowerCase())) {
        elementStack.push(el);
        cursor = el.firstChild;
      } else {
        cursor = el.nextSibling;
      }
    },

    onClose: () => {
      const el = elementStack.pop();
      cursor = el ? el.nextSibling : cursor;
    },

    onSlot: (index) => {
      // Skip to the slot's open marker comment.
      while (
        cursor &&
        !(cursor.nodeType === 8 && (cursor as Comment).data === SSR_OPEN)
      ) {
        cursor = cursor.nextSibling;
      }
      const open = cursor as Comment | null;
      if (!open) {
        aligned = false; // Malformed SSR markup - nothing to bind.

        return;
      }
      // Walk to the matching close (anchor) comment, tracking nesting.
      let depth = 1;
      let node = open.nextSibling;
      const contentStart = node;
      while (node) {
        if (node.nodeType === 8) {
          const d = (node as Comment).data;
          if (d === SSR_OPEN) depth++;
          else if (d === SSR_CLOSE) {
            depth--;
            if (depth === 0) break;
          }
        }
        node = node.nextSibling;
      }
      const anchor = node as Comment | null;
      if (!anchor) {
        aligned = false;

        return;
      }
      // The open marker has served its purpose (separating the dynamic
      // content from static text at parse time); runtime insertions do
      // not merge text nodes, so it can go.
      open.remove();
      if (!recurse(values[index]!, contentStart, anchor, disposers)) {
        aligned = false;
      }
      cursor = anchor.nextSibling;
    },
  });

  return { aligned, end: cursor };
}

/**
 * Hydrate a content slot's value into the region between
 * `contentStart` (after the open marker) and the `anchor` comment.
 */
function hydrateSlotValue(
  tpl: Template,
  value: unknown,
  contentStart: Node | null,
  anchor: Comment,
  disposers: (() => void)[],
  recurse: HydrateRecurse,
): boolean {
  if (value == null || typeof value === "boolean") {
    // The server rendered nothing for such slots: the region must be
    // empty, or the markup belongs to a different structure.
    return !contentStart || contentStart === anchor;
  }
  if (isSignal(value)) {
    hydrateBound(value, contentStart, anchor, disposers);
    return true;
  }
  if (value instanceof Template) {
    if (contentStart)
      return hydrateWalk(value, contentStart, disposers).aligned;
    return true;
  }
  if (Array.isArray(value)) {
    // Walk each template item in lockstep with the region (the server
    // rendered them back to back); primitives and signals keep their
    // server-rendered content.
    let node = contentStart;
    let aligned = true;
    for (const item of value.flat()) {
      if (item instanceof Template && node) {
        const result = hydrateWalk(item, node, disposers);
        node = result.end;
        if (!result.aligned) aligned = false;
      }
    }
    return aligned;
  }
  // Plugin descriptor types (each/match/memo/async) register handlers.
  const handler = getHydrateHandler(value);
  if (handler) {
    return handler(contentStart, anchor, disposers, recurse);
  }
  if (typeof value === "function") {
    // Functions are reactive: wrap in a computed and subscribe. The
    // current value is rendered into the region (replacing the server
    // content); recomputes re-render it, disposing the inner bindings.
    const c = wrapFn(value as () => unknown, disposers);
    const region: Node[] = [];
    let node = contentStart;
    while (node && node !== anchor) {
      region.push(node);
      node = node.nextSibling;
    }
    const innerDisposers: (() => void)[] = [];
    const renderFresh = (v: unknown): void => {
      // Unwrap memo/match descriptors into their rendered content.
      if (v && typeof v === "object") {
        if (MEMO in v) {
          const desc = v as unknown as {
            component: (props: object) => unknown;
            props: object;
          };
          renderFresh(desc.component(desc.props));
          return;
        }
        if (MATCH in v) {
          const desc = v as unknown as {
            selector: () => unknown;
            cases: Record<string, () => unknown>;
          };
          const key = String(desc.selector());
          const factory = desc.cases[key] ?? desc.cases["_"];
          if (factory) renderFresh(factory());
          return;
        }
      }
      renderValue(anchor, v, region, innerDisposers);
    };
    const clearRegion = () => {
      for (const f of innerDisposers) f();
      innerDisposers.length = 0;
      for (const n of region) (n as ChildNode).remove();
      region.length = 0;
    };
    if (!anchor.parentNode) return true; // Region removed (e.g. hidden branch).
    clearRegion();
    renderFresh(c.value);
    disposers.push(
      c.subscribe(() => {
        if (!anchor.parentNode) return;
        clearRegion();
        renderFresh(c.value);
      }),
    );
    disposers.push(clearRegion);
    return true;
  }
  // Static primitive: the region already holds its text, nothing to bind.
  return true;
}

/**
 * Adopt the SSR-rendered region as a binding's current content and
 * subscribe: the first update clears the region and re-renders.
 */
function hydrateBound(
  value: unknown,
  contentStart: Node | null,
  anchor: Comment,
  disposers: (() => void)[],
): void {
  const currentNodes: Node[] = [];
  let node = contentStart;
  while (node && node !== anchor) {
    currentNodes.push(node);
    node = node.nextSibling;
  }
  const childDisposers: (() => void)[] = [];
  const clear = () => {
    for (const f of childDisposers) f();
    childDisposers.length = 0;
    for (const n of currentNodes) (n as ChildNode).remove();
    currentNodes.length = 0;
  };
  const update = (v: unknown) => {
    if (!anchor.parentNode) return; // Region removed (e.g. hidden branch).
    clear();
    renderValue(anchor, v, currentNodes, childDisposers);
  };
  let v = value;
  if (typeof v === "function") v = wrapFn(v as () => unknown, disposers);
  if (isSignal(v)) {
    disposers.push(v.subscribe(() => update((v as Reactive<unknown>).value)));
    // Client-only state may have changed before hydration attached this
    // binding (e.g. favorites restored from localStorage). Apply the
    // current primitive value when it differs from the adopted markup;
    // complex values (templates, arrays) keep the server content.
    const current = (v as Reactive<unknown>).value;
    if (current instanceof Template && contentStart) {
      // A signal holding a template: hydrate the template's own
      // bindings in place; the region's inner markers are consumed and
      // the disposers are owned by this binding's clear.
      hydrateWalk(current, contentStart, childDisposers);
    } else if (
      (typeof current === "string" ||
        typeof current === "number" ||
        typeof current === "bigint") &&
      String(current) !== currentNodes.map((n) => n.textContent ?? "").join("")
    ) {
      update(current);
    }
  }
  disposers.push(clear);
}

/**
 * Hydrate server-rendered markup (from `renderToString` in
 * "balises/ssr") inside `target`, attaching reactive bindings to the
 * existing DOM. The server markup is reused - nothing is re-rendered.
 * Returns a dispose function cleaning up all subscriptions.
 *
 * @example
 * ```ts
 * import { html, signal } from "balises";
 * import { renderToString } from "balises/ssr";
 * import { hydrate } from "balises/hydrate";
 *
 * const count = signal(0);
 * const markup = renderToString(html`<p>Count: ${count}</p>`);
 * container.innerHTML = markup;
 * const dispose = hydrate(html`<p>Count: ${count}</p>`, container);
 * ```
 */
/** Options accepted by `hydrate`: reactive state to restore from the
 *  page payload before attaching the bindings. */
export interface HydrateOptions {
  /** Signals/computeds (anything with a `.value`) to restore. */
  state?: Record<string, { value: unknown }>;
  /** Id of the payload script tag (defaults to "ssr-data"). */
  elementId?: string;
}

export function hydrate(template: Template, target: ParentNode): () => void;
export function hydrate(
  template: Template,
  target: ParentNode,
  options: HydrateOptions,
): () => void;
export function hydrate(
  template: Template,
  target: ParentNode,
  options?: HydrateOptions,
): () => void {
  if (options?.state) {
    // Restore the state the server rendered with before the walk runs:
    // the bindings read the signal values while attaching.
    const parsed = deserializeState(
      document.getElementById(options.elementId ?? "ssr-data"),
    );
    if (parsed) {
      const record = parsed as Record<string, unknown>;
      for (const [key, ref] of Object.entries(options.state)) {
        if (key in record) ref.value = record[key];
      }
    }
  }
  if (!target.firstChild) {
    throw new Error(
      "[balises/hydrate] The target is empty - there is no server-rendered markup to hydrate. Render the template instead, or call hydrate on the element that received the markup.",
    );
  }
  const disposers: (() => void)[] = [];
  const result = hydrateWalk(template, target.firstChild, disposers);
  if (!result.aligned) {
    // The server markup does not match the template (markers stripped,
    // template changed since the build, structure restructured by the
    // browser parser). Never leave a half-bound tree: dispose whatever
    // the walk touched and replace everything with a fresh render.
    for (const f of disposers) f();
    disposers.length = 0;
    while (target.firstChild) target.removeChild(target.firstChild);
    const { fragment, dispose } = template.render();
    target.appendChild(fragment);
    return () => {
      dispose();
      for (const f of disposers) f();
    };
  }
  return () => {
    for (const f of disposers) f();
  };
}
