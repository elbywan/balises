/**
 * Reactive signals with automatic dependency tracking.
 *
 * This module implements a fine-grained reactivity system similar to SolidJS or Preact Signals.
 * The core idea is:
 * - Signals hold values that can change
 * - Computeds derive values from signals/other computeds and auto-update when dependencies change
 * - The system automatically tracks which computeds depend on which signals
 *
 * Key concepts:
 * - Dependency graph: A directed graph where edges go from sources (signals/computeds) to targets (computeds)
 * - Lazy evaluation: Computeds only recompute when accessed and dirty
 * - Automatic cleanup: When a computed no longer uses a dependency, it's automatically unlinked
 */

export type Subscriber = () => void;

/**
 * Node in the dependency graph.
 *
 * Each Node represents an edge in the dependency graph, linking a source (Signal or Computed)
 * to a target (Computed that depends on it).
 *
 * The graph uses a doubly-linked list structure in two dimensions:
 * - prevS/nextS: Links between all sources of a single target (horizontal chain)
 * - prevT/nextT: Links between all targets of a single source (vertical chain)
 *
 * This allows O(1) insertion and removal of dependencies.
 *
 * Example: If computed C depends on signals A and B:
 *
 *   Signal A ←──────────────── Signal B
 *      │                          │
 *      ▼                          ▼
 *   Node(A→C) ←─prevS/nextS─→ Node(B→C)
 *      │                          │
 *      ▼ (prevT/nextT)            ▼
 *   (other targets of A)     (other targets of B)
 */
interface Node {
  source: Reactive<unknown>; // The signal/computed being depended upon
  target: Computed<unknown>; // The computed that depends on source
  version: number; // Version of source when last accessed (for staleness check)
  prevS: Node | undefined; // Previous node in target's source list
  nextS: Node | undefined; // Next node in target's source list
  prevT: Node | undefined; // Previous node in source's target list
  nextT: Node | undefined; // Next node in source's target list
  rollback: Node | undefined; // Used during recompute to restore source._node
}

// ============================================================================
// Global State
// ============================================================================

/** Currently executing computed (used for automatic dependency tracking) */
let context: Computed<unknown> | null = null;

/** Batch nesting depth (when > 0, subscriber notifications are deferred) */
let batchDepth = 0;

/** Queue of subscribers to notify when batch completes */
let batchQueue: Subscriber[] | null = null;

/** Reusable stack for iterative evaluation (avoids allocation per refresh call) */
const evalStack: Computed<unknown>[] = [];

// ============================================================================
// Batching
// ============================================================================

/**
 * Batch multiple signal updates together.
 *
 * During a batch, subscriber notifications are deferred until the batch completes.
 * This prevents redundant notifications when multiple signals are updated together.
 *
 * @example
 * batch(() => {
 *   signal1.value = 1;
 *   signal2.value = 2;
 * }); // Subscribers notified once after both updates
 */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  if (batchDepth === 1) batchQueue = [];
  try {
    return fn();
  } finally {
    if (--batchDepth === 0) {
      const q = batchQueue!;
      batchQueue = null;
      for (let i = 0; i < q.length; i++) q[i]!();
    }
  }
}

// ============================================================================
// Base Reactive Class
// ============================================================================

/**
 * Abstract base class for reactive values (Signal and Computed).
 *
 * Contains shared functionality:
 * - Dependency tracking (track method)
 * - Subscriber management (subscribe method)
 * - Subscriber notification (notify method)
 * - Graph node management (ver, targets, node accessors)
 */
abstract class Reactive<T> {
  /** Version counter, incremented when value changes. Used for cache invalidation. */
  #version = 0;

  /** Head of linked list of Nodes where this reactive is the source */
  #targets: Node | undefined;

  /**
   * Cached Node for the current tracking context.
   * Optimization: when the same computed accesses this reactive multiple times,
   * we can reuse the existing Node instead of searching the targets list.
   */
  #node: Node | undefined;

  /** Subscriber callbacks to notify on value change */
  #subs: Subscriber[] = [];

  abstract get value(): T;

