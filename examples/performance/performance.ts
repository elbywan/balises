import { html, signal, computed, each, batch } from "../../src/index.js";
import type { Cell } from "./types.js";
import { CellFactory } from "./cell-factory.js";
import { GridCell } from "./components/grid-cell.js";
import { MetricCard } from "./components/metric-card.js";
import { ControlGroup } from "./components/control-group.js";

/**
 * Performance demo showcasing surgical reactivity with computed values
 *
 * This demo is structured with reusable components:
 * - GridCell: Individual cell component
 * - MetricCard: Performance metric display
 * - ControlGroup: Action button groups
 * - CellFactory: Factory for creating different cell types
 */
export class PerformanceElement extends HTMLElement {
  #cells = signal<Cell[]>([]);
  #running = signal(false);
  #intervalId: ReturnType<typeof setInterval> | null = null;
  #totalUpdates = signal(0);
  #fps = signal(0);
  #lastBenchmark = signal<{ duration: number; operation: string } | null>(null);
  #updatesPerSecond = signal(0);
  #dispose: (() => void) | null = null;
  #updateCountInLastSecond = 0;
  #lastSecondTimestamp = 0;
  #updateRate = signal(30); // Target updates per second

  connectedCallback() {
    this.#initializeCells();
    this.#startFPSCounter();
    this.#render();
    this.#attachHoverListeners();
  }

  /**
   * Initialize the 10x10 grid of cells with various types
   */
  #initializeCells() {
    const cells: Cell[] = [];

    // Create input cells (first 20)
    for (let i = 0; i < 20; i++) {
      cells.push(CellFactory.createInput(i));
    }

    // Define special cell positions and types
    const specialCells = [
      { id: 23, type: "multiplier" as const, multiplier: 2, label: "×2" },
      { id: 29, type: "row-sum" as const, label: "ROW" },
      { id: 34, type: "sum-neighbors" as const, label: "SUM" },
      { id: 45, type: "multiplier" as const, multiplier: 5, label: "×5" },
      { id: 56, type: "max" as const, label: "MAX" },
      { id: 64, type: "column-sum" as const, label: "COL" },
      { id: 67, type: "multiplier" as const, multiplier: 10, label: "×10" },
      { id: 72, type: "sum-neighbors" as const, label: "SUM" },
      { id: 78, type: "min" as const, label: "MIN" },
      { id: 89, type: "average" as const, label: "AVG" },
    ];

    // Create formula cells (20-99) with special cells mixed in
    for (let i = 20; i < 100; i++) {
      const specialConfig = specialCells.find((s) => s.id === i);

      if (specialConfig) {
        const cell: Cell = {
          id: i,
          type: specialConfig.type,
          value: signal(0),
          specialLabel: specialConfig.label,
        };

        // Create appropriate cell type
        if (specialConfig.type === "multiplier") {
          cells.push(
            CellFactory.createMultiplier(
              i,
              cells,
              specialConfig.multiplier!,
              specialConfig.label,
            ),
          );
        } else if (specialConfig.type === "max") {
          cells.push(CellFactory.createMax(i, cells));
        } else if (specialConfig.type === "min") {
          cells.push(CellFactory.createMin(i, cells));
        } else if (specialConfig.type === "average") {
          cells.push(CellFactory.createAverage(i, cells));
        } else {
          // sum-neighbors, row-sum, column-sum - will be set later
          cell.computed = null!;
          cells.push(cell);
        }
      } else {
        // Regular formula cell
        cells.push(CellFactory.createFormula(i, cells));
      }
    }

    // Now create sum-neighbors, row-sum, and column-sum computeds
    cells.forEach((cell) => {
      if (cell.type === "sum-neighbors") {
        CellFactory.addSumNeighbors(cell, cells);
      } else if (cell.type === "row-sum") {
        CellFactory.addRowSum(cell, cells);
      } else if (cell.type === "column-sum") {
        CellFactory.addColumnSum(cell, cells);
      }
    });

