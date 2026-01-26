/**
 * Match plugin - Conditional rendering with optional branch caching.
 *
 * This module provides opt-in support for conditional rendering,
 * where branches are rendered based on selector results rather than
 * underlying data changes.
 *
 * By default, branches are disposed when switching away (cache: false).
 * Set cache: true to keep branches in memory for instant re-switching.
 *
 * @example
 * ```ts
 * import { html as baseHtml } from "balises";
 * import matchPlugin, { when, match } from "balises/match";
 *
 * const html = baseHtml.with(matchPlugin);
 *
 * // Default: branches disposed on switch
 * html`${when(() => !!state.user, [
 *   () => html`<Profile />`,
 *   () => html`<Login />`
 * ])}`.render();
 *
 * // With caching: branches preserved for instant re-switching
 * html`${match(() => state.tab, {
 *   home: () => html`<Home />`,
 *   settings: () => html`<Settings />`
 * }, { cache: true })}`.render();
 * ```
 */

import { computed } from "./signals/computed.js";
import { Template, type InterpolationPlugin } from "./template.js";

const MATCH = Symbol("match");

/** Options for when/match behavior */
export interface MatchOptions {
  /**
   * Whether to cache branches when switching away.
   * - false (default): Dispose branches when hidden, recreate when revisited
   * - true: Keep branches in memory for instant re-switching
   */
  cache?: boolean;
}

interface MatchDescriptor {
  readonly [MATCH]: true;
  /** @internal */ selector: () => unknown;
  /** @internal */ cases: Record<string, () => Template>;
  /** @internal */ cache: boolean;
}

function isMatchDescriptor(v: unknown): v is MatchDescriptor {
  return v != null && typeof v === "object" && MATCH in v;
}

/**
 * Conditional rendering for boolean conditions.
 * Prevents re-renders when the condition result stays the same.
 *
 * @param condition - Function that returns a boolean
 * @param branches - Array of [ifTrue, ifFalse?] factory functions. If ifFalse is omitted, renders nothing when false.
 * @param options - Optional settings. cache: false (default) disposes branches on switch.
 *
 * @example
 * ```ts
 * // Render only when true
 * html`${when(() => !!state.user, [
 *   () => html`<Profile user=${state.user} />`
 * ])}`
 *
 * // Render different content for true/false
 * html`${when(() => !!state.user, [
 *   () => html`<Profile user=${state.user} />`,
 *   () => html`<LoginPrompt />`
 * ])}`
 *
 * // With caching for instant switching
 * html`${when(() => state.expanded, [
 *   () => html`<ExpandedView />`,
 *   () => html`<CollapsedView />`
 * ], { cache: true })}`
 * ```
 */
export function when(
  condition: () => boolean,
  [ifTrue, ifFalse]: [() => Template, (() => Template)?],
  options?: MatchOptions,
): MatchDescriptor {
  return {
    [MATCH]: true,
    selector: condition,
    cases: ifFalse ? { true: ifTrue, false: ifFalse } : { true: ifTrue },
    cache: options?.cache ?? false,
  };
}

/**
 * Conditional rendering for multiple cases.
 * Prevents re-renders when the selector result stays the same.
 *
 * @param selector - Function that returns a key value
 * @param cases - Object mapping keys to template factories. Use `_` for default case.
 * @param options - Optional settings. cache: false (default) disposes branches on switch.
 *
 * @example
 * ```ts
 * // Loading states (no caching needed)
 * html`${match(() => state.status, {
 *   loading: () => html`<Spinner />`,
 *   error: () => html`<Error message=${() => state.error} />`,
 *   success: () => html`<Data items=${() => state.items} />`,
 *   _: () => html`<Fallback />`,
 * })}`
 *
 * // Tab switching with caching
 * html`${match(() => state.tab, {
 *   home: () => html`<Home />`,
 *   settings: () => html`<Settings />`
 * }, { cache: true })}`
 * ```
 */
export function match<K extends string | number>(
  selector: () => K,
  cases: Partial<Record<K, () => Template>> & { _?: () => Template },
  options?: MatchOptions,
): MatchDescriptor {
  return {
    [MATCH]: true,
    selector,
    cases: cases as Record<string, () => Template>,
    cache: options?.cache ?? false,
  };
}

/** Cache entry per branch: cached nodes and dispose function */
interface BranchEntry {
  nodes: Node[];
  dispose: () => void;
}

/**
 * Plugin that handles match/when descriptors.
 * Register with: const html = baseHtml.with(matchPlugin);
 */
const matchPlugin: InterpolationPlugin = (value) => {
  if (!isMatchDescriptor(value)) return null;

  return (marker, disposers) => {
    const startMarker = document.createComment("");
    marker.parentNode!.insertBefore(startMarker, marker);

    let prevKey: string | null = null;
    let prevBranch: BranchEntry | null = null;
    const branches = value.cache ? new Map<string, BranchEntry>() : null;

    // Create computed that tracks the selector
    const keyComputed = computed(() => String(value.selector()));

    const update = () => {
      const key = keyComputed.value;
      const parent = marker.parentNode;
      if (!parent) return; // Marker detached, skip update

      // Same key - nothing to do (internal bindings handle updates)
      if (key === prevKey) return;

      // Remove current nodes from DOM
      for (let n = startMarker.nextSibling; n && n !== marker; ) {
        const next = n.nextSibling;
        if (branches && prevBranch) {
          // Caching: save nodes for later
          prevBranch.nodes.push(n);
        }
        parent.removeChild(n);
        n = next;
      }

      // Dispose previous branch if not caching
      if (!branches && prevBranch) {
        prevBranch.dispose();
        prevBranch = null;
      }

      // Get or create branch
      let branch = branches?.get(key);
      if (!branch) {
        const factory = value.cases[key] ?? value.cases["_"];
        if (!factory) {
          // No matching case - render nothing
          prevKey = key;
          prevBranch = null;
          return;
        }
        const { fragment, dispose } = factory().render();
        parent.insertBefore(fragment, marker);
        branch = { nodes: [], dispose };
        branches?.set(key, branch);
      } else {
        // Re-insert cached branch nodes
        for (const n of branch.nodes) {
          parent.insertBefore(n, marker);
        }
        branch.nodes.length = 0; // Clear after re-inserting (reuses array)
      }

      prevKey = key;
      prevBranch = branch;
    };

    // Initial render
    update();

    // Subscribe to key changes
    const unsub = keyComputed.subscribe(update);

    disposers.push(() => {
      unsub();
      keyComputed.dispose();
      // Dispose all branches
      if (branches) {
        for (const branch of branches.values()) {
          branch.dispose();
        }
        branches.clear();
      } else if (prevBranch) {
        prevBranch.dispose();
      }
      startMarker.remove();
    });
  };
};

export default matchPlugin;
