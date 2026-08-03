/**
 * Pokemon App - Unified Pokemon Viewer and Battle Game
 *
 * Features:
 * - Tab-based navigation between Pokedex and Battle modes
 * - Shared state (favorites, language) across tabs
 * - Favorites from Pokedex are pre-selected for Battle team
 * - Cross-tab bridges: "Add to Team" from Pokedex, "View in Pokedex" from Battle
 *
 * Server-side rendering:
 * The app is built from a shared factory (createAppStores + buildAppTemplate)
 * used by both the web component (client) and the build-time generator
 * (examples/pokemon/build-html.ts, which renders with renderToStringAsync).
 * The client bootstrap hydrates the pre-rendered markup when present and
 * falls back to a plain render otherwise - a single code path either way.
 */

import { html as baseHtml, effect, scope } from "../../src/index.js";
import { hydrate } from "../../src/hydrate.js";
import { store } from "../../src/signals/store.js";
import matchPlugin, { match } from "../../src/match.js";

const html = baseHtml.with(matchPlugin);
import type { Template } from "../../src/template.js";
import type {
  Pokemon,
  FavoritePokemon,
  PokedexState,
  SharedAppState,
} from "./types.js";
import { getDefaultLanguage } from "./utils/language.js";
import {
  loadFavorites,
  loadRoster,
  MAX_ROSTER_SIZE,
  DEFAULT_ROSTER_IDS,
} from "./utils/storage.js";
import { PokemonService } from "./services/pokemon-service.js";
import { Pokedex } from "./components/pokedex.js";
import { Battle, type BattleComponentState } from "./components/battle.js";

// ============================================================================
// SIMPLE ROUTER
// ============================================================================

type AppTab = "pokedex" | "battle";

const VALID_TABS: AppTab[] = ["pokedex", "battle"];

interface RouteState {
  tab: AppTab;
  pokemonId?: number;
}

/** Default route used server-side and when no hash is present. */
export function defaultRoute(): RouteState {
  return { tab: "pokedex", pokemonId: 1 };
}

/**
 * Parse the URL hash into route state
 * Formats: #pokedex, #pokedex/25, #battle
 */
export function parseRoute(): RouteState {
  if (typeof window === "undefined") return defaultRoute();
  const hash = window.location.hash.slice(1); // Remove the '#'
  const parts = hash.split("/");
  const tab = VALID_TABS.includes(parts[0] as AppTab)
    ? (parts[0] as AppTab)
    : "pokedex";

  const result: RouteState = { tab };

  // Parse Pokemon ID for pokedex tab
  if (tab === "pokedex" && parts[1]) {
    const id = parseInt(parts[1], 10);
    if (!isNaN(id) && id > 0) {
      result.pokemonId = id;
    }
  }

  return result;
}

/**
 * Update the URL hash without triggering a page reload
 */
function updateUrl(
  tab: AppTab,
  options: { pokemonId?: number | undefined; replace?: boolean } = {},
): void {
  let newUrl = `#${tab}`;
  if (tab === "pokedex" && options.pokemonId) {
    newUrl += `/${options.pokemonId}`;
  }

  const state: RouteState = { tab };
  if (options.pokemonId !== undefined) {
    state.pokemonId = options.pokemonId;
  }

  if (options.replace) {
    history.replaceState(state, "", newUrl);
  } else {
    history.pushState(state, "", newUrl);
  }
}

// ============================================================================
// APP FACTORY - shared by the web component and the SSR build
// ============================================================================

export interface PokemonAppStores {
  sharedState: SharedAppState;
  appState: { activeTab: AppTab };
  pokedexState: PokedexState;
  battleState: BattleComponentState;
}

/** Browser-facing plumbing the app template needs (no-ops server-side). */
export interface PokemonAppApi {
  updateUrl: (
    tab: AppTab,
    options?: { pokemonId?: number | undefined; replace?: boolean },
  ) => void;
  getRootElement: () => HTMLElement | null;
}

