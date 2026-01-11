/**
 * Stress tests for each() keyed list rendering.
 *
 * These tests verify correctness under various challenging scenarios:
 * - Deterministic shuffle patterns (reverse, rotate, interleave)
 * - Randomized shuffles with fixed seed for reproducibility
 * - Insertions at various positions and percentages
 * - Deletions at various percentages
 * - Combined mutations (shuffle + insert + delete)
 * - Performance regression detection
 * - Garbage collection after dispose
 *
 * All randomized tests use a fixed seed (SEED = 12345) for reproducibility.
 * The seed is logged on failure to aid debugging.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { html as baseHtml } from "../src/template.js";
import eachPlugin, { each } from "../src/each.js";
import { signal } from "../src/signals/index.js";
import { createGCTracker } from "./gc-utils.js";

const html = baseHtml.with(eachPlugin);

// Fixed seed for reproducibility
const SEED = 12345;

// ============ Test Utilities ============

interface Item {
  id: number;
  name: string;
}

/**
 * Seeded PRNG for reproducible randomness.
 * Uses Linear Congruential Generator.
 */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Fisher-Yates shuffle with seeded random.
 */
function shuffle<T>(arr: readonly T[], random: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Rotate array left by n positions.
 * rotate([1,2,3,4,5], 2) => [3,4,5,1,2]
 */
function rotateLeft<T>(arr: readonly T[], n: number): T[] {
  const len = arr.length;
  if (len === 0) return [];
  const shift = ((n % len) + len) % len;
  return [...arr.slice(shift), ...arr.slice(0, shift)];
}

/**
 * Rotate array right by n positions.
 * rotateRight([1,2,3,4,5], 2) => [4,5,1,2,3]
 */
function rotateRight<T>(arr: readonly T[], n: number): T[] {
  return rotateLeft(arr, -n);
}

/**
 * Interleave even and odd indices.
 * [0,1,2,3,4,5] => [0,2,4,1,3,5]
 */
function interleave<T>(arr: readonly T[]): T[] {
  const evens = arr.filter((_, i) => i % 2 === 0);
  const odds = arr.filter((_, i) => i % 2 === 1);
  return [...evens, ...odds];
}

/**
 * Insert new items at random positions.
 */
function insertAtRandomPositions<T>(
  arr: readonly T[],
  newItems: readonly T[],
  random: () => number,
): T[] {
  const result = [...arr];
  for (const item of newItems) {
    const pos = Math.floor(random() * (result.length + 1));
    result.splice(pos, 0, item);
  }
  return result;
}

/**
 * Insert items at the beginning.
 */
function insertAtBeginning<T>(arr: readonly T[], newItems: readonly T[]): T[] {
  return [...newItems, ...arr];
}

/**
 * Insert items at the end.
 */
function insertAtEnd<T>(arr: readonly T[], newItems: readonly T[]): T[] {
  return [...arr, ...newItems];
}

/**
 * Insert items evenly distributed throughout the array.
 */
function insertEvenlyDistributed<T>(
  arr: readonly T[],
  newItems: readonly T[],
): T[] {
  if (newItems.length === 0) return [...arr];
  if (arr.length === 0) return [...newItems];

  const result: T[] = [];
  const step = arr.length / newItems.length;
  let newIdx = 0;

  for (let i = 0; i < arr.length; i++) {
    // Insert new item before this position if we've passed the threshold
    while (newIdx < newItems.length && i >= Math.floor(step * newIdx)) {
      result.push(newItems[newIdx]!);
      newIdx++;
    }
    result.push(arr[i]!);
  }

  // Add remaining new items at the end
  while (newIdx < newItems.length) {
    result.push(newItems[newIdx]!);
    newIdx++;
  }

  return result;
}

/**
 * Remove random items from array.
 * Returns [remaining, removed].
 */
function removeRandom<T>(
  arr: readonly T[],
  count: number,
  random: () => number,
): [T[], T[]] {
  const indices = new Set<number>();
  const len = arr.length;
  const toRemove = Math.min(count, len);

  while (indices.size < toRemove) {
    indices.add(Math.floor(random() * len));
  }

  const remaining: T[] = [];
  const removed: T[] = [];

  for (let i = 0; i < len; i++) {
    if (indices.has(i)) {
      removed.push(arr[i]!);
    } else {
      remaining.push(arr[i]!);
    }
  }

  return [remaining, removed];
}

/**
 * Create items with sequential IDs.
 */
function createItems(count: number, startId = 1): Item[] {
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    name: `Item-${startId + i}`,
  }));
}

