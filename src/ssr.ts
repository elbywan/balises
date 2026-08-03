/**
 * Server-side rendering for balises templates.
 *
 * Renders a template to an HTML string in a DOM-less environment (Node).
 * The output carries hydration markers so the client can attach reactive
 * bindings to the existing markup via `hydrate()` from "balises/hydrate":
 *
 * - Content slots are wrapped in `<!--b-->` ... `<!--/b-->` markers
 * - `each()` rows are separated by `<!--k-->` boundary markers
 * - Event bindings (`@`) and property bindings (`.`) render nothing
 *   (events have no server representation; properties are set at hydration)
 * - Reactive values (signals, computeds, functions) are evaluated once
 *   with their current value - there is no reactivity on the server
 *
 * Async generators are supported via `renderToStringAsync()`, which runs
 * generators to completion and renders their final content (including
 * generators nested inside each() rows and match() branches).
 */

import { HTMLParser } from "./parser.js";
import { Template, VOID_ELEMENTS } from "./template.js";
import { ssrTemplateData } from "./ssr-shared.js";
import { isSignal, type Reactive } from "./signals/index.js";
import { signal, ReadonlySignal } from "./signals/signal.js";
import { EACH, type EachDescriptor } from "./each.js";
import { MATCH, type MatchDescriptor } from "./match.js";
import { MEMO } from "./memo.js";
import { isAsyncGeneratorFunction } from "./async.js";
import { SSR_OPEN, SSR_CLOSE, SSR_ROW } from "./ssr-shared.js";

/** Escape text content for HTML. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape an attribute value for HTML. */
function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

/** Evaluate a reactive/interpolated value to its current string form. */
function evalValue(value: unknown): string {
  if (value == null || value === true || value === false) return "";
  if (isSignal(value)) return evalValue((value as Reactive<unknown>).value);
  if (typeof value === "function") return evalValue((value as () => unknown)());
  return String(value);
}

/** Render context. `pending` collects async slot content for
 *  post-parse resolution (placeholders are NUL-delimited uids). */
interface SsrContext {
  async: boolean;
  pending?: Map<string, Promise<string>>;
  uid?: number;
}

const uidToken = (uid: number): string => `\u0000ssr${uid}\u0000`;

function renderValue(value: unknown, ctx: SsrContext): string {
  if (value == null || typeof value === "boolean") return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return escapeText(String(value));
  }
  if (isSignal(value)) {
    return renderValue((value as Reactive<unknown>).value, ctx);
  }
  if (value instanceof Template) {
    return renderTemplate(value, ctx);
  }
  if (Array.isArray(value)) {
    let out = "";
    for (const item of value.flat()) out += renderValue(item, ctx);
    return out;
  }
  if (typeof value === "function") {
    if (isAsyncGeneratorFunction(value)) {
      if (!ctx.async) {
        throw new Error(
          "[balises/ssr] Async generators require renderToStringAsync().",
        );
      }
      // Register the generator for post-parse resolution and emit a
      // placeholder token in its place (works at any nesting depth).
      const uid = ctx.uid!++;
      ctx.pending!.set(
        uidToken(uid),
        (async () => {
          const gen = (
            value as () => AsyncGenerator<unknown, unknown, unknown>
          )();
          const result = await runAsyncGenerator(gen);
          return renderValue(result, ctx);
        })(),
      );
      return uidToken(uid);
    }
    return renderValue((value as () => unknown)(), ctx);
  }
  if (typeof value === "object") {
    if (EACH in value) return renderEach(value as EachDescriptor<unknown>, ctx);
    if (MATCH in value) return renderMatch(value as MatchDescriptor, ctx);
    if (MEMO in value) {
      const desc = value as {
        [MEMO]: true;
        component: (props: object) => unknown;
        props: object;
      };
      return renderValue(desc.component(desc.props), ctx);
    }
  }
  return escapeText(String(value));
}