    this.#cells.value = cells;
  }

  /**
   * Start the FPS counter
   */
  #startFPSCounter() {
    let frameCount = 0;
    let lastTime = performance.now();

    const updateFPS = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        this.#fps.value = Math.round((frameCount * 1000) / (now - lastTime));
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(updateFPS);
    };

    requestAnimationFrame(updateFPS);
  }

  /**
   * Handle cell increment
   */
  #handleCellIncrement = (cell: Cell) => {
    cell.value.value += 1;
    this.#totalUpdates.value += 1;
  };

  /**
   * Update multiple random inputs (batched for performance)
   */
  #updateRandomInputs = (count: number) => {
    batch(() => {
      const inputs = this.#cells.value.filter((c) => c.type === "input");
      for (let i = 0; i < count; i++) {
        const randomCell = inputs[Math.floor(Math.random() * inputs.length)];
        if (randomCell) {
          randomCell.value.value += 1;
          this.#totalUpdates.value += 1;
        }
      }
    });
  };

  /**
   * Run a benchmark test
   */
  #benchmark = (operation: string, count: number) => {
    const start = performance.now();
    this.#updateRandomInputs(count);
    const end = performance.now();
    const duration = end - start;

    this.#lastBenchmark.value = {
      operation,
      duration: Math.round(duration * 100) / 100,
    };
  };

  /**
   * Toggle continuous update mode
   */
  #toggle = () => {
    if (this.#running.value) {
      this.#stop();
      this.#updatesPerSecond.value = 0;
    } else {
      this.#start();
    }
  };

  /**
   * Reset all values
   */
  #reset = () => {
    this.#stop();
    this.#cells.value.forEach((cell) => {
      if (cell.type === "input") {
        cell.value.value = 1;
      }
    });
    this.#totalUpdates.value = 0;
    this.#lastBenchmark.value = null;
    this.#updatesPerSecond.value = 0;
  };

  /**
   * Render the component
   */
  #render() {
    const buttonText = computed(() =>
      this.#running.value ? "Stop Auto-Update" : "Start Auto-Update",
    );

    const { fragment, dispose } = html`
      <div class="performance-demo">
        <div class="header">
          <h2>Spreadsheet Performance Demo</h2>
          <p class="description">
            <strong class="input-color">Click green cells</strong> to update,
            <strong class="formula-color">purple cells</strong> are formulas,
            <strong class="multiplier-color">special cells</strong> have unique
            powers! Hover to see dependencies.
          </p>
        </div>

        <div class="metrics">
          ${MetricCard({ label: "FPS", value: this.#fps })}
          ${MetricCard({ label: "Updates", value: this.#totalUpdates })}
          ${MetricCard({
            label: "Benchmark",
            value: () =>
              this.#lastBenchmark.value
                ? `${this.#lastBenchmark.value.duration}ms`
                : "-",
            highlight: this.#lastBenchmark,
          })}
          ${MetricCard({
            label: "Updates/s",
            value: () =>
              this.#updatesPerSecond.value > 0
                ? this.#updatesPerSecond.value.toLocaleString()
                : "-",
            highlight: this.#running,
          })}
        </div>

        <div class="controls">
          ${ControlGroup({
            title: "Benchmark:",
            children: html`
              <button @click=${() => this.#benchmark("5 inputs", 5)}>5</button>
              <button @click=${() => this.#benchmark("10 inputs", 10)}>
                10
              </button>
              <button @click=${() => this.#benchmark("20 inputs", 20)}>
                20
              </button>
            `,
          })}
          ${ControlGroup({
            title: "Updates/s:",
            children: html`
              <input
                type="number"
                min="1"
                max="500"
                .value=${() => this.#updateRate.value}
                @input=${(e: Event) => {
                  const value = parseInt((e.target as HTMLInputElement).value);
                  if (value >= 1 && value <= 500) {
                    this.#setUpdateRate(value);
                  }
                }}
                style="width: 70px; padding: 0.4rem 0.5rem; font-size: 0.75rem; border: 1px solid #1f1f23; border-radius: 4px; background: #1a1a1d; color: #ededef; text-align: center; font-weight: 500;"
                title="Target updates per second (actual rate depends on system performance)"
              />
            `,
          })}
          ${ControlGroup({
            title: "Continuous:",
            children: html`
              <button @click=${this.#toggle} class="primary">
                ${buttonText}
              </button>
              <button @click=${this.#reset} class="danger">Reset</button>
            `,
          })}
        </div>

        <div class="demo-layout">
          <div class="main-content">
            <div class="grid-container">
              <div class="grid">
                ${each(
                  this.#cells,
                  (cell) => cell.id,
                  (cell) =>
                    GridCell({ cell, onIncrement: this.#handleCellIncrement }),
                )}
              </div>
              <div class="legend">
                <div class="legend-item">
                  <div class="legend-box input-box"></div>
                  <span>Input (20)</span>
                </div>
                <div class="legend-item">
                  <div class="legend-box formula-box"></div>
                  <span>Formula (72)</span>
                </div>
                <div class="legend-item">
                  <div class="legend-box multiplier-box"></div>
                  <span>Special (8)</span>
                </div>
                <div
                  class="legend-item"
                  style="color: #8b8b8d; font-size: 0.85rem;"
                >
                  = 100 cells total
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
  }

  /**
   * Attach hover listeners for dependency visualization
   */
  #attachHoverListeners() {
    setTimeout(() => {
      const cellElements = this.querySelectorAll(".cell[data-cell-id]");

      cellElements.forEach((element) => {
        element.addEventListener("mouseenter", (e) => {
          const target = e.currentTarget as HTMLElement;
          const cellId = parseInt(target.getAttribute("data-cell-id") || "0");
          const cell = this.#cells.value[cellId];

          if (cell) {
            target.classList.add("is-hovering");

            if (cell.type === "input") {
              // For input cells: show what depends on them (what they affect)
              const dependents = this.#cells.value.filter(
                (c) =>
                  c.dependencies &&
                  c.dependencies.some((dep) => dep.id === cell.id),
              );

              dependents.forEach((dependent) => {
                const depElement = this.querySelector(
                  `[data-cell-id="${dependent.id}"]`,
                );
                if (depElement) {
                  depElement.classList.add("is-dependency");
                }
              });

              target.setAttribute(
                "data-formula",
                dependents.length > 0
                  ? `Input Cell (affects ${dependents.length} cell${dependents.length > 1 ? "s" : ""})`
                  : "Input Cell",
              );
            } else {
              // For formula cells: show what they depend on (their inputs)
              if (cell.dependencies && cell.dependencies.length > 0) {
                cell.dependencies.forEach((dep) => {
                  const depElement = this.querySelector(
                    `[data-cell-id="${dep.id}"]`,
                  );
                  if (depElement) {
                    depElement.classList.add("is-dependency");
                  }
                });

                const formula = this.#getFormulaDisplay(cell);
                target.setAttribute("data-formula", formula);
              }
            }
          }
        });

        element.addEventListener("mouseleave", () => {
          cellElements.forEach((el) => {
            el.classList.remove("is-hovering", "is-dependency");
            el.removeAttribute("data-formula");
          });
        });
      });
    }, 100);
  }

  /**
   * Get formula display string for tooltip
   */
  #getFormulaDisplay(cell: Cell): string {
    if (!cell.dependencies || cell.dependencies.length === 0) {
      return "Input Cell";
    }

    // Helper to get the correct value (computed or signal)
    const getValue = (dep: Cell) =>
      dep.computed ? dep.computed.value : dep.value.value;

    const depValues = cell.dependencies.map((d) => getValue(d)).join(", ");

    if (cell.type === "multiplier") {
      const firstDep = cell.dependencies[0];
      return `${firstDep ? getValue(firstDep) : 0} × ${cell.multiplier}`;
    } else if (cell.type === "sum-neighbors") {
      return `SUM(neighbors: ${depValues})`;
    } else if (cell.type === "row-sum") {
      return `SUM(row: ${cell.dependencies.length} cells)`;
    } else if (cell.type === "column-sum") {
      return `SUM(column: ${cell.dependencies.length} cells)`;
    } else if (cell.type === "max") {
      return `MAX(${depValues})`;
    } else if (cell.type === "min") {
      return `MIN(${depValues})`;
    } else if (cell.type === "average") {
      return `AVG(${depValues})`;
    } else {
      return `SUM(${depValues})`;
    }
  }

  /**
   * Start continuous update mode
   */
  #start() {
    if (!this.#running.value) {
      this.#running.value = true;
      this.#lastSecondTimestamp = performance.now();
      this.#updateCountInLastSecond = 0;

      // Calculate interval based on update rate (updates per second)
      // Use simple formula: smaller interval = more frequent updates
      const intervalMs = 1000 / this.#updateRate.value;

      // Cache input cells for performance
      const inputCells = this.#cells.value.filter((c) => c.type === "input");

      this.#intervalId = setInterval(() => {
        const now = performance.now();
        const batchStart = performance.now();

        batch(() => {
          const randomCell =
            inputCells[Math.floor(Math.random() * inputCells.length)];
          if (randomCell) {
            randomCell.value.value += 1;
            this.#totalUpdates.value += 1;
            this.#updateCountInLastSecond += 1;
          }
        });

        const batchEnd = performance.now();
        const batchDuration = batchEnd - batchStart;

        // Update benchmark with current batch duration
        this.#lastBenchmark.value = {
          duration: parseFloat(batchDuration.toFixed(2)),
          operation: `1 input (continuous)`,
        };

        // Calculate actual updates/s based on rolling 1-second window
        const elapsed = now - this.#lastSecondTimestamp;
        if (elapsed >= 1000) {
          this.#updatesPerSecond.value = Math.round(
            (this.#updateCountInLastSecond / elapsed) * 1000,
          );
          this.#lastSecondTimestamp = now;
          this.#updateCountInLastSecond = 0;
        }
      }, intervalMs);
    }
  }

  /**
   * Set the target update rate and restart if running
   */
  #setUpdateRate = (rate: number) => {
    this.#updateRate.value = rate;
    // If currently running, restart with new rate
    if (this.#running.value) {
      this.#stop();
      this.#start();
    }
  };

  /**
   * Stop continuous update mode
   */
  #stop() {
    if (this.#running.value) {
      this.#running.value = false;
      if (this.#intervalId) {
        clearInterval(this.#intervalId);
        this.#intervalId = null;
      }
      this.#updatesPerSecond.value = 0;
      this.#updateCountInLastSecond = 0;
    }
  }

  disconnectedCallback() {
    this.#stop();
    this.#dispose?.();
  }
}

customElements.define("x-performance", PerformanceElement);
