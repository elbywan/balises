/**
 * App state for the SSR example, shared between the build-time server
 * renderer and the client bootstrap.
 *
 * The serialized state + the fetched roster are embedded in the generated
 * page, so the client hydrates with identical data and never refetches.
 * `favorites` is client-only (localStorage) and loads after hydration.
 */

import { store } from "../../src/signals/store.js";
import type { Pokemon } from "./data/pokeapi.js";

/** The subset of state serialized into the page by the server renderer. */
export interface SerializedState {
  query: string;
  typeFilter: string;
  selectedId: number | null;
  favoritesOnly: boolean;
}

/** Full reactive app state (a store; `favorites` is client-only). */
export interface AppState extends SerializedState {
  favorites: number[];
  /** Fetched by the server-side generator at build time. */
  roster: Pokemon[];
  /** Type filter chips, derived from the roster. */
  types: string[];
}

/** The complete payload embedded in the generated page. */
export interface PageData {
  state: SerializedState;
  roster: Pokemon[];
}

export const FAVORITES_KEY = "balises-ssr-favorites";

export const DEFAULT_STATE: SerializedState = {
  query: "",
  typeFilter: "",
  selectedId: null,
  favoritesOnly: false,
};

export function createState(initial: SerializedState): AppState {
  return store<AppState>({
    ...initial,
    favorites: [],
    roster: [],
    types: [],
  });
}

/** The server renders with this state and embeds it for the client. */
export function serializeState(state: AppState): SerializedState {
  return {
    query: state.query,
    typeFilter: state.typeFilter,
    selectedId: state.selectedId,
    favoritesOnly: state.favoritesOnly,
  };
}

/** Read the state and roster embedded in the page (falls back to defaults). */
export function parsePageData(element: Element | null): PageData {
  const fallback: PageData = { state: DEFAULT_STATE, roster: [] };
  if (!element) return fallback;
  try {
    const parsed = (JSON.parse(element.textContent ?? "{}") ??
      {}) as Partial<PageData>;
    const state = (parsed.state ?? {}) as Record<string, unknown>;
    return {
      state: {
        query: typeof state.query === "string" ? state.query : "",
        typeFilter:
          typeof state.typeFilter === "string" ? state.typeFilter : "",
        selectedId:
          typeof state.selectedId === "number" ? state.selectedId : null,
        favoritesOnly:
          typeof state.favoritesOnly === "boolean"
            ? state.favoritesOnly
            : false,
      },
      roster: Array.isArray(parsed.roster) ? (parsed.roster as Pokemon[]) : [],
    };
  } catch {
    return fallback;
  }
}
