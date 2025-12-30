import { computed } from "../../src/index.js";
import type { Signal } from "../../src/signals/signal.js";

export type CellType =
  | "input"
  | "formula"
  | "multiplier"
  | "sum-neighbors"
  | "max"
  | "min"
  | "average"
  | "row-sum"
  | "column-sum";

export interface Cell {
  id: number;
  type: CellType;
  value: Signal<number>;
  formula?: () => number;
  computed?: ReturnType<typeof computed<number>>;
  multiplier?: number; // x2, x5, x10
  specialLabel?: string; // Display label for special cells
  dependencies?: Cell[]; // Track which cells this depends on
}