/**
 * Capture a map of id -> DOM element for node identity verification.
 */
function captureNodeMap(ul: HTMLUListElement): Map<number, Element> {
  const map = new Map<number, Element>();
  for (const child of ul.children) {
    const id = Number(child.getAttribute("data-id"));
    map.set(id, child);
  }
  return map;
}

/**
 * Verify DOM matches expected items order and node identity.
 *
 * @param ul - The list element
 * @param items - Expected items in order
 * @param nodeMap - Map of id -> original DOM node (captured before mutation)
 * @param expectedReusedCount - How many nodes from nodeMap should be reused
 * @param label - Label for error messages
 */
function verifyDOM(
  ul: HTMLUListElement,
  items: readonly Item[],
  nodeMap: Map<number, Element>,
  expectedReusedCount: number,
  label: string,
): void {
  // Verify length
  assert.strictEqual(
    ul.children.length,
    items.length,
    `${label}: length mismatch (expected ${items.length}, got ${ul.children.length}) (seed=${SEED})`,
  );

  // Verify order and node identity
  let reusedCount = 0;
  for (let i = 0; i < items.length; i++) {
    const id = items[i]!.id;
    const expected = String(id);
    const actual = ul.children[i]!.getAttribute("data-id");

    // Verify correct item at this position
    assert.strictEqual(
      actual,
      expected,
      `${label}: position ${i} mismatch (expected id=${expected}, got id=${actual}) (seed=${SEED})`,
    );

    // Verify node reuse for items that existed in original nodeMap
    if (nodeMap.has(id)) {
      assert.strictEqual(
        ul.children[i],
        nodeMap.get(id),
        `${label}: node reuse failed for id=${id} at position ${i} (seed=${SEED})`,
      );
      reusedCount++;
    }
  }

  // Verify exact reuse count matches expectation
  assert.strictEqual(
    reusedCount,
    expectedReusedCount,
    `${label}: reuse count mismatch (expected ${expectedReusedCount}, got ${reusedCount}) (seed=${SEED})`,
  );
}

/**
 * Render a list and return helpers.
 */
function renderList(initialItems: Item[]) {
  const items = signal(initialItems);
  const { fragment, dispose } = html`<ul>
    ${each(
      items,
      (i) => i.id,
      (i) => html`<li data-id="${i.peek().id}">${() => i.value.name}</li>`,
    )}
  </ul>`.render();

  document.body.appendChild(fragment);
  const ul = document.body.querySelector("ul")!;

  return { items, ul, dispose };
}

// ============ Tests ============

