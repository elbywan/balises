import { html, computed, store, effect, scope } from "../../src/index.js";
import type { Pokemon, FavoritePokemon } from "./types.js";
import { LANGUAGES, getDefaultLanguage } from "./utils/language.js";
import { loadFavorites } from "./utils/storage.js";
import { PokemonService } from "./services/pokemon-service.js";
import { NavigationControls } from "./components/navigation-controls.js";
import { SearchBox, type SearchResult } from "./components/search-box.js";
import { PokemonCard } from "./components/pokemon-card.js";
import { ComparePanel } from "./components/compare-panel.js";
import { FavoritesList } from "./components/favorites-list.js";

/**
 * Pokemon Viewer - A feature-rich example showcasing:
 *
 * - store() for complex reactive state
 * - computed() for derived values
 * - each() for efficient list rendering with favorites
 * - Event handling (@click, @input, @change)
 * - Conditional rendering
 * - Dynamic attributes and styles
 * - Async data fetching with loading states
 * - LocalStorage persistence
 * - Audio playback
 * - Internationalization (i18n)
 */
export class PokemonViewerElement extends HTMLElement {
  #state = store({
    pokemonId: 1,
    pokemon: null as Pokemon | null,
    pokemonName: "", // Localized name
    typeNames: [] as { key: string; name: string }[], // Localized type names with keys
    loading: false,
    showLoader: false,
    error: null as string | null,
    shiny: false,
    favorites: [] as FavoritePokemon[],
    searchQuery: "",
    searchResults: [] as SearchResult[],
    compareMode: false,
    comparePokemon: null as Pokemon | null,
    comparePokemonName: "",
    compareTypeNames: [] as { key: string; name: string }[],
    language: getDefaultLanguage(),
  });

  #loaderTimeout: ReturnType<typeof setTimeout> | null = null;
  #searchTimeout: ReturnType<typeof setTimeout> | null = null;
  #dispose: (() => void) | null = null;
  #disposeEffects: (() => void) | null = null;
  #audio: HTMLAudioElement | null = null;
  #pokemonService = new PokemonService();

  connectedCallback() {
    // Load favorites from localStorage
    this.#state.favorites = loadFavorites();

    // Create a scope for effects that auto-sync to localStorage
    this.#disposeEffects = scope(() => {
      // Auto-sync favorites to localStorage whenever they change
      effect(() => {
        localStorage.setItem(
          "pokemon-favorites",
          JSON.stringify(this.#state.favorites),
        );
      });

      // Auto-sync language preference
      effect(() => {
        localStorage.setItem("pokemon-language", this.#state.language);
      });
    })[1];

    // Event handlers
    const prev = () => {
      if (this.#state.pokemonId > 1) {
        this.#state.pokemonId--;
        this.fetchPokemon();
      }
    };

    const next = () => {
      this.#state.pokemonId++;
      this.fetchPokemon();
    };

    const random = () => {
      this.#state.pokemonId = Math.floor(Math.random() * 1025) + 1;
      this.fetchPokemon();
    };

    const toggleShiny = () => {
      this.#state.shiny = !this.#state.shiny;
    };

    const playCry = () => {
      const cryUrl = this.#state.pokemon?.cries?.latest;
      if (cryUrl) {
        if (this.#audio) {
          this.#audio.pause();
        }
        this.#audio = new Audio(cryUrl);
        this.#audio.volume = 0.3;
        this.#audio.play();
      }
    };

    const toggleFavorite = () => {
      const pokemon = this.#state.pokemon;
      if (!pokemon) return;

      const index = this.#state.favorites.findIndex((f) => f.id === pokemon.id);
      if (index >= 0) {
        this.#state.favorites = this.#state.favorites.filter(
          (f) => f.id !== pokemon.id,
        );
      } else {
        this.#state.favorites = [
          ...this.#state.favorites,
          {
            id: pokemon.id,
            name: pokemon.name,
            sprite: pokemon.sprites.front_default,
          },
        ];
      }
      // localStorage sync happens automatically via effect()
    };

    const selectFavorite = (fav: FavoritePokemon) => {
      this.#state.pokemonId = fav.id;
      this.fetchPokemon();
    };

    const removeFavorite = (fav: FavoritePokemon, e: Event) => {
      e.stopPropagation();
      this.#state.favorites = this.#state.favorites.filter(
        (f) => f.id !== fav.id,
      );
      // localStorage sync happens automatically via effect()
    };

    const onSearchInput = (e: Event) => {
      const query = (e.target as HTMLInputElement).value;
      this.#state.searchQuery = query;

      if (this.#searchTimeout) {
        clearTimeout(this.#searchTimeout);
      }

      if (query.length >= 2) {
        this.#searchTimeout = setTimeout(() => this.searchPokemon(query), 300);
      } else {
        this.#state.searchResults = [];
      }
    };

    const selectSearchResult = (result: SearchResult) => {
      const id = parseInt(result.url.split("/").filter(Boolean).pop()!);
      this.#state.pokemonId = id;
      this.#state.searchQuery = "";
      this.#state.searchResults = [];
      // Clear the input element
      const input = this.querySelector<HTMLInputElement>(".search-box input");
      if (input) input.value = "";
      this.fetchPokemon();
    };

    const onLanguageChange = (e: Event) => {
      const lang = (e.target as HTMLSelectElement).value;
      this.#state.language = lang;
      // localStorage sync happens automatically via effect()
      // Refetch to get localized names
      this.fetchPokemon();
      if (this.#state.comparePokemon) {
        this.fetchLocalizedNames(this.#state.comparePokemon, true);
      }
    };

    const setComparePokemon = async () => {
      const randomId = Math.floor(Math.random() * 1025) + 1;
      const pokemon = await this.#pokemonService.fetchPokemon(randomId);
      if (pokemon) {
        this.#state.comparePokemon = pokemon;
        this.fetchLocalizedNames(pokemon, true);
      }
    };

    const toggleCompare = () => {
      this.#state.compareMode = !this.#state.compareMode;
      if (this.#state.compareMode) {
        // Auto-load a random Pokemon for comparison
        setComparePokemon();
      } else {
        this.#state.comparePokemon = null;
        this.#state.comparePokemonName = "";
        this.#state.compareTypeNames = [];
      }
    };

    const isFavorite = computed(() =>
      this.#state.favorites.some((f) => f.id === this.#state.pokemon?.id),
    );

    const { fragment, dispose } = html`
      <div class="pokemon-viewer">
        <div class="header">
          <h2>Pokemon Viewer</h2>
          <select class="language-select" @change=${onLanguageChange}>
            ${LANGUAGES.map(
              (lang) => html`
                <option
                  value=${lang.code}
                  .selected=${computed(
                    () => this.#state.language === lang.code,
                  )}
                >
                  ${lang.label}
                </option>
              `,
            )}
          </select>
        </div>

        <!-- Search Section -->
        ${SearchBox({
          searchQuery: this.#state.searchQuery,
          searchResults: this.#state.searchResults,
          onInput: onSearchInput,
          onSelectResult: selectSearchResult,
        })}

        <!-- Navigation Controls -->
        ${NavigationControls({
          pokemonId: this.#state.pokemonId,
          loading: this.#state.loading,
          onPrev: prev,
          onNext: next,
          onRandom: random,
        })}

        <!-- Error Message -->
        ${computed(() =>
          this.#state.error
            ? html`<div class="error">${this.#state.error}</div>`
            : null,
        )}

        <!-- Pokemon Card with Compare Panel -->
        <div
          class="pokemon-card-wrapper"
          style=${computed(() => (this.#state.error ? "display: none" : ""))}
        >
          ${computed(() =>
            PokemonCard({
              pokemon: this.#state.pokemon,
              pokemonName: this.#state.pokemonName,
              typeNames: this.#state.typeNames,
              shiny: this.#state.shiny,
              loading: this.#state.loading,
              showLoader: this.#state.showLoader,
              error: this.#state.error,
              isFavorite: isFavorite.value,
              compareMode: this.#state.compareMode,
              onToggleShiny: toggleShiny,
              onPlayCry: playCry,
              onToggleFavorite: toggleFavorite,
              onToggleCompare: toggleCompare,
              comparePokemonStats: this.#state.comparePokemon?.stats,
              comparePanel: this.#state.compareMode
                ? ComparePanel({
                    comparePokemon: this.#state.comparePokemon,
                    comparePokemonName: this.#state.comparePokemonName,
                    compareTypeNames: this.#state.compareTypeNames,
                    onShuffle: setComparePokemon,
                  })
                : undefined,
            }),
          )}
        </div>

        <!-- Favorites Section -->
        ${FavoritesList({
          favorites: this.#state.favorites,
          onSelectFavorite: selectFavorite,
          onRemoveFavorite: removeFavorite,
        })}
      </div>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
    this.fetchPokemon();
  }

  async searchPokemon(query: string) {
    const results = await this.#pokemonService.searchPokemon(query);
    this.#state.searchResults = results;
  }

  async fetchPokemon() {
    if (this.#loaderTimeout) {
      clearTimeout(this.#loaderTimeout);
    }

    this.#state.loading = true;
    this.#state.error = null;

    this.#loaderTimeout = setTimeout(() => {
      if (this.#state.loading) {
        this.#state.showLoader = true;
      }
    }, 300);

    try {
      const pokemon = await this.#pokemonService.fetchPokemon(
        this.#state.pokemonId,
      );
      if (!pokemon) {
        throw new Error(`Pokemon #${this.#state.pokemonId} not found`);
      }
      this.#state.pokemon = pokemon;

      // Fetch localized names
      this.fetchLocalizedNames(pokemon, false);
    } catch (e) {
      this.#state.error = e instanceof Error ? e.message : "Failed to fetch";
    } finally {
      if (this.#loaderTimeout) {
        clearTimeout(this.#loaderTimeout);
        this.#loaderTimeout = null;
      }
      this.#state.loading = false;
      this.#state.showLoader = false;
    }
  }

  async fetchLocalizedNames(pokemon: Pokemon, isCompare: boolean) {
    const lang = this.#state.language;

    const names = await this.#pokemonService.fetchLocalizedNames(pokemon, lang);

    if (isCompare) {
      this.#state.comparePokemonName = names.pokemonName;
      this.#state.compareTypeNames = names.typeNames;
    } else {
      this.#state.pokemonName = names.pokemonName;
      this.#state.typeNames = names.typeNames;
    }
  }

  disconnectedCallback() {
    if (this.#loaderTimeout) clearTimeout(this.#loaderTimeout);
    if (this.#searchTimeout) clearTimeout(this.#searchTimeout);
    if (this.#audio) this.#audio.pause();
    this.#disposeEffects?.();
    this.#dispose?.();
  }
}

customElements.define("x-pokemon-viewer", PokemonViewerElement);
