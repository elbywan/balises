/**
 * Pokedex Component - Pokemon browsing/viewing functionality
 * Refactored from PokemonViewerElement to be a function component
 */

import { html, computed, effect } from "../../../src/index.js";
import type {
  Pokemon,
  FavoritePokemon,
  SearchResult,
  PokedexState,
  SharedAppState,
} from "../types.js";
import { LANGUAGES } from "../utils/language.js";
import {
  getPokedexTranslations,
  type PokedexTranslations,
} from "../utils/pokedex-translations.js";
import { PokemonService, POKEMON_LIMIT } from "../services/pokemon-service.js";
import { NavigationControls } from "./navigation-controls.js";
import { SearchBox } from "./search-box.js";
import { PokemonCard, type RosterActions } from "./pokemon-card.js";
import { FavoritesList } from "./favorites-list.js";

// Re-export for use by pokemon.ts
export type { PokedexState } from "../types.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Delay before showing loading spinner (ms) */
const LOADER_DELAY_MS = 300;

/** Debounce delay for search input (ms) */
const SEARCH_DEBOUNCE_MS = 300;

export interface PokedexProps {
  state: PokedexState;
  sharedState: SharedAppState;
  pokemonService: PokemonService;
  onLanguageChange: (lang: string) => void;
  onPokemonChange: (pokemonId: number) => void;
  getRootElement: () => HTMLElement | null;
  rosterActions: RosterActions;
}

/**
 * Pokedex tab content - Browse and view Pokemon
 */
