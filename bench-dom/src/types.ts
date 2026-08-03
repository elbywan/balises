/**
 * DOM Benchmark Types and Utilities
 *
 * Based on js-framework-benchmark scenarios for measuring real DOM performance.
 */

export interface Row {
  id: number;
  label: string;
}

/**
 * Row with nested data for advanced benchmarks
 */
export interface NestedRow {
  id: number;
  label: string;
  details: {
    description: string;
    tags: string[];
    metadata: {
      createdAt: number;
      priority: "low" | "medium" | "high";
    };
  };
}

export interface BenchmarkResult {
  name: string;
  time: number;
}

export interface BenchmarkSuite {
  name: string;
  /** Initialize the framework and mount to container */
  init(container: HTMLElement): void;
  /** Cleanup and unmount */
  cleanup(): void;
  /** Create 1000 rows */
  create1000(): void | Promise<void>;
  /** Create 10000 rows */
  create10000(): void | Promise<void>;
  /** Append 1000 rows to existing */
  append1000(): void | Promise<void>;
  /** Update every 10th row */
  updateEvery10th(): void | Promise<void>;
  /** Select a row (highlight) */
  selectRow(index: number): void | Promise<void>;
  /** Swap first and last rows */
  swapRows(): void | Promise<void>;
  /** Remove a row at index */
  removeRow(index: number): void | Promise<void>;
  /** Clear all rows */
  clear(): void | Promise<void>;
}

/**
 * Advanced benchmark suite for more realistic scenarios
 * Tests nested updates, partial updates, and cascading reactivity
 */
export interface AdvancedBenchmarkSuite {
  name: string;
  /** Initialize the framework and mount to container */
  init(container: HTMLElement): void;
  /** Cleanup and unmount */
  cleanup(): void;

  // === Creation ===
  /** Create 1000 rows with nested data */
  createNested1000(): void | Promise<void>;

  // === Nested property updates ===
  /** Update a deeply nested property on every 10th row (details.metadata.priority) */
  updateNestedProperty(): void | Promise<void>;
  /** Update a nested array (add a tag to details.tags) on every 10th row */
  updateNestedArray(): void | Promise<void>;

  // === Partial updates ===
  /** Update only the label of a single row (surgical update) */
  updateSingleRow(index: number): void | Promise<void>;
  /** Update only the selected state (like selectRow but tests minimal reactivity) */
  toggleSelection(index: number): void | Promise<void>;

  // === Cascading updates ===
  /** Update a "global" filter that affects which rows are visible */
  filterRows(priority: "low" | "medium" | "high" | "all"): void | Promise<void>;
  /** Batch update: change multiple independent properties at once */
  batchUpdate(): void | Promise<void>;

  // === Clear ===
  clear(): void | Promise<void>;
}

// Random data generation (consistent with js-framework-benchmark)
const adjectives = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
  "important",
  "inexpensive",
  "cheap",
  "expensive",
  "fancy",
];

const colors = [
  "red",
  "yellow",
  "blue",
  "green",
  "pink",
  "brown",
  "purple",
  "brown",
  "white",
  "black",
  "orange",
];

const nouns = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard",
];

let idCounter = 1;

export function resetIdCounter(): void {
  idCounter = 1;
}

export function generateRows(count: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: idCounter++,
      label: `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${colors[Math.floor(Math.random() * colors.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`,
    });
  }
  return rows;
}

const priorities: Array<"low" | "medium" | "high"> = ["low", "medium", "high"];
const tagPool = [
  "featured",
  "sale",
  "new",
  "popular",
  "limited",
  "exclusive",
  "trending",
  "hot",
];

export function generateNestedRows(count: number): NestedRow[] {
  const rows: NestedRow[] = [];
  for (let i = 0; i < count; i++) {
    const adj =
      adjectives[Math.floor(Math.random() * adjectives.length)] ?? "nice";
    const color = colors[Math.floor(Math.random() * colors.length)] ?? "blue";
    const noun = nouns[Math.floor(Math.random() * nouns.length)] ?? "thing";
    const priority =
      priorities[Math.floor(Math.random() * priorities.length)] ?? "medium";

    // Generate 1-3 random tags
    const numTags = 1 + Math.floor(Math.random() * 3);
    const tags: string[] = [];
    for (let t = 0; t < numTags; t++) {
      const tag = tagPool[Math.floor(Math.random() * tagPool.length)];
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    rows.push({
      id: idCounter++,
      label: `${adj} ${color} ${noun}`,
      details: {
        description: `A ${adj} ${color} ${noun} that is ${priority} priority`,
        tags,
        metadata: {
          createdAt: Date.now() - Math.floor(Math.random() * 86400000),
          priority,
        },
      },
    });
  }
  return rows;
}

/**
 * Extract DOM state for correctness verification.
 * Returns a normalized representation of the rendered table.
 */
export function extractDOMState(container: HTMLElement): {
  rowCount: number;
  rows: Array<{ id: string; label: string; selected: boolean }>;
} {
  const tbody = container.querySelector("tbody");
  if (!tbody) {
    return { rowCount: 0, rows: [] };
  }

  const rows: Array<{ id: string; label: string; selected: boolean }> = [];
  const trs = tbody.querySelectorAll("tr");

  for (const tr of trs) {
    const cells = tr.querySelectorAll("td");
    if (cells.length >= 2) {
      const id = cells[0]?.textContent?.trim() ?? "";
      const label = cells[1]?.textContent?.trim() ?? "";
      const selected = tr.classList.contains("danger");
      rows.push({ id, label, selected });
    }
  }

  return { rowCount: rows.length, rows };
}

/**
 * Verify that two DOM states are equivalent.
 */
export function verifyDOMState(
  expected: ReturnType<typeof extractDOMState>,
  actual: ReturnType<typeof extractDOMState>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (expected.rowCount !== actual.rowCount) {
    errors.push(
      `Row count mismatch: expected ${expected.rowCount}, got ${actual.rowCount}`,
    );
  }

  const minLen = Math.min(expected.rows.length, actual.rows.length);
  for (let i = 0; i < minLen; i++) {
    const exp = expected.rows[i]!;
    const act = actual.rows[i]!;

    if (exp.id !== act.id) {
      errors.push(
        `Row ${i} id mismatch: expected "${exp.id}", got "${act.id}"`,
      );
    }
    if (exp.label !== act.label) {
      errors.push(
        `Row ${i} label mismatch: expected "${exp.label}", got "${act.label}"`,
      );
    }
    if (exp.selected !== act.selected) {
      errors.push(
        `Row ${i} selected mismatch: expected ${exp.selected}, got ${act.selected}`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
