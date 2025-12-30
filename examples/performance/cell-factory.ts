import { Signal, computed } from "../../src/index.js";
import type { Cell } from "./types.js";

/**
 * Factory for creating cell instances with computed formulas
 */
export class CellFactory {
  private static readonly GRID_SIZE = 10;

  /**
   * Create an input cell (user can click to increment)
   */
  static createInput(id: number): Cell {
    return {
      id,
      type: "input",
      value: new Signal(1),
    };
  }

  /**
   * Create a formula cell that sums two dependencies
   */
  static createFormula(id: number, cells: Cell[]): Cell {
    const cell: Cell = {
      id,
      type: "formula",
      value: new Signal(0),
    };

    const deps = [
      cells[Math.floor(Math.random() * id)]!,
      cells[Math.floor(Math.random() * id)]!,
    ];

    cell.dependencies = deps;
    cell.computed = computed(() => {
      const sum = deps.reduce((acc, dep) => {
        const val = dep.computed ? dep.computed.value : dep.value.value;
        return acc + val;
      }, 0);
      return isFinite(sum) ? sum : 0;
    });

    return cell;
  }

  /**
   * Create a multiplier cell (multiplies dependency by a factor)
   */
  static createMultiplier(
    id: number,
    cells: Cell[],
    multiplier: number,
    label: string,
  ): Cell {
    const cell: Cell = {
      id,
      type: "multiplier",
      value: new Signal(0),
      multiplier,
      specialLabel: label,
    };

    const dep = cells[Math.floor(Math.random() * id)]!;
    cell.dependencies = [dep];
    cell.computed = computed(() => {
      const val = dep.computed ? dep.computed.value : dep.value.value;
      const result = Math.floor(val * multiplier);
      return isFinite(result) ? result : 0;
    });

    return cell;
  }

  /**
   * Create a MAX cell (maximum of dependencies)
   */
  static createMax(id: number, cells: Cell[]): Cell {
    const cell: Cell = {
      id,
      type: "max",
      value: new Signal(0),
      specialLabel: "MAX",
    };

    const deps = Array.from(
      { length: 4 },
      () => cells[Math.floor(Math.random() * id)]!,
    );

    cell.dependencies = deps;
    cell.computed = computed(() => {
      const values = deps.map((dep) =>
        dep.computed ? dep.computed.value : dep.value.value,
      );
      const result = Math.max(...values);
      return isFinite(result) ? result : 0;
    });

    return cell;
  }

  /**
   * Create a MIN cell (minimum of dependencies)
   */
  static createMin(id: number, cells: Cell[]): Cell {
    const cell: Cell = {
      id,
      type: "min",
      value: new Signal(0),
      specialLabel: "MIN",
    };

    const deps = Array.from(
      { length: 4 },
      () => cells[Math.floor(Math.random() * id)]!,
    );

    cell.dependencies = deps;
    cell.computed = computed(() => {
      const values = deps.map((dep) =>
        dep.computed ? dep.computed.value : dep.value.value,
      );
      const result = Math.min(...values);
      return isFinite(result) ? result : 0;
    });

    return cell;
  }

  /**
   * Create an AVERAGE cell
   */
  static createAverage(id: number, cells: Cell[]): Cell {
    const cell: Cell = {
      id,
      type: "average",
      value: new Signal(0),
      specialLabel: "AVG",
    };

    const deps = Array.from(
      { length: 5 },
      () => cells[Math.floor(Math.random() * id)]!,
    );

    cell.dependencies = deps;
    cell.computed = computed(() => {
      const sum = deps.reduce((acc, dep) => {
        const val = dep.computed ? dep.computed.value : dep.value.value;
        return acc + val;
      }, 0);
      const result = Math.floor(sum / deps.length);
      return isFinite(result) ? result : 0;
    });

    return cell;
  }

  /**
   * Add sum-neighbors computed after all cells exist
   */
  static addSumNeighbors(cell: Cell, allCells: Cell[]): void {
    const neighbors = this.getNeighbors(cell.id, allCells);
    cell.dependencies = neighbors;
    cell.computed = computed(() => {
      const sum = neighbors.reduce((acc, neighbor) => {
        const val = neighbor.computed
          ? neighbor.computed.value
          : neighbor.value.value;
        return acc + val;
      }, 0);
      return isFinite(sum) ? sum : 0;
    });
  }

  /**
   * Add row-sum computed after all cells exist
   */
  static addRowSum(cell: Cell, allCells: Cell[]): void {
    const rowCells = this.getRowCells(cell.id, allCells);
    cell.dependencies = rowCells;
    cell.computed = computed(() => {
      const sum = rowCells.reduce((acc, rowCell) => {
        const val = rowCell.computed
          ? rowCell.computed.value
          : rowCell.value.value;
        return acc + val;
      }, 0);
      return isFinite(sum) ? sum : 0;
    });
  }

  /**
   * Add column-sum computed after all cells exist
   */
  static addColumnSum(cell: Cell, allCells: Cell[]): void {
    const colCells = this.getColumnCells(cell.id, allCells);
    cell.dependencies = colCells;
    cell.computed = computed(() => {
      const sum = colCells.reduce((acc, colCell) => {
        const val = colCell.computed
          ? colCell.computed.value
          : colCell.value.value;
        return acc + val;
      }, 0);
      return isFinite(sum) ? sum : 0;
    });
  }

  // Helper methods
  private static getNeighbors(id: number, allCells: Cell[]): Cell[] {
    const row = Math.floor(id / this.GRID_SIZE);
    const col = id % this.GRID_SIZE;
    const neighbors: Cell[] = [];

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const newRow = row + dr;
        const newCol = col + dc;
        if (
          newRow >= 0 &&
          newRow < this.GRID_SIZE &&
          newCol >= 0 &&
          newCol < this.GRID_SIZE
        ) {
          const neighborId = newRow * this.GRID_SIZE + newCol;
          const neighbor = allCells[neighborId];
          if (neighbor) neighbors.push(neighbor);
        }
      }
    }
    return neighbors;
  }

  private static getRowCells(id: number, allCells: Cell[]): Cell[] {
    const row = Math.floor(id / this.GRID_SIZE);
    const rowCells: Cell[] = [];
    for (let col = 0; col < this.GRID_SIZE; col++) {
      const cellId = row * this.GRID_SIZE + col;
      if (cellId !== id && allCells[cellId]) {
        rowCells.push(allCells[cellId]);
      }
    }
    return rowCells;
  }

  private static getColumnCells(id: number, allCells: Cell[]): Cell[] {
    const col = id % this.GRID_SIZE;
    const colCells: Cell[] = [];
    for (let row = 0; row < this.GRID_SIZE; row++) {
      const cellId = row * this.GRID_SIZE + col;
      if (cellId !== id && allCells[cellId]) {
        colCells.push(allCells[cellId]);
      }
    }
    return colCells;
  }
}