export function Pokedex(props: PokedexProps) {
  const {
    state,
    sharedState,
    pokemonService,
    onLanguageChange,
    onPokemonChange,
    getRootElement,
    rosterActions,
  } = props;

  let audio: HTMLAudioElement | null = null;

  // Translation helper - reactive based on sharedState.language
  const getTranslations = (): PokedexTranslations =>
    getPokedexTranslations(sharedState.language);

  const t = () => getTranslations();

  // Fetch Pokemon data with loader delay handling
  const fetchPokemon = async () => {
    state.loading = true;
    state.error = null;

    // Set up loader delay - show spinner only if loading takes a while
    let loaderTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (state.loading) {
        state.showLoader = true;
      }
    }, LOADER_DELAY_MS);

    try {
      const pokemon = await pokemonService.fetchPokemon(state.pokemonId);
      if (!pokemon) {
        throw new Error(`Pokemon #${state.pokemonId} not found`);
      }
      state.pokemon = pokemon;
      fetchLocalizedNames(pokemon, false);
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Failed to fetch";
    } finally {
      if (loaderTimeout) {
        clearTimeout(loaderTimeout);
        loaderTimeout = null;
      }
      state.loading = false;
      state.showLoader = false;
    }
  };

  const fetchLocalizedNames = async (pokemon: Pokemon, isCompare: boolean) => {
    const lang = sharedState.language;
    const names = await pokemonService.fetchLocalizedNames(pokemon, lang);

    if (isCompare) {
      state.comparePokemonName = names.pokemonName;
      state.compareTypeNames = names.typeNames;
    } else {
      state.pokemonName = names.pokemonName;
      state.typeNames = names.typeNames;
    }
  };

  const searchPokemon = async (query: string) => {
    const results = await pokemonService.searchPokemon(query);
    state.searchResults = results;
  };

  // Event handlers
  const prev = () => {
    if (state.pokemonId > 1) {
      state.pokemonId--;
      onPokemonChange(state.pokemonId);
      fetchPokemon();
    }
  };

  const next = () => {
    state.pokemonId++;
    onPokemonChange(state.pokemonId);
    fetchPokemon();
  };

  const random = () => {
    state.pokemonId = Math.floor(Math.random() * POKEMON_LIMIT) + 1;
    onPokemonChange(state.pokemonId);
    fetchPokemon();
  };

  const toggleShiny = () => {
    state.shiny = !state.shiny;
  };

  const playCry = () => {
    const cryUrl = state.pokemon?.cries?.latest;
    if (cryUrl) {
      if (audio) {
        audio.pause();
      }
      audio = new Audio(cryUrl);
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Ignore autoplay restrictions or missing audio files
      });
    }
  };

  const toggleFavorite = () => {
    const pokemon = state.pokemon;
    if (!pokemon) return;

    const index = sharedState.favorites.findIndex((f) => f.id === pokemon.id);
    if (index >= 0) {
      sharedState.favorites = sharedState.favorites.filter(
        (f) => f.id !== pokemon.id,
      );
    } else {
      sharedState.favorites = [
        ...sharedState.favorites,
        {
          id: pokemon.id,
          name: pokemon.name,
          sprite: pokemon.sprites.front_default,
        },
      ];
    }
  };

  const selectFavorite = (fav: FavoritePokemon) => {
    state.pokemonId = fav.id;
    onPokemonChange(state.pokemonId);
    fetchPokemon();
  };

  const removeFavorite = (fav: FavoritePokemon, e: Event) => {
    e.stopPropagation();
    sharedState.favorites = sharedState.favorites.filter(
      (f) => f.id !== fav.id,
    );
  };

  const onSearchInput = (e: Event) => {
    const query = (e.target as HTMLInputElement).value;
    state.searchQuery = query;
  };

  // Debounced search effect - automatically cleans up timeout on re-run or dispose
  effect(() => {
    const query = state.searchQuery;

    // Clear results immediately if query is too short
    if (query.length < 2) {
      state.searchResults = [];
      return;
    }

    // Debounce the search
    const timeout = setTimeout(() => {
      searchPokemon(query);
    }, SEARCH_DEBOUNCE_MS);

    // Cleanup: cancel pending search when query changes or component unmounts
    return () => clearTimeout(timeout);
  });

  const selectSearchResult = (result: SearchResult) => {
    const id = parseInt(result.url.split("/").filter(Boolean).pop()!);
    state.pokemonId = id;
    state.searchQuery = "";
    state.searchResults = [];
    // Clear the input element
    const root = getRootElement();
    const input = root?.querySelector<HTMLInputElement>(".search-box input");
    if (input) input.value = "";
    onPokemonChange(state.pokemonId);
    fetchPokemon();
  };

  const handleLanguageChange = (e: Event) => {
    const lang = (e.target as HTMLSelectElement).value;
    onLanguageChange(lang);
    // Refetch to get localized names
    fetchPokemon();
    if (state.comparePokemon) {
      fetchLocalizedNames(state.comparePokemon, true);
    }
  };

  const setComparePokemon = async () => {
    const randomId = Math.floor(Math.random() * POKEMON_LIMIT) + 1;
    const pokemon = await pokemonService.fetchPokemon(randomId);
    if (pokemon) {
      state.comparePokemon = pokemon;
      fetchLocalizedNames(pokemon, true);
    }
  };

  const toggleCompare = () => {
    state.compareMode = !state.compareMode;
    if (state.compareMode) {
      setComparePokemon();
    } else {
      state.comparePokemon = null;
      state.comparePokemonName = "";
      state.compareTypeNames = [];
    }
  };

  const isFavorite = computed(() =>
    sharedState.favorites.some((f) => f.id === state.pokemon?.id),
  );

  // Initial fetch
  setTimeout(() => fetchPokemon(), 0);

  return html`
    <div class="pokemon-viewer">
      <div class="header">
        <h2>${() => t().title}</h2>
        <select class="language-select" @change=${handleLanguageChange}>
          ${LANGUAGES.map(
            (lang) => html`
              <option
                value=${lang.code}
                .selected=${() => sharedState.language === lang.code}
              >
                ${lang.label}
              </option>
            `,
          )}
        </select>
      </div>

      <!-- Search Section -->
      ${SearchBox({
        state,
        onInput: onSearchInput,
        onSelectResult: selectSearchResult,
        getTranslations,
      })}

      <!-- Navigation Controls -->
      ${NavigationControls({
        state,
        onPrev: prev,
        onNext: next,
        onRandom: random,
        getTranslations,
      })}

      <!-- Error Message -->
      ${() =>
        state.error ? html`<div class="error">${state.error}</div>` : null}

      <!-- Pokemon Card with Compare Panel -->
      <div
        class="pokemon-card-wrapper"
        style=${() => (state.error ? "display: none" : "")}
      >
        ${PokemonCard({
          state,
          sharedState,
          getIsFavorite: () => isFavorite.value,
          onToggleShiny: toggleShiny,
          onPlayCry: playCry,
          onToggleFavorite: toggleFavorite,
          onToggleCompare: toggleCompare,
          onShuffleCompare: setComparePokemon,
          rosterActions,
          getTranslations,
        })}
      </div>

      <!-- Favorites Section -->
      ${FavoritesList({
        sharedState,
        onSelectFavorite: selectFavorite,
        onRemoveFavorite: removeFavorite,
        getTranslations,
      })}
    </div>
  `;
}
