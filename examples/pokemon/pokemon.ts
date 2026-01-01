/**
 * Pokemon App - Unified Pokemon Viewer and Battle Game
 *
 * Features:
 * - Tab-based navigation between Pokedex and Battle modes
 * - Shared state (favorites, language) across tabs
 * - Favorites from Pokedex are pre-selected for Battle team
 * - Cross-tab bridges: "Add to Team" from Pokedex, "View in Pokedex" from Battle
 */

import { html, store, effect, scope } from "../../src/index.js";
import type { FavoritePokemon } from "./types.js";
import { getDefaultLanguage } from "./utils/language.js";
import {
  loadFavorites,
  loadRoster,
  MAX_ROSTER_SIZE,
  DEFAULT_ROSTER_IDS,
} from "./utils/storage.js";
import { PokemonService } from "./services/pokemon-service.js";
import { Pokedex, type PokedexState } from "./components/pokedex.js";
import { Battle, type BattleComponentState } from "./components/battle.js";

type AppTab = "pokedex" | "battle";

// ============================================================================
// SIMPLE ROUTER
// ============================================================================

const VALID_TABS: AppTab[] = ["pokedex", "battle"];

interface RouteState {
  tab: AppTab;
  pokemonId?: number;
}

/**
 * Parse the URL hash into route state
 * Formats: #pokedex, #pokedex/25, #battle
 */