function renderEach(desc: EachDescriptor<unknown>, ctx: SsrContext): string {
  const rawList = desc.__list__;
  const list = (
    typeof rawList === "function" && !isSignal(rawList)
      ? (rawList as () => unknown[])()
      : isSignal(rawList)
        ? (rawList as Reactive<unknown[]>).value
        : (rawList as unknown[])
  ) as unknown[];
  let out = "";
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    out += `<!--${SSR_ROW}-->`;
    const itemSignal = signal(item);
    const row = desc.__renderFn__(new ReadonlySignal(itemSignal), i);
    out += renderTemplate(row, ctx);
  }
  return out;
}

function renderMatch(desc: MatchDescriptor, ctx: SsrContext): string {
  const key = String(desc.selector());
  const factory = desc.cases[key] ?? desc.cases["_"];
  if (!factory) return "";
  return renderTemplate(factory(), ctx);
}

/** Render a content slot: the wrapper markers around the evaluated value. */
function renderSlot(value: unknown, ctx: SsrContext): string {
  return `<!--${SSR_OPEN}-->${renderValue(value, ctx)}<!--${SSR_CLOSE}-->`;
}

/** Render a template to an HTML string. */
function renderTemplate(tpl: Template, ctx: SsrContext): string {
  const data = ssrTemplateData.get(tpl);
  if (!data) {
    throw new Error(
      "This template was created by a different balises build - import html and renderToString from the same package entry.",
    );
  }
  const [strings, values] = data;
  let out = "";
  const stack: string[] = [];

  new HTMLParser().parseTemplate(strings, {
    onText: (text) => {
      out += escapeText(text);
    },

    onOpenTag: (tag, attrs, selfClose) => {
      out += "<" + tag;
      for (const [name, statics, slots] of attrs) {
        const c = name[0];
        // Events and properties have no server-side HTML representation:
        // listeners are attached at hydration, properties set there too.
        if (c === "@" || c === ".") continue;
        if (!slots.length) {
          out += ` ${name}="${escapeAttr(statics[0] ?? "")}"`;
        } else {
          let value = statics[0]!;
          for (let i = 0; i < slots.length; i++) {
            value += evalValue(values[slots[i]!]) + statics[i + 1]!;
          }
          out += ` ${name}="${escapeAttr(value)}"`;
        }
      }
      out += ">";
      // Void elements never render a closing tag or a self-closing slash
      // (browsers parse `<br/>` as `<br>`); only non-void self-closing
      // tags keep the slash.
      if (selfClose && !VOID_ELEMENTS.has(tag.toLowerCase())) {
        out = out.slice(0, -1) + "/>";
      } else if (!VOID_ELEMENTS.has(tag.toLowerCase())) {
        stack.push(tag);
      }
    },

    onClose: () => {
      const tag = stack.pop();
      if (tag) out += `</${tag}>`;
    },

    onSlot: (index) => {
      out += renderSlot(values[index], ctx);
    },
  });

  return out;
}

/**
 * Render a template to an HTML string.
 *
 * Reactive values are evaluated once with their current value; the output
 * carries hydration markers for `hydrate()` on the client.
 *
 * @example
 * ```ts
 * import { html, signal } from "balises";
 * import { renderToString } from "balises/ssr";
 *
 * const count = signal(0);
 * const string = renderToString(html`<p>Count: ${count}</p>`);
 * // "<p>Count: <!--b-->0<!--/b--></p>"
 * ```
 */
export function renderToString(template: Template): string {
  return renderTemplate(template, { async: false });
}

/** Run an async generator to completion and collect its final content. */
async function runAsyncGenerator(
  gen: AsyncGenerator<unknown, unknown, unknown>,
): Promise<unknown> {
  let lastYield: unknown = null;
  while (true) {
    const { value, done } = await gen.next();
    if (done) return value !== undefined ? value : lastYield;
    lastYield = value;
  }
}

/**
 * Render a template to an HTML string, awaiting async generators to
 * completion (their final content is rendered).
 */
export async function renderToStringAsync(template: Template): Promise<string> {
  const ctx: SsrContext = { async: true, pending: new Map(), uid: 0 };
  let out = renderTemplate(template, ctx);
  for (const [token, promise] of ctx.pending ?? []) {
    out = out.replaceAll(token, await promise);
  }
  return out;
}
