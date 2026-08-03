/**
 * Preact DOM Benchmark Implementation
 *
 * Real-world preact: function components + hooks, keyed rows, memoized Row
 * component with a custom comparator (mirrors the js-framework-benchmark
 * react/preact patterns).
 */

import { render } from "preact";
import { memo } from "preact/compat";
import { useRef, useState } from "preact/hooks";
import type { BenchmarkSuite } from "../types.js";

interface Row {
  id: number;
  label: string;
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
let nextId = 1;

function buildData(count: number): Row[] {
  const data: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label:
        adjectives[Math.floor(Math.random() * adjectives.length)] +
        " " +
        colors[Math.floor(Math.random() * colors.length)] +
        " " +
        nouns[Math.floor(Math.random() * nouns.length)],
    };
  }
  return data;
}

interface RowProps {
  id: number;
  label: string;
  selected: boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}

const RowComponent = memo(
  (props: RowProps) => (
    <tr className={props.selected ? "danger" : ""}>
      <td className="col-md-1">{props.id}</td>
      <td className="col-md-4">
        <a onClick={() => props.onSelect(props.id)}>{props.label}</a>
      </td>
      <td className="col-md-1">
        <a onClick={() => props.onRemove(props.id)}>
          <span
            className="glyphicon glyphicon-remove"
            aria-hidden="true"
          ></span>
        </a>
      </td>
      <td className="col-md-6"></td>
    </tr>
  ),
  (prev, next) =>
    prev.selected === next.selected &&
    prev.label === next.label &&
    prev.id === next.id,
);

interface Setters {
  rows: Row[];
  setRows: (updater: (rows: Row[]) => Row[]) => void;
  setSelectedId: (id: number | null) => void;
}

interface ApiRef {
  current: Setters | null;
}

let apiRef: ApiRef = { current: null };

function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;
  const setters = useRef<Setters>({ rows, setRows, setSelectedId });
  setters.current = { rows: rowsRef.current, setRows, setSelectedId };
  apiRef.current = setters.current;

  return (
    <table className="table table-hover table-striped test-data">
      <tbody>
        {rows.map((row) => (
          <RowComponent
            key={row.id}
            id={row.id}
            label={row.label}
            selected={row.id === selectedId}
            onSelect={(id) => setters.current.setSelectedId(id)}
            onRemove={(id) =>
              setters.current.setRows((rs) => rs.filter((r) => r.id !== id))
            }
          />
        ))}
      </tbody>
    </table>
  );
}

let container: HTMLElement | null = null;

function ops(): Setters {
  if (!apiRef.current) throw new Error("preact app not mounted");
  return apiRef.current;
}

export const preactSuite: BenchmarkSuite = {
  name: "preact",

  init(target: HTMLElement): void {
    container = target;
    apiRef.current = null;
    render(<App />, target);
  },

  cleanup(): void {
    if (container) {
      render(null, container);
      container.innerHTML = "";
      container = null;
    }
    apiRef.current = null;
    nextId = 1;
  },

  create1000(): void {
    ops().setRows(() => buildData(1000));
  },

  create10000(): void {
    ops().setRows(() => buildData(10000));
  },

  append1000(): void {
    ops().setRows((rows) => [...rows, ...buildData(1000)]);
  },

  updateEvery10th(): void {
    ops().setRows((rows) =>
      rows.map((row, i) =>
        i % 10 === 0 ? { ...row, label: row.label + " !!!" } : row,
      ),
    );
  },

  selectRow(index: number): void {
    const { rows, setSelectedId } = ops();
    const row = rows[index];
    if (row) setSelectedId(row.id);
  },

  removeRow(index: number): void {
    ops().setRows((rows) => {
      const row = rows[index];
      return row ? rows.filter((r) => r.id !== row.id) : rows;
    });
  },

  swapRows(): void {
    ops().setRows((rows) => {
      if (rows.length < 999) return rows;
      const newRows = [...rows];
      const temp = newRows[1]!;
      newRows[1] = newRows[998]!;
      newRows[998] = temp;
      return newRows;
    });
  },

  clear(): void {
    ops().setRows(() => []);
  },
};

export default preactSuite;