function parseUrl(): RouteState {
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

/**
 * Main Pokemon App - Custom Element with tab navigation
 */
export class PokemonAppElement extends HTMLElement {
  // Shared state across tabs
  #sharedState = store({
    favorites: [] as FavoritePokemon[],
    language: getDefaultLanguage(),
    rosterIds: [] as number[],
  });

  // Current active tab - initialized from URL
  #appState = store({
    activeTab: parseUrl().tab as AppTab,
  });

  // Handler for popstate events (back/forward navigation)
  #handlePopState = (event: PopStateEvent) => {
    const route = (event.state as RouteState) ?? parseUrl();
    if (VALID_TABS.includes(route.tab)) {
      this.#appState.activeTab = route.tab;
      // Restore Pokemon ID if navigating to pokedex
      if (route.tab === "pokedex" && route.pokemonId) {
        this.#pokedexState.pokemonId = route.pokemonId;
      }
    }
  };

  // Pokedex-specific state - initialize pokemonId from URL
  #pokedexState = store<PokedexState>({
    pokemonId: parseUrl().pokemonId ?? 1,
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
  });

  // Battle-specific state
  #battleState = store<BattleComponentState>({
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
  });

  #dispose: (() => void) | null = null;
  #disposeEffects: (() => void) | null = null;
  #pokemonService = new PokemonService();

  connectedCallback() {
    // Load favorites and roster from localStorage
    this.#sharedState.favorites = loadFavorites();
    this.#sharedState.rosterIds = loadRoster();

    // Set up router - listen for back/forward navigation
    window.addEventListener("popstate", this.#handlePopState);

    // Initialize URL if no hash present (replace to avoid extra history entry)
    if (!window.location.hash) {
      updateUrl(this.#appState.activeTab, {
        pokemonId: this.#pokedexState.pokemonId,
        replace: true,
      });
    }

    // Create effects for auto-syncing to localStorage
    this.#disposeEffects = scope(() => {
      effect(() => {
        localStorage.setItem(
          "pokemon-favorites",
          JSON.stringify(this.#sharedState.favorites),
        );
      });

      effect(() => {
        localStorage.setItem("pokemon-language", this.#sharedState.language);
      });

      effect(() => {
        localStorage.setItem(
          "pokemon-roster",
          JSON.stringify(this.#sharedState.rosterIds),
        );
      });
    })[1];

    const handleLanguageChange = (lang: string) => {
      this.#sharedState.language = lang;
    };

    // Update URL when Pokemon changes in Pokedex
    const handlePokemonChange = (pokemonId: number) => {
      updateUrl("pokedex", { pokemonId, replace: true });
    };

    const switchTab = (tab: AppTab) => {
      if (this.#appState.activeTab !== tab) {
        this.#appState.activeTab = tab;
        if (tab === "pokedex") {
          updateUrl(tab, { pokemonId: this.#pokedexState.pokemonId });
        } else {
          updateUrl(tab);
        }
      }
    };

    const getRootElement = () => this as HTMLElement;

    // Bridge: Add Pokemon to battle team from Pokedex
    const addToTeam = (pokemonId: number) => {
      // Check if Pokemon is in the battle roster
      if (!this.#sharedState.rosterIds.includes(pokemonId)) return false;

      // Check if already selected
      if (this.#battleState.selectedForTeam.includes(pokemonId)) return false;

      // Check if team is full
      if (
        this.#battleState.selectedForTeam.length >= this.#battleState.teamSize
      )
        return false;

      // Add to team
      this.#battleState.selectedForTeam = [
        ...this.#battleState.selectedForTeam,
        pokemonId,
      ];
      return true;
    };

    // Bridge: Remove Pokemon from battle team
    const removeFromTeam = (pokemonId: number) => {
      if (!this.#battleState.selectedForTeam.includes(pokemonId)) return false;
      this.#battleState.selectedForTeam =
        this.#battleState.selectedForTeam.filter((id) => id !== pokemonId);
      return true;
    };

    // Bridge: Check if team is full
    const isTeamFull = () => {
      return (
        this.#battleState.selectedForTeam.length >= this.#battleState.teamSize
      );
    };

    // Bridge: Get selected team IDs array (for reactivity tracking)
    const getSelectedForTeam = () => this.#battleState.selectedForTeam;

    // Bridge: View Pokemon in Pokedex from Battle
    const viewInPokedex = (pokemonId: number) => {
      this.#pokedexState.pokemonId = pokemonId;
      this.#appState.activeTab = "pokedex";
      updateUrl("pokedex", { pokemonId });
    };

    // Bridge: Go to battle with current team (skip splash screen)
    const goToBattle = () => {
      this.#appState.activeTab = "battle";
      // Skip splash screen and go directly to team selection
      this.#battleState.phase = "team_select";
      updateUrl("battle");
    };

    // Bridge: Add Pokemon to roster
    const addToRoster = (pokemonId: number) => {
      if (this.#sharedState.rosterIds.includes(pokemonId)) return false;
      if (this.#sharedState.rosterIds.length >= MAX_ROSTER_SIZE) return false;
      this.#sharedState.rosterIds = [...this.#sharedState.rosterIds, pokemonId];
      return true;
    };

    // Bridge: Remove Pokemon from roster
    const removeFromRoster = (pokemonId: number) => {
      if (!this.#sharedState.rosterIds.includes(pokemonId)) return false;
      // Also remove from team if selected
      if (this.#battleState.selectedForTeam.includes(pokemonId)) {
        this.#battleState.selectedForTeam =
          this.#battleState.selectedForTeam.filter((id) => id !== pokemonId);
      }
      // Also remove from available Pokemon list
      this.#battleState.availablePokemon =
        this.#battleState.availablePokemon.filter((p) => p.id !== pokemonId);
      // Update roster IDs
      this.#sharedState.rosterIds = this.#sharedState.rosterIds.filter(
        (id) => id !== pokemonId,
      );
      return true;
    };

    // Bridge: Reset roster to default
    const resetRoster = () => {
      this.#sharedState.rosterIds = [...DEFAULT_ROSTER_IDS];
      // Clear team selection since roster changed
      this.#battleState.selectedForTeam = [];
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

    const { fragment, dispose } = html`
      <div class="pokemon-app">
        <!-- Tab Navigation -->
        <nav class="tab-nav">
          <button
            class=${() =>
              "tab-btn" +
              (this.#appState.activeTab === "pokedex" ? " active" : "")}
            @click=${() => switchTab("pokedex")}
          >
            <span class="tab-icon">📖</span>
            <span class="tab-label">Pokedex</span>
          </button>
          <button
            class=${() =>
              "tab-btn" +
              (this.#appState.activeTab === "battle" ? " active" : "")}
            @click=${() => switchTab("battle")}
          >
            <span class="tab-icon">⚔️</span>
            <span class="tab-label">Battle</span>
          </button>
        </nav>

        <!-- Tab Content -->
        <div class="tab-content">
          ${() => {
            if (this.#appState.activeTab === "pokedex") {
              return Pokedex({
                state: this.#pokedexState,
                sharedState: this.#sharedState,
                pokemonService: this.#pokemonService,
                onLanguageChange: handleLanguageChange,
                onPokemonChange: handlePokemonChange,
                getRootElement,
                rosterActions,
              });
            } else {
              return Battle({
                state: this.#battleState,
                sharedState: this.#sharedState,
                pokemonService: this.#pokemonService,
                onLanguageChange: handleLanguageChange,
                getRootElement,
                // Bridge props
                viewInPokedex,
                // Roster props
                removeFromRoster,
                resetRoster,
              });
            }
          }}
        </div>
      </div>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
  }

  disconnectedCallback() {
    // Clean up router listener
    window.removeEventListener("popstate", this.#handlePopState);
    this.#disposeEffects?.();
    this.#dispose?.();
  }
}

customElements.define("x-pokemon-app", PokemonAppElement);