export function createAppStores(
  route: RouteState = parseRoute(),
): PokemonAppStores {
  return {
    // Shared state across tabs
    sharedState: store({
      favorites: [] as FavoritePokemon[],
      language: getDefaultLanguage(),
      rosterIds: [] as number[],
    }),
    appState: store({ activeTab: route.tab as AppTab }),
    pokedexState: store<PokedexState>({
      pokemonId: route.pokemonId ?? 1,
      pokemon: null,
      pokemonName: "",
      typeNames: [],
      loading: false,
      showLoader: false,
      error: null,
      shiny: false,
      searchQuery: "",
      searchResults: [],
      compareMode: false,
      comparePokemon: null,
      comparePokemonName: "",
      compareTypeNames: [],
    }),
    battleState: store<BattleComponentState>({
      phase: "splash",
      playerTeam: [],
      enemyTeam: [],
      activePlayerPokemon: 0,
      activeEnemyPokemon: 0,
      battleLog: [],
      currentTurn: 1,
      isPlayerTurn: true,
      isAnimating: false,
      selectedMove: null,
      winner: null,
      availablePokemon: [],
      selectedForTeam: [],
      teamSize: 3,
      difficulty: "normal",
      actionMessage: null,
      actionMessageType: null,
      isMuted: false,
      loadingError: null,
    }),
  };
}