  /**
   * Subscribe to value changes.
   * @returns Unsubscribe function
   */
  subscribe(fn: Subscriber): () => void {
    this.#subs.push(fn);
    return () => {
      const i = this.#subs.indexOf(fn);
      if (i >= 0) {
        // Swap with last element and pop (O(1) removal)
        this.#subs[i] = this.#subs[this.#subs.length - 1]!;
        this.#subs.pop();
      }
    };
  }

  /**
   * Track this reactive as a dependency of the current computed context.
   *
   * This is the heart of automatic dependency tracking. When a computed's
   * function accesses a reactive's value, track() is called to record that
   * the computed depends on this reactive.
   *
   * The algorithm handles two cases:
   * 1. Re-tracking: The same computed accesses the same reactive again during
   *    the same recompute. We just update the version and move the node to
   *    the head of the sources list (so it won't be cleaned up).
   * 2. New tracking: Create a new Node linking this source to the context target.
   */
  protected track(): void {
    if (!context) return;

    let node = this.#node;

    // Case 1: Re-tracking an existing dependency
    if (node?.target === context) {
      // version === -1 means this node was marked for potential cleanup
      // during prepare(). Re-tracking it means it's still needed.
      if (node.version === -1) {
        node.version = this.#version;
        // Move node to head of context's sources list (so cleanup won't remove it)
        if (node.nextS) {
          // Unlink from current position
          node.nextS.prevS = node.prevS;
          if (node.prevS) node.prevS.nextS = node.nextS;
          // Link at head
          node.prevS = context.sources;
          node.nextS = undefined;
          if (context.sources) context.sources.nextS = node;
          context.sources = node;
        }
      }
      return;
    }

    // Case 2: New dependency - create a new Node
    node = {
      source: this,
      target: context,
      version: this.#version,
      prevS: context.sources, // Insert at head of context's sources
      nextS: undefined,
      prevT: undefined,
      nextT: this.#targets, // Insert at head of this source's targets
      rollback: this.#node, // Save current _node for rollback during cleanup
    };

    // Link into context's sources list
    if (context.sources) context.sources.nextS = node;
    context.sources = node;

    // Link into this source's targets list
    if (this.#targets) this.#targets.prevT = node;
    this.#targets = node;

    // Cache this node for quick re-tracking
    this.#node = node;
  }

  /**
   * Notify all subscribers of a value change.
   * During a batch, notifications are queued instead of executed immediately.
   */
  protected notify(): void {
    if (batchDepth) {
      if (this.#subs.length) batchQueue!.push(...this.#subs);
    } else {
      for (let i = 0; i < this.#subs.length; i++) this.#subs[i]!();
    }
  }

  // Accessors for cross-instance access (needed for dependency graph manipulation)
  get ver() {
    return this.#version;
  }
  set ver(v: number) {
    this.#version = v;
  }
  get targets() {
    return this.#targets;
  }
  set targets(v: Node | undefined) {
    this.#targets = v;
  }
  get node() {
    return this.#node;
  }
  set node(v: Node | undefined) {
    this.#node = v;
  }
  get subs() {
    return this.#subs;
  }
}

// ============================================================================
// Signal
// ============================================================================

/**
 * A reactive value container.
 *
 * Signals are the atomic units of reactivity. When a signal's value changes,
 * all computeds that depend on it are marked dirty and will recompute when
 * their value is next accessed.
 *
 * @example
 * const count = signal(0);
 * count.value; // 0
 * count.value = 1; // Dependents are marked dirty
 */
export class Signal<T> extends Reactive<T> {
  #value: T;

  constructor(value: T) {
    super();
    this.#value = value;
  }

  get value(): T {
    this.track(); // Record dependency if inside a computed
    return this.#value;
  }

  set value(v: T) {
    if (this.#value === v) return; // No change, skip update
    this.#value = v;
    this.ver++; // Increment version for cache invalidation

    // Mark all dependent computeds as dirty
    for (let node = this.targets; node; node = node.nextT)
      node.target.markDirty();

    // Notify subscribers
    this.notify();
  }
}

// ============================================================================
// Computed
// ============================================================================

/**
 * A derived reactive value.
 *
 * Computeds automatically track their dependencies and recompute when those
 * dependencies change. They use lazy evaluation - the function only runs
 * when the value is accessed and the computed is dirty.
 *
 * @example
 * const count = signal(1);
 * const doubled = computed(() => count.value * 2);
 * doubled.value; // 2
 * count.value = 2;
 * doubled.value; // 4 (recomputed because count changed)
 */
export class Computed<T> extends Reactive<T> {
  #fn: (() => T) | undefined; // The computation function (undefined when disposed)
  #value: T | undefined; // Cached computed value
  #dirty = true; // Whether recomputation is needed
  #computing = false; // Guard against infinite loops

  /** Head of linked list of Nodes where this computed is the target */
  sources: Node | undefined;

  constructor(fn: () => T) {
    super();
    this.#fn = fn;
    this.#recompute(); // Compute initial value
  }

  get value(): T {
    // Track this computed as a dependency (for nested computeds)
    if (context && context !== this) this.track();

    // Lazy evaluation: only recompute if dirty
    if (this.#dirty) this.#refresh();

    return this.#value as T;
  }

  /**
   * Dispose this computed, removing all dependency links.
   * After disposal, the computed will no longer update.
   */
  dispose(): void {
    this.#fn = undefined;
    // Unlink from all sources' target lists
    for (let node = this.sources; node; node = node.nextS) {
      if (node.prevT) node.prevT.nextT = node.nextT;
      else node.source.targets = node.nextT;
      if (node.nextT) node.nextT.prevT = node.prevT;
    }
    this.sources = undefined;
    this.subs.length = 0;
  }

  /**
   * Iterative DFS to refresh this computed and all its dirty dependencies.
   *
   * This replaces the naive recursive approach which would cause stack overflow
   * on deep dependency chains (e.g., 5000+ layers).
   *
   * Algorithm:
   * 1. Start with this computed as current
   * 2. If current is dirty and has any dirty computed sources, push current
   *    onto stack and descend into that source (DFS)
   * 3. If current is dirty with no dirty sources, recompute it
   * 4. Pop from stack and repeat until stack is empty
   *
   * This ensures dependencies are recomputed before dependents (topological order).
   */
  #refresh(): void {
    const stack = evalStack;
    const base = stack.length; // Remember stack position for nested calls
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let cur: Computed<unknown> | undefined = this;

    outer: while (cur) {
      if (cur.#dirty && !cur.#computing) {
        // Look for dirty computed sources that need to be refreshed first
        for (let n: Node | undefined = cur.sources; n; n = n.prevS) {
          const s: Reactive<unknown> = n.source;
          if (s instanceof Computed && s.#dirty) {
            // Found a dirty source - descend into it first
            stack.push(cur);
            cur = s;
            continue outer;
          }
        }
        // No dirty sources - safe to recompute this computed
        cur.#recompute();
      }
      // Move back up the stack
      cur = stack.length > base ? stack.pop() : undefined;
    }
  }

  /**
   * Mark this computed and all its dependents as dirty.
   *
   * Uses BFS to propagate dirtiness through the dependency graph.
   * Also schedules subscriber notifications for computeds that have subscribers.
   */
  markDirty(): void {
    if (this.#dirty) return; // Already dirty, skip

    const queue: Computed<unknown>[] = [this];
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i]!;
      if (c.#dirty) continue;
      c.#dirty = true;

      // Propagate to all targets (computeds that depend on this one)
      for (let node = c.targets; node; node = node.nextT)
        if (!node.target.#dirty) queue.push(node.target);

      // If this computed has subscribers, schedule notification
      if (c.subs.length) {
        const old = c.#value;
        const notify = () => {
          if (c.#fn) {
            c.#recompute();
            // Only notify if value actually changed
            if (c.#value !== old)
              for (let j = 0; j < c.subs.length; j++) c.subs[j]!();
          }
        };
        if (batchDepth) {
          batchQueue!.push(notify);
        } else {
          notify();
        }
      }
    }
  }

  /**
   * Recompute this computed's value.
   *
   * The algorithm has three phases:
   * 1. Prepare: Mark all current dependencies for potential removal
   * 2. Execute: Run the function (which will re-track still-needed dependencies)
   * 3. Cleanup: Remove dependencies that weren't re-tracked
   *
   * This allows the dependency set to change dynamically based on conditional logic
   * in the computation function.
   */
  #recompute(): void {
    if (this.#computing || !this.#fn) return;
    this.#computing = true; // Guard against infinite loops

    // === PREPARE PHASE ===
    // Reverse the sources list and mark all nodes with version = -1
    // This marks them as "potentially stale" - if they're accessed during
    // execution, they'll be re-validated. If not, they'll be removed in cleanup.
    for (let node = this.sources; node; node = node.nextS) {
      node.rollback = node.source.node; // Save for restoration
      node.source.node = node; // Point source's cache to this node
      node.version = -1; // Mark as potentially stale
      if (!node.nextS) {
        this.sources = node; // sources now points to tail (reversed)
        break;
      }
    }

    // === EXECUTE PHASE ===
    const prev = context;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    context = this; // Set as current context for dependency tracking
    const old = this.#value;
    try {
      this.#value = this.#fn(); // Run computation (triggers track() calls)
    } finally {
      context = prev;

      // === CLEANUP PHASE ===
      // Walk through sources and remove any that still have version === -1
      // (meaning they weren't accessed during execution)
      let node = this.sources;
      let head: Node | undefined;
      while (node) {
        const p = node.prevS;
        if (node.version === -1) {
          // This dependency was not accessed - remove it from the graph
          // Unlink from source's targets list
          if (node.prevT) node.prevT.nextT = node.nextT;
          else node.source.targets = node.nextT;
          if (node.nextT) node.nextT.prevT = node.prevT;
          // Unlink from this computed's sources list
          if (p) p.nextS = node.nextS;
          if (node.nextS) node.nextS.prevS = p;
        } else {
          head = node; // This node is still valid
        }
        // Restore source's node cache
        node.source.node = node.rollback;
        node.rollback = undefined;
        node = p;
      }
      this.sources = head;

      // Update version if value changed (or first computation)
      if (this.#value !== old || this.ver === 0) this.ver++;
      this.#dirty = false;
      this.#computing = false;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/** Create a new Signal */
export const signal = <T>(v: T) => new Signal(v);

/** Create a new Computed */
export const computed = <T>(fn: () => T) => new Computed(fn);

/** Export Reactive type for external use */
export type { Reactive };

/** Check if a value is a reactive (Signal or Computed) */
export const isSignal = (v: unknown): v is Reactive<unknown> =>
  v instanceof Reactive;

// ============================================================================
// Store
// ============================================================================

/** Symbol to mark objects as already wrapped by store() */
const STORE = Symbol();

/** Check if value is a plain object (not array, null, or class instance) */
const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null &&
  typeof v === "object" &&
  Object.getPrototypeOf(v) === Object.prototype;

/**
 * Create a reactive store from a plain object.
 *
 * The store wraps each property in a Signal, making the object deeply reactive.
 * Accessing a property tracks it as a dependency; setting a property triggers updates.
 *
 * @example
 * const state = store({ count: 0, user: { name: "Alice" } });
 * const doubled = computed(() => state.count * 2);
 * state.count = 1; // doubled is now 2
 * state.user.name = "Bob"; // nested objects are also reactive
 */
export function store<T extends object>(obj: T): T {
  const signals = new Map<string | symbol, Signal<unknown>>();

  // Recursively wrap nested objects and arrays
  const wrap = (v: unknown): unknown =>
    v !== null && typeof v === "object" && STORE in v
      ? v // Already a store, don't double-wrap
      : isObj(v)
        ? store(v) // Wrap plain objects
        : Array.isArray(v)
          ? v.map(wrap) // Wrap array elements
          : v; // Primitives pass through

  // Get or create a signal for a property
  const get = (k: string | symbol, init: unknown) => {
    let s = signals.get(k);
    if (!s) {
      s = new Signal(wrap(init));
      signals.set(k, s);
    }
    return s;
  };

  return new Proxy(obj, {
    get: (t, k) =>
      // Symbols access the original object (for STORE check, etc.)
      typeof k === "symbol" ? t[k as keyof T] : get(k, t[k as keyof T]).value,
    set: (t, k, v) => {
      if (typeof k === "symbol") {
        t[k as keyof T] = v;
        return true;
      }
      const w = wrap(v);
      get(k, t[k as keyof T]).value = w;
      t[k as keyof T] = w as T[keyof T];
      return true;
    },
    // Make STORE symbol appear in the object (for double-wrap check)
    has: (t, k) => k === STORE || k in t,
  });
}
