/**
 * React DOM Benchmark Implementation
 *
 * Uses React 19 with functional components following official
 * js-framework-benchmark patterns:
 * - memo with custom comparator for row components
 * - useReducer for state management
 * - flushSync for synchronous updates
 */

import React, { useReducer, memo, useRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { BenchmarkSuite } from "../types.js";

// Row type matching the benchmark
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

const random = (max: number) => Math.round(Math.random() * 1000) % max;

let nextId = 1;

function buildData(count: number): Row[] {
  const data: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
    };
  }
  return data;
}

// Memoized row component with custom comparator (official benchmark pattern)
const TableRow = memo(
  function TableRow({
    item,
    selected,
    dispatch,
  }: {
    item: Row;
    selected: boolean;
    dispatch: React.Dispatch<Action>;
  }) {
    return (
      <tr className={selected ? "danger" : ""}>
        <td className="col-md-1">{item.id}</td>
        <td className="col-md-4">
          <a onClick={() => dispatch({ type: "SELECT", id: item.id })}>
            {item.label}
          </a>
        </td>
        <td className="col-md-1">
          <a onClick={() => dispatch({ type: "REMOVE", id: item.id })}>
            <span
              className="glyphicon glyphicon-remove"
              aria-hidden="true"
            ></span>
          </a>
        </td>
        <td className="col-md-6"></td>
      </tr>
    );
  },
  // Custom comparator - only re-render if item or selected state changes
  (prevProps, nextProps) =>
    prevProps.selected === nextProps.selected &&
    prevProps.item === nextProps.item,
);

// State and actions
interface State {
  data: Row[];
  selected: number;
}

type Action =
  | { type: "RUN" }
  | { type: "RUN_LOTS" }
  | { type: "ADD" }
  | { type: "UPDATE" }
  | { type: "CLEAR" }
  | { type: "SWAP_ROWS" }
  | { type: "REMOVE"; id: number }
  | { type: "SELECT"; id: number };

const initialState: State = { data: [], selected: 0 };

function reducer(state: State, action: Action): State {
  const { data, selected } = state;

  switch (action.type) {
    case "RUN":
      return { data: buildData(1000), selected: 0 };
    case "RUN_LOTS":
      return { data: buildData(10000), selected: 0 };
    case "ADD":
      return { data: data.concat(buildData(1000)), selected };
    case "UPDATE": {
      const newData = data.slice(0);
      for (let i = 0; i < newData.length; i += 10) {
        const r = newData[i]!;
        newData[i] = { id: r.id, label: r.label + " !!!" };
      }
      return { data: newData, selected };
    }
    case "CLEAR":
      return { data: [], selected: 0 };
    case "SWAP_ROWS": {
      if (data.length <= 998) return state;
      const newData = [...data];
      const d1 = newData[1]!;
      const d998 = newData[998]!;
      newData[1] = d998;
      newData[998] = d1;
      return { data: newData, selected };
    }
    case "REMOVE": {
      const idx = data.findIndex((d) => d.id === action.id);
      return {
        data: [...data.slice(0, idx), ...data.slice(idx + 1)],
        selected,
      };
    }
    case "SELECT":
      return { data, selected: action.id };
    default:
      return state;
  }
}

// Interface for imperative handle
interface AppHandle {
  dispatch: (action: Action) => void;
  getState: () => State;
}

let appHandle: AppHandle | null = null;

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Expose imperative methods with flushSync for synchronous updates
  useEffect(() => {
    appHandle = {
      dispatch: (action: Action) => {
        flushSync(() => {
          dispatch(action);
        });
      },
      getState: () => stateRef.current,
    };
    return () => {
      appHandle = null;
    };
  }, []);

  return (
    <table className="table table-hover table-striped test-data">
      <tbody>
        {state.data.map((item) => (
          <TableRow
            key={item.id}
            item={item}
            selected={state.selected === item.id}
            dispatch={dispatch}
          />
        ))}
      </tbody>
    </table>
  );
}

let root: Root | null = null;
let container: HTMLElement | null = null;

export const reactSuite: BenchmarkSuite = {
  name: "react",

  init(target: HTMLElement): void {
    container = target;
    root = createRoot(target);
    flushSync(() => {
      root!.render(<App />);
    });
  },

  cleanup(): void {
    if (root) {
      root.unmount();
      root = null;
    }
    appHandle = null;
    nextId = 1;
    if (container) {
      container.innerHTML = "";
    }
  },

  create1000(): void {
    appHandle?.dispatch({ type: "RUN" });
  },

  create10000(): void {
    appHandle?.dispatch({ type: "RUN_LOTS" });
  },

  append1000(): void {
    appHandle?.dispatch({ type: "ADD" });
  },

  updateEvery10th(): void {
    appHandle?.dispatch({ type: "UPDATE" });
  },

  selectRow(index: number): void {
    if (!appHandle) return;
    const row = appHandle.getState().data[index];
    if (row) {
      appHandle.dispatch({ type: "SELECT", id: row.id });
    }
  },

  swapRows(): void {
    appHandle?.dispatch({ type: "SWAP_ROWS" });
  },

  removeRow(index: number): void {
    if (!appHandle) return;
    const row = appHandle.getState().data[index];
    if (row) {
      appHandle.dispatch({ type: "REMOVE", id: row.id });
    }
  },

  clear(): void {
    appHandle?.dispatch({ type: "CLEAR" });
  },
};

export default reactSuite;