/** The full app template (tabs + match branches). @internal */
export function buildAppTemplate(
  stores: PokemonAppStores,
  pokemonService: PokemonService,
  api: PokemonAppApi,
): Template {
  const { sharedState, appState, pokedexState, battleState } = stores;

  const handleLanguageChange = (lang: string) => {
    sharedState.language = lang;
  };

  // Update URL when Pokemon changes in Pokedex
  const handlePokemonChange = (pokemonId: number) => {
    api.updateUrl("pokedex", { pokemonId, replace: true });
  };

  const switchTab = (tab: AppTab) => {
    if (appState.activeTab !== tab) {
      appState.activeTab = tab;
      if (tab === "pokedex") {
        api.updateUrl(tab, { pokemonId: pokedexState.pokemonId });
      } else {
        api.updateUrl(tab);
      }
    }
  };

  const getRootElement = api.getRootElement;

  // Bridge: Add Pokemon to battle team from Pokedex
  const addToTeam = (pokemonId: number) => {
    // Check if Pokemon is in the battle roster
    if (!sharedState.rosterIds.includes(pokemonId)) return false;

    // Check if already selected
    if (battleState.selectedForTeam.includes(pokemonId)) return false;

    // Check if team is full
    if (battleState.selectedForTeam.length >= battleState.teamSize)
      return false;

    // Add to team
    battleState.selectedForTeam = [...battleState.selectedForTeam, pokemonId];
    return true;
  };

  // Bridge: Remove Pokemon from battle team
  const removeFromTeam = (pokemonId: number) => {
    if (!battleState.selectedForTeam.includes(pokemonId)) return false;
    battleState.selectedForTeam = battleState.selectedForTeam.filter(
      (id: number) => id !== pokemonId,
    );
    return true;
  };

  // Bridge: Check if team is full
  const isTeamFull = () => {
    return battleState.selectedForTeam.length >= battleState.teamSize;
  };

  // Bridge: Get selected team IDs array (for reactivity tracking)
  const getSelectedForTeam = () => battleState.selectedForTeam;

  // Bridge: View Pokemon in Pokedex from Battle
  const viewInPokedex = (pokemonId: number) => {
    pokedexState.pokemonId = pokemonId;
    appState.activeTab = "pokedex";
    api.updateUrl("pokedex", { pokemonId });
  };

  // Bridge: Go to battle with current team (skip splash screen)
  const goToBattle = () => {
    appState.activeTab = "battle";
    // Skip splash screen and go directly to team selection
    battleState.phase = "team_select";
    api.updateUrl("battle");
  };

  // Bridge: Add Pokemon to roster
  const addToRoster = (pokemonId: number) => {
    if (sharedState.rosterIds.includes(pokemonId)) return false;
    if (sharedState.rosterIds.length >= MAX_ROSTER_SIZE) return false;
    sharedState.rosterIds = [...sharedState.rosterIds, pokemonId];
    return true;
  };

  // Bridge: Remove Pokemon from roster
  const removeFromRoster = (pokemonId: number) => {
    if (!sharedState.rosterIds.includes(pokemonId)) return false;
    // Also remove from team if selected
    if (battleState.selectedForTeam.includes(pokemonId)) {
      battleState.selectedForTeam = battleState.selectedForTeam.filter(
        (id: number) => id !== pokemonId,
      );
    }
    // Also remove from available Pokemon list
    battleState.availablePokemon = battleState.availablePokemon.filter(
      (p: Pokemon) => p.id !== pokemonId,
    );
    // Update roster IDs
    sharedState.rosterIds = sharedState.rosterIds.filter(
      (id) => id !== pokemonId,
    );
    return true;
  };

  // Bridge: Reset roster to default
  const resetRoster = () => {
    sharedState.rosterIds = [...DEFAULT_ROSTER_IDS];
    // Clear team selection since roster changed
    battleState.selectedForTeam = [];
  };

  // Grouped roster actions for cleaner prop passing
  const rosterActions = {
    addToRoster,
    removeFromRoster,
    addToTeam,
    removeFromTeam,
    getSelectedForTeam,
    isTeamFull,
    goToBattle,
  };

  return html`
    <div class="pokemon-app">
      <!-- Tab Navigation -->
      <nav class="tab-nav">
        <button
          class=${() =>
            "tab-btn" + (appState.activeTab === "pokedex" ? " active" : "")}
          @click=${() => switchTab("pokedex")}
        >
          <span class="tab-icon">📖</span>
          <span class="tab-label">Pokedex</span>
        </button>
        <button
          class=${() =>
            "tab-btn" + (appState.activeTab === "battle" ? " active" : "")}
          @click=${() => switchTab("battle")}
        >
          <span class="tab-icon">⚔️</span>
          <span class="tab-label">Battle</span>
        </button>
      </nav>

      <!-- Tab Content - using match() with caching for instant tab switching -->
      <div class="tab-content">
        ${match(
          () => appState.activeTab,
          {
            pokedex: () =>
              Pokedex({
                state: pokedexState,
                sharedState,
                pokemonService,
                onLanguageChange: handleLanguageChange,
                onPokemonChange: handlePokemonChange,
                getRootElement,
                rosterActions,
              }),
            battle: () =>
              Battle({
                state: battleState,
                sharedState,
                pokemonService,
                onLanguageChange: handleLanguageChange,
                getRootElement,
                // Bridge props
                viewInPokedex,
                // Roster props
                removeFromRoster,
                resetRoster,
              }),
          },
          { cache: true },
        )}
      </div>
    </div>
  `;
}

// ============================================================================
// SSR STATE - serialized into the page by the build-time generator
// ============================================================================

export interface SsrPayload {
  language: string;
  pokemon: Pokemon | null;
  pokemonName: string;
  typeNames: PokedexState["typeNames"];
}

/** The state embedded in the page (absent on client-only pages). */
export function serializeSsrState(stores: PokemonAppStores): SsrPayload {
  return {
    language: stores.sharedState.language,
    pokemon: stores.pokedexState.pokemon,
    pokemonName: stores.pokedexState.pokemonName,
    typeNames: stores.pokedexState.typeNames,
  };
}

/**
 * Restore the server state before hydrating so markup and data agree.
 * Only data the client cannot derive itself is applied: the route always
 * comes from the URL hash, and favorites/roster from localStorage.
 */
export function applySsrPayload(
  stores: PokemonAppStores,
  payload: SsrPayload | null,
): void {
  if (!payload) return;
  stores.sharedState.language = payload.language;
  stores.pokedexState.pokemon = payload.pokemon;
  stores.pokedexState.pokemonName = payload.pokemonName;
  stores.pokedexState.typeNames = payload.typeNames;
}