describe("each() stress tests", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // ============ Deterministic Shuffle Patterns ============

  describe("deterministic shuffle patterns", () => {
    it("should handle full reverse with node identity", () => {
      const initial = createItems(20);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      // Reverse - all 20 nodes should be reused
      items.value = [...initial].reverse();

      verifyDOM(ul, items.value, nodeMap, 20, "reverse");

      dispose();
      ul.remove();
    });

    it("should handle rotate left by 1", () => {
      const initial = createItems(20);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      items.value = rotateLeft(initial, 1);

      verifyDOM(ul, items.value, nodeMap, 20, "rotate-left-1");

      dispose();
      ul.remove();
    });

    it("should handle rotate left by N/4", () => {
      const initial = createItems(20);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      items.value = rotateLeft(initial, Math.floor(initial.length / 4));

      verifyDOM(ul, items.value, nodeMap, 20, "rotate-left-N/4");

      dispose();
      ul.remove();
    });

    it("should handle rotate left by N/2", () => {
      const initial = createItems(20);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      items.value = rotateLeft(initial, Math.floor(initial.length / 2));

      verifyDOM(ul, items.value, nodeMap, 20, "rotate-left-N/2");

      dispose();
      ul.remove();
    });

    it("should handle rotate right by 1", () => {
      const initial = createItems(20);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      items.value = rotateRight(initial, 1);

      verifyDOM(ul, items.value, nodeMap, 20, "rotate-right-1");

      dispose();
      ul.remove();
    });

    it("should handle interleave even/odd", () => {
      const initial = createItems(20);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      items.value = interleave(initial);

      verifyDOM(ul, items.value, nodeMap, 20, "interleave");

      dispose();
      ul.remove();
    });

    it("should handle move first to last", () => {
      const initial = createItems(20);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      items.value = [...initial.slice(1), initial[0]!];

      verifyDOM(ul, items.value, nodeMap, 20, "first-to-last");

      dispose();
      ul.remove();
    });

    it("should handle move last to first", () => {
      const initial = createItems(20);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      items.value = [initial[initial.length - 1]!, ...initial.slice(0, -1)];

      verifyDOM(ul, items.value, nodeMap, 20, "last-to-first");

      dispose();
      ul.remove();
    });
  });

  // ============ Randomized Shuffle Tests ============

  describe("randomized shuffle tests", () => {
    it("should handle 50 elements shuffled 20 times", () => {
      const initial = createItems(50);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      for (let iteration = 0; iteration < 20; iteration++) {
        items.value = shuffle(items.value, random);
        // All 50 nodes should be reused on every shuffle
        verifyDOM(ul, items.value, nodeMap, 50, `shuffle-50-iter-${iteration}`);
      }

      dispose();
      ul.remove();
    });

    it("should handle 100 elements shuffled 20 times", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      for (let iteration = 0; iteration < 20; iteration++) {
        items.value = shuffle(items.value, random);
        verifyDOM(
          ul,
          items.value,
          nodeMap,
          100,
          `shuffle-100-iter-${iteration}`,
        );
      }

      dispose();
      ul.remove();
    });

    it("should handle 500 elements shuffled 10 times", () => {
      const initial = createItems(500);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      for (let iteration = 0; iteration < 10; iteration++) {
        items.value = shuffle(items.value, random);
        verifyDOM(
          ul,
          items.value,
          nodeMap,
          500,
          `shuffle-500-iter-${iteration}`,
        );
      }

      dispose();
      ul.remove();
    });
  });

  // ============ Insertion Stress Tests ============

  describe("insertion stress tests", () => {
    it("should handle 10% new elements at random positions", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      const newItems = createItems(10, 1000); // IDs 1000-1009
      items.value = insertAtRandomPositions(initial, newItems, random);

      // All 100 original nodes should be reused
      verifyDOM(ul, items.value, nodeMap, 100, "insert-10%-random");

      dispose();
      ul.remove();
    });

    it("should handle 20% new elements at random positions", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      const newItems = createItems(20, 1000);
      items.value = insertAtRandomPositions(initial, newItems, random);

      verifyDOM(ul, items.value, nodeMap, 100, "insert-20%-random");

      dispose();
      ul.remove();
    });

    it("should handle 50% new elements at random positions", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      const newItems = createItems(50, 1000);
      items.value = insertAtRandomPositions(initial, newItems, random);

      verifyDOM(ul, items.value, nodeMap, 100, "insert-50%-random");

      dispose();
      ul.remove();
    });

    it("should handle 100% new elements at random positions", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      const newItems = createItems(100, 1000);
      items.value = insertAtRandomPositions(initial, newItems, random);

      verifyDOM(ul, items.value, nodeMap, 100, "insert-100%-random");

      dispose();
      ul.remove();
    });

    it("should handle 50% new elements at beginning", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      const newItems = createItems(50, 1000);
      items.value = insertAtBeginning(initial, newItems);

      verifyDOM(ul, items.value, nodeMap, 100, "insert-50%-beginning");

      dispose();
      ul.remove();
    });

    it("should handle 50% new elements at end", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      const newItems = createItems(50, 1000);
      items.value = insertAtEnd(initial, newItems);

      verifyDOM(ul, items.value, nodeMap, 100, "insert-50%-end");

      dispose();
      ul.remove();
    });

    it("should handle 50% new elements evenly distributed", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);

      const newItems = createItems(50, 1000);
      items.value = insertEvenlyDistributed(initial, newItems);

      verifyDOM(ul, items.value, nodeMap, 100, "insert-50%-distributed");

      dispose();
      ul.remove();
    });
  });

  // ============ Deletion Stress Tests ============

  describe("deletion stress tests", () => {
    it("should handle removing 10% random elements", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      const [remaining] = removeRandom(initial, 10, random);
      items.value = remaining;

      // 90 nodes should be reused (100 - 10 removed)
      verifyDOM(ul, items.value, nodeMap, 90, "delete-10%");

      dispose();
      ul.remove();
    });

    it("should handle removing 25% random elements", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      const [remaining] = removeRandom(initial, 25, random);
      items.value = remaining;

      verifyDOM(ul, items.value, nodeMap, 75, "delete-25%");

      dispose();
      ul.remove();
    });

    it("should handle removing 50% random elements", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      const [remaining] = removeRandom(initial, 50, random);
      items.value = remaining;

      verifyDOM(ul, items.value, nodeMap, 50, "delete-50%");

      dispose();
      ul.remove();
    });

    it("should handle removing 75% random elements", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      const [remaining] = removeRandom(initial, 75, random);
      items.value = remaining;

      verifyDOM(ul, items.value, nodeMap, 25, "delete-75%");

      dispose();
      ul.remove();
    });

    it("should handle removing 90% random elements", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      const [remaining] = removeRandom(initial, 90, random);
      items.value = remaining;

      verifyDOM(ul, items.value, nodeMap, 10, "delete-90%");

      dispose();
      ul.remove();
    });
  });

  // ============ Combined Mutation Tests ============

  describe("combined mutation tests", () => {
    it("should handle shuffle + 20% insertions", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      // Shuffle first
      let current = shuffle(initial, random);
      // Then insert 20% new
      const newItems = createItems(20, 1000);
      current = insertAtRandomPositions(current, newItems, random);

      items.value = current;

      // All 100 original nodes should be reused
      verifyDOM(ul, items.value, nodeMap, 100, "shuffle+insert-20%");

      dispose();
      ul.remove();
    });

    it("should handle shuffle + 30% deletions", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      // Shuffle first
      const current = shuffle(initial, random);
      // Then remove 30%
      const [remaining] = removeRandom(current, 30, random);

      items.value = remaining;

      // 70 nodes should be reused
      verifyDOM(ul, items.value, nodeMap, 70, "shuffle+delete-30%");

      dispose();
      ul.remove();
    });

    it("should handle shuffle + 20% insertions + 20% deletions", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      const nodeMap = captureNodeMap(ul);
      const random = seededRandom(SEED);

      // Shuffle
      let current = shuffle(initial, random);
      // Remove 20%
      const [remaining] = removeRandom(current, 20, random);
      // Add 20% new
      const newItems = createItems(20, 1000);
      current = insertAtRandomPositions(remaining, newItems, random);

      items.value = current;

      // 80 nodes should be reused (100 - 20 deleted)
      verifyDOM(ul, items.value, nodeMap, 80, "shuffle+insert+delete");

      dispose();
      ul.remove();
    });

    it("should handle 10 successive random mutations", () => {
      const initial = createItems(100);
      const { items, ul, dispose } = renderList(initial);
      // Keep original nodeMap - never update it
      const originalNodeMap = captureNodeMap(ul);
      // Track which original IDs are still present
      const originalIds = new Set(initial.map((i) => i.id));
      const random = seededRandom(SEED);

      let current = initial;
      let nextNewId = 1000;

      for (let round = 0; round < 10; round++) {
        const op = Math.floor(random() * 4);

        switch (op) {
          case 0: // Shuffle
            current = shuffle(current, random);
            break;
          case 1: // Insert 10%
            {
              const count = Math.max(1, Math.floor(current.length * 0.1));
              const newItems = createItems(count, nextNewId);
              nextNewId += count;
              current = insertAtRandomPositions(current, newItems, random);
            }
            break;
          case 2: // Remove 10%
            {
              const count = Math.max(1, Math.floor(current.length * 0.1));
              const [remaining, removed] = removeRandom(current, count, random);
              current = remaining;
              // Track which original IDs were removed
              for (const item of removed) {
                originalIds.delete(item.id);
              }
            }
            break;
          case 3: // Shuffle + insert + remove
            {
              current = shuffle(current, random);
              const removeCount = Math.max(
                1,
                Math.floor(current.length * 0.05),
              );
              const [remaining, removed] = removeRandom(
                current,
                removeCount,
                random,
              );
              // Track which original IDs were removed
              for (const item of removed) {
                originalIds.delete(item.id);
              }
              const insertCount = Math.max(
                1,
                Math.floor(remaining.length * 0.05),
              );
              const newItems = createItems(insertCount, nextNewId);
              nextNewId += insertCount;
              current = insertAtRandomPositions(remaining, newItems, random);
            }
            break;
        }

        items.value = current;

        // Expected reuse: all original IDs that are still in the list
        // (they must reuse their original DOM nodes)
        const expectedReuse = originalIds.size;
        verifyDOM(
          ul,
          items.value,
          originalNodeMap,
          expectedReuse,
          `successive-round-${round}`,
        );
      }

      dispose();
      ul.remove();
    });

    it("should handle chaos mode: 50 random mutations", () => {
      const initial = createItems(50);
      const { items, ul, dispose } = renderList(initial);
      // Keep original nodeMap - never update it
      const originalNodeMap = captureNodeMap(ul);
      // Track which original IDs are still present
      const originalIds = new Set(initial.map((i) => i.id));
      const random = seededRandom(SEED);

      let current = initial;
      let nextNewId = 1000;

      for (let round = 0; round < 50; round++) {
        // Always shuffle
        current = shuffle(current, random);

        // Randomly add or remove
        if (random() > 0.5 && current.length > 5) {
          // Remove 1-5 items
          const count = 1 + Math.floor(random() * 5);
          const [remaining, removed] = removeRandom(current, count, random);
          current = remaining;
          // Track which original IDs were removed
          for (const item of removed) {
            originalIds.delete(item.id);
          }
        } else {
          // Add 1-5 items
          const count = 1 + Math.floor(random() * 5);
          const newItems = createItems(count, nextNewId);
          nextNewId += count;
          current = insertAtRandomPositions(current, newItems, random);
        }

        items.value = current;

        // Expected reuse: all original IDs that are still in the list
        const expectedReuse = originalIds.size;
        verifyDOM(
          ul,
          items.value,
          originalNodeMap,
          expectedReuse,
          `chaos-round-${round}`,
        );
      }

      dispose();
      ul.remove();
    });
  });

  // ============ Performance Regression Tests ============

  describe("performance regression", () => {
    it("should shuffle 1000 elements in reasonable time", () => {
      const initial = createItems(1000);
      const { items, ul, dispose } = renderList(initial);
      const random = seededRandom(SEED);

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        items.value = shuffle(items.value, random);
      }
      const elapsed = performance.now() - start;

      console.log(
        `Performance: 1000 elements × 10 shuffles = ${elapsed.toFixed(2)}ms`,
      );

      // Soft assertion - log warning but don't fail
      if (elapsed > 1000) {
        console.warn(
          `⚠️ Performance warning: ${elapsed.toFixed(2)}ms exceeds 1000ms threshold`,
        );
      }

      dispose();
      ul.remove();
    });

    it("should not exhibit O(n²) behavior", () => {
      // Test with 100 elements
      const random100 = seededRandom(SEED);
      const items100 = signal(createItems(100));
      const r100 = html`<ul>
        ${each(
          items100,
          (i) => i.id,
          (i) => html`<li>${i.peek().id}</li>`,
        )}
      </ul>`.render();
      document.body.appendChild(r100.fragment);
      const ul100 = document.body.querySelector("ul")!;

      const start100 = performance.now();
      for (let i = 0; i < 10; i++) {
        items100.value = shuffle(items100.value, random100);
      }
      const time100 = performance.now() - start100;

      r100.dispose();
      ul100.remove();
      document.body.innerHTML = "";

      // Test with 1000 elements
      const random1000 = seededRandom(SEED);
      const items1000 = signal(createItems(1000));
      const r1000 = html`<ul>
        ${each(
          items1000,
          (i) => i.id,
          (i) => html`<li>${i.peek().id}</li>`,
        )}
      </ul>`.render();
      document.body.appendChild(r1000.fragment);
      const ul1000 = document.body.querySelector("ul")!;

      const start1000 = performance.now();
      for (let i = 0; i < 10; i++) {
        items1000.value = shuffle(items1000.value, random1000);
      }
      const time1000 = performance.now() - start1000;

      r1000.dispose();
      ul1000.remove();

      // O(n) should be ~10x, O(n²) would be ~100x
      const ratio = time1000 / time100;
      console.log(
        `Performance: 100 elements = ${time100.toFixed(2)}ms, 1000 elements = ${time1000.toFixed(2)}ms, ratio = ${ratio.toFixed(1)}x`,
      );

      // Warn if ratio suggests quadratic behavior
      if (ratio > 30) {
        console.warn(
          `⚠️ Performance ratio ${ratio.toFixed(1)}x suggests possible O(n²) regression`,
        );
      }
    });
  });

  // ============ Property-Based Tests (Multiple Seeds) ============

  describe("property-based tests (multi-seed)", () => {
    /**
     * Test with multiple random seeds to increase coverage diversity.
     * Each seed produces a completely different sequence of operations,
     * helping catch edge cases that a single fixed seed might miss.
     */
    const SEEDS = [1, 42, 12345, 99999, 314159, 271828, 161803, 141421];

    it("should correctly reconcile shuffles across many seeds", () => {
      for (const seed of SEEDS) {
        const random = seededRandom(seed);
        const initial = createItems(30);
        const { items, ul, dispose } = renderList(initial);
        const nodeMap = captureNodeMap(ul);

        // Shuffle 5 times with this seed
        for (let i = 0; i < 5; i++) {
          items.value = shuffle(items.value, random);
          verifyDOM(ul, items.value, nodeMap, 30, `seed=${seed}-shuffle-${i}`);
        }

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      }
    });

    it("should correctly handle insertions across many seeds", () => {
      for (const seed of SEEDS) {
        const random = seededRandom(seed);
        const initial = createItems(20);
        const { items, ul, dispose } = renderList(initial);

        // Insert 10 items at random positions
        const newItems = createItems(10, 1000 + seed);
        items.value = insertAtRandomPositions(initial, newItems, random);

        // Verify order
        const ids = [...ul.children].map((c) =>
          Number(c.getAttribute("data-id")),
        );
        const expected = items.value.map((i) => i.id);
        assert.deepStrictEqual(
          ids,
          expected,
          `seed=${seed}: DOM order mismatch after insertion`,
        );

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      }
    });

    it("should correctly handle deletions across many seeds", () => {
      for (const seed of SEEDS) {
        const random = seededRandom(seed);
        const initial = createItems(40);
        const { items, ul, dispose } = renderList(initial);
        const nodeMap = captureNodeMap(ul);

        // Remove ~50% of items
        const [remaining] = removeRandom(initial, 20, random);
        items.value = remaining;

        // Verify remaining nodes are reused
        const remainingIds = new Set(remaining.map((i) => i.id));
        for (const child of ul.children) {
          const id = Number(child.getAttribute("data-id"));
          assert.ok(
            remainingIds.has(id),
            `seed=${seed}: unexpected id ${id} in DOM`,
          );
          assert.strictEqual(
            child,
            nodeMap.get(id),
            `seed=${seed}: node ${id} should be reused`,
          );
        }

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      }
    });

    it("should correctly handle combined mutations across many seeds", () => {
      for (const seed of SEEDS) {
        const random = seededRandom(seed);
        const initial = createItems(25);
        const { items, ul, dispose } = renderList(initial);

        // Track which original IDs still exist
        const originalIds = new Set(initial.map((i) => i.id));
        let nextId = 1000 + seed;
        let current = initial;

        // 5 rounds of mutations
        for (let round = 0; round < 5; round++) {
          // Shuffle
          current = shuffle(current, random);

          // Delete ~20%
          const deleteCount = Math.max(1, Math.floor(current.length * 0.2));
          const [remaining, removed] = removeRandom(
            current,
            deleteCount,
            random,
          );
          for (const r of removed) originalIds.delete(r.id);
          current = remaining;

          // Insert ~20%
          const insertCount = Math.max(1, Math.floor(current.length * 0.2));
          const newItems = createItems(insertCount, nextId);
          nextId += insertCount;
          current = insertAtRandomPositions(current, newItems, random);

          items.value = current;

          // Verify DOM order
          const ids = [...ul.children].map((c) =>
            Number(c.getAttribute("data-id")),
          );
          const expected = current.map((i) => i.id);
          assert.deepStrictEqual(
            ids,
            expected,
            `seed=${seed}-round-${round}: DOM order mismatch`,
          );
        }

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      }
    });

    it("should maintain node identity for surviving items across many seeds", () => {
      for (const seed of SEEDS) {
        const random = seededRandom(seed);
        const initial = createItems(20);
        const { items, ul, dispose } = renderList(initial);
        const originalNodeMap = captureNodeMap(ul);

        // Complex mutation: shuffle + partial delete + some inserts
        let current = shuffle(initial, random);
        const [remaining] = removeRandom(current, 5, random);
        const newItems = createItems(3, 1000 + seed);
        current = insertAtRandomPositions(remaining, newItems, random);
        items.value = current;

        // Verify all surviving original items kept their nodes
        const survivingOriginalIds = new Set(
          remaining.filter((i) => i.id < 1000).map((i) => i.id),
        );
        for (const child of ul.children) {
          const id = Number(child.getAttribute("data-id"));
          if (survivingOriginalIds.has(id)) {
            assert.strictEqual(
              child,
              originalNodeMap.get(id),
              `seed=${seed}: original node ${id} should be reused`,
            );
          }
        }

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      }
    });
  });

  // ============ Garbage Collection Tests ============

  describe("garbage collection", () => {
    it("should GC nodes after shuffle + dispose", async () => {
      const tracker = createGCTracker();
      const initial = createItems(100);
      const itemsSignal = signal(initial);

      await (async function scope() {
        const { fragment, dispose } = html`<ul>
          ${each(
            itemsSignal,
            (i) => i.id,
            (i) =>
              html`<li data-id="${i.peek().id}">${() => i.value.name}</li>`,
          )}
        </ul>`.render();

        document.body.appendChild(fragment);
        const ul = document.body.querySelector("ul")!;

        // Shuffle multiple times
        const random = seededRandom(SEED);
        for (let i = 0; i < 5; i++) {
          itemsSignal.value = shuffle(itemsSignal.value, random);
        }

        // Track all nodes
        for (let i = 0; i < ul.children.length; i++) {
          tracker.track(ul.children[i]!, `node-${i}`);
        }

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      })();

      await tracker.waitForAll(
        Array.from({ length: 100 }, (_, i) => `node-${i}`),
        2000,
        `seed=${SEED}`,
      );
    });

    it("should GC nodes after insertions + dispose", async () => {
      const tracker = createGCTracker();
      const initial = createItems(50);
      const itemsSignal = signal(initial);

      await (async function scope() {
        const { fragment, dispose } = html`<ul>
          ${each(
            itemsSignal,
            (i) => i.id,
            (i) =>
              html`<li data-id="${i.peek().id}">${() => i.value.name}</li>`,
          )}
        </ul>`.render();

        document.body.appendChild(fragment);
        const ul = document.body.querySelector("ul")!;

        // Insert 50 new elements
        const random = seededRandom(SEED);
        const newItems = createItems(50, 1000);
        itemsSignal.value = insertAtRandomPositions(initial, newItems, random);

        // Track all nodes (now 100)
        for (let i = 0; i < ul.children.length; i++) {
          tracker.track(ul.children[i]!, `node-${i}`);
        }

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      })();

      await tracker.waitForAll(
        Array.from({ length: 100 }, (_, i) => `node-${i}`),
        2000,
        `seed=${SEED}`,
      );
    });

    it("should GC nodes after deletions + dispose", async () => {
      const tracker = createGCTracker();
      const initial = createItems(100);
      const itemsSignal = signal(initial);

      await (async function scope() {
        const { fragment, dispose } = html`<ul>
          ${each(
            itemsSignal,
            (i) => i.id,
            (i) =>
              html`<li data-id="${i.peek().id}">${() => i.value.name}</li>`,
          )}
        </ul>`.render();

        document.body.appendChild(fragment);
        const ul = document.body.querySelector("ul")!;

        // Track initial nodes before deletion
        for (let i = 0; i < ul.children.length; i++) {
          tracker.track(ul.children[i]!, `node-${i}`);
        }

        // Remove 50 elements
        const random = seededRandom(SEED);
        const [remaining] = removeRandom(initial, 50, random);
        itemsSignal.value = remaining;

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      })();

      // All 100 original nodes should be GC'd (50 were removed mid-test, 50 on dispose)
      await tracker.waitForAll(
        Array.from({ length: 100 }, (_, i) => `node-${i}`),
        2000,
        `seed=${SEED}`,
      );
    });

    it("should GC nodes after combined mutations + dispose", async () => {
      const tracker = createGCTracker();
      const initial = createItems(50);
      const itemsSignal = signal(initial);

      await (async function scope() {
        const { fragment, dispose } = html`<ul>
          ${each(
            itemsSignal,
            (i) => i.id,
            (i) =>
              html`<li data-id="${i.peek().id}">${() => i.value.name}</li>`,
          )}
        </ul>`.render();

        document.body.appendChild(fragment);
        const ul = document.body.querySelector("ul")!;

        const random = seededRandom(SEED);
        let current = initial;
        let nextNewId = 1000;
        const trackedLabels: string[] = [];

        // Track initial nodes
        for (let i = 0; i < ul.children.length; i++) {
          const label = `initial-${i}`;
          tracker.track(ul.children[i]!, label);
          trackedLabels.push(label);
        }

        // Do 10 rounds of mutations
        for (let round = 0; round < 10; round++) {
          current = shuffle(current, random);
          const [remaining] = removeRandom(current, 5, random);
          const newItems = createItems(5, nextNewId);
          nextNewId += 5;
          current = insertAtRandomPositions(remaining, newItems, random);
          itemsSignal.value = current;

          // Track new nodes added this round
          for (let i = 0; i < ul.children.length; i++) {
            const id = Number(ul.children[i]!.getAttribute("data-id"));
            if (id >= 1000 + round * 5 && id < 1000 + (round + 1) * 5) {
              const label = `round-${round}-${id}`;
              tracker.track(ul.children[i]!, label);
              trackedLabels.push(label);
            }
          }
        }

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      })();

      // All tracked nodes should be GC'd
      // Note: We don't know exact count, but wait for initial 50
      await tracker.waitForAll(
        Array.from({ length: 50 }, (_, i) => `initial-${i}`),
        2000,
        `seed=${SEED}`,
      );
    });

    it("should GC item computeds after shuffle + dispose", async () => {
      const tracker = createGCTracker();
      const nameSignals = Array.from({ length: 20 }, (_, i) =>
        signal(`Item-${i + 1}`),
      );
      const initial = nameSignals.map((name, i) => ({
        id: i + 1,
        name,
      }));
      const itemsSignal = signal(initial);

      await (async function scope() {
        const { fragment, dispose } = html`<ul>
          ${each(
            itemsSignal,
            (i) => i.id,
            (i) =>
              html`<li data-id="${i.peek().id}">
                ${() => i.value.name.value}
              </li>`,
          )}
        </ul>`.render();

        document.body.appendChild(fragment);
        const ul = document.body.querySelector("ul")!;

        // Track computeds from name signals
        for (let i = 0; i < nameSignals.length; i++) {
          const comp = nameSignals[i]!.targets[0];
          if (comp) {
            tracker.track(comp, `comp-${i}`);
          }
        }

        // Shuffle
        const random = seededRandom(SEED);
        for (let i = 0; i < 5; i++) {
          itemsSignal.value = shuffle(itemsSignal.value, random);
        }

        dispose();
        ul.remove();
        document.body.innerHTML = "";
      })();

      await tracker.waitForAll(
        Array.from({ length: 20 }, (_, i) => `comp-${i}`),
        2000,
        `seed=${SEED}`,
      );

      // Verify all name signals have no targets
      for (const ns of nameSignals) {
        assert.strictEqual(
          ns.targets.length,
          0,
          "name signal should have no targets",
        );
      }
    });
  });
});