function parseSsrPayload(): SsrPayload | null {
  const element = document.getElementById("ssr-data");
  if (!element) return null;
  try {
    return JSON.parse(element.textContent ?? "null") as SsrPayload | null;
  } catch {
    return null;
  }
}

// ============================================================================
// WEB COMPONENT
// ============================================================================

// Inert base outside the browser: the SSR build imports this module in
// Node, where HTMLElement does not exist (the class is never instantiated
// server-side).
const ElementBase =
  typeof HTMLElement !== "undefined"
    ? HTMLElement
    : (class {} as typeof HTMLElement);

export class PokemonAppElement extends ElementBase {
  #stores = createAppStores();
  #pokemonService = new PokemonService();
  #dispose: (() => void) | null = null;
  #disposeEffects: (() => void) | null = null;

  // Handler for popstate events (back/forward navigation)
  #handlePopState = (event: PopStateEvent) => {
    const route = (event.state as RouteState) ?? parseRoute();
    if (VALID_TABS.includes(route.tab)) {
      this.#stores.appState.activeTab = route.tab;
      // Restore Pokemon ID if navigating to pokedex
      if (route.tab === "pokedex" && route.pokemonId) {
        this.#stores.pokedexState.pokemonId = route.pokemonId;
      }
    }
  };

  connectedCallback() {
    const { sharedState, appState, pokedexState } = this.#stores;

    // Load favorites and roster from localStorage
    sharedState.favorites = loadFavorites();
    sharedState.rosterIds = loadRoster();

    // If the page was pre-rendered server-side, restore the serialized
    // state (language, fetched pokémon) before hydrating. The route
    // always comes from the URL hash (createAppStores already parsed it).
    const payload = parseSsrPayload();
    applySsrPayload(this.#stores, payload);

    // A saved language preference wins over the server's default: refresh
    // the localized names for it once the page is up.
    if (payload?.pokemon) {
      const savedLanguage = localStorage.getItem("pokemon-language");
      if (savedLanguage && savedLanguage !== payload.language) {
        sharedState.language = savedLanguage;
        void (async () => {
          try {
            const names = await this.#pokemonService.fetchLocalizedNames(
              payload.pokemon!,
              savedLanguage,
            );
            pokedexState.pokemonName = names.pokemonName;
            pokedexState.typeNames = names.typeNames;
          } catch {
            // Network failure: keep the server-rendered names; the next
            // language change retries.
          }
        })();
      }
    }

    // Set up router - listen for back/forward navigation
    window.addEventListener("popstate", this.#handlePopState);

    // Initialize URL if no hash present (replace to avoid extra history entry)
    if (!window.location.hash) {
      updateUrl(appState.activeTab, {
        pokemonId: pokedexState.pokemonId,
        replace: true,
      });
    }

    // Create effects for auto-syncing to localStorage
    this.#disposeEffects = scope(() => {
      effect(() => {
        localStorage.setItem(
          "pokemon-favorites",
          JSON.stringify(sharedState.favorites),
        );
      });

      effect(() => {
        localStorage.setItem("pokemon-language", sharedState.language);
      });

      effect(() => {
        localStorage.setItem(
          "pokemon-roster",
          JSON.stringify(sharedState.rosterIds),
        );
      });
    })[1];

    const template = buildAppTemplate(this.#stores, this.#pokemonService, {
      updateUrl,
      getRootElement: () => this,
    });

    if (this.firstChild) {
      // Server-rendered markup: adopt it and attach the reactive bindings.
      this.#dispose = hydrate(template, this);
    } else {
      // Client-only page: plain render.
      const { fragment, dispose } = template.render();
      this.appendChild(fragment);
      this.#dispose = dispose;
    }
  }

  disconnectedCallback() {
    // Clean up router listener
    window.removeEventListener("popstate", this.#handlePopState);
    this.#disposeEffects?.();
    this.#dispose?.();
  }
}

// The SSR build imports this module in Node, where customElements is absent.
if (typeof customElements !== "undefined") {
  customElements.define("x-pokemon-app", PokemonAppElement);
}
