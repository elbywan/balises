import { html, computed, store, each } from "../../src/index.js";

interface Pokemon {
  id: number;
  name: string;
  sprites: {
    front_default: string;
    front_shiny: string;
    other?: {
      "official-artwork"?: {
        front_default: string;
        front_shiny: string;
      };
    };
  };
  types: { type: { name: string; url: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
  height: number;
  weight: number;
  cries?: { latest?: string };
  species: { url: string };
}

interface PokemonSpecies {
  names: { language: { name: string }; name: string }[];
}

interface TypeData {
  names: { language: { name: string }; name: string }[];
}

interface FavoritePokemon {
  id: number;
  name: string;
  sprite: string;
}

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh-Hans", label: "中文" },
];

/** Get default language from browser, falling back to English */
function getDefaultLanguage(): string {
  const saved = localStorage.getItem("pokemon-language");
  if (saved) return saved;

  // Check browser language
  const browserLang = navigator.language.split("-")[0]; // "fr-FR" -> "fr"
  const supported = LANGUAGES.find((l) => l.code === browserLang);
  return supported ? supported.code : "en";
}

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
  #state = store(
    {
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
      searchResults: [] as { name: string; url: string }[],
      compareMode: false,
      comparePokemon: null as Pokemon | null,
      comparePokemonName: "",
      compareTypeNames: [] as { key: string; name: string }[],
      language: getDefaultLanguage(),
    },
    { batched: true },
  );

  #loaderTimeout: ReturnType<typeof setTimeout> | null = null;
  #searchTimeout: ReturnType<typeof setTimeout> | null = null;
  #dispose: (() => void) | null = null;
  #audio: HTMLAudioElement | null = null;

  connectedCallback() {
    // Load favorites from localStorage
    const saved = localStorage.getItem("pokemon-favorites");
    if (saved) {
      try {
        this.#state.favorites = JSON.parse(saved);
      } catch {
        // Ignore invalid JSON
      }
    }

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
      localStorage.setItem(
        "pokemon-favorites",
        JSON.stringify(this.#state.favorites),
      );
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
      localStorage.setItem(
        "pokemon-favorites",
        JSON.stringify(this.#state.favorites),
      );
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

    const selectSearchResult = (result: { name: string; url: string }) => {
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
      localStorage.setItem("pokemon-language", lang);
      // Refetch to get localized names
      this.fetchPokemon();
      if (this.#state.comparePokemon) {
        this.fetchLocalizedNames(this.#state.comparePokemon, true);
      }
    };

    const setComparePokemon = async () => {
      const randomId = Math.floor(Math.random() * 1025) + 1;
      try {
        const response = await fetch(
          `https://pokeapi.co/api/v2/pokemon/${randomId}`,
        );
        if (response.ok) {
          const pokemon = await response.json();
          this.#state.comparePokemon = pokemon;
          this.fetchLocalizedNames(pokemon, true);
        }
      } catch {
        // Ignore errors
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

    const spriteUrl = computed(() => {
      const pokemon = this.#state.pokemon;
      if (!pokemon) return "";
      const artwork = pokemon.sprites.other?.["official-artwork"];
      if (this.#state.shiny) {
        return artwork?.front_shiny || pokemon.sprites.front_shiny;
      }
      return artwork?.front_default || pokemon.sprites.front_default;
    });

    const totalStats = computed(
      () =>
        this.#state.pokemon?.stats.reduce((sum, s) => sum + s.base_stat, 0) ??
        0,
    );

    const renderType = (typeKey: string, displayName: string) => html`
      <span class="type-badge" data-type=${typeKey}>${displayName}</span>
    `;

    const renderStat = (
      stat: { base_stat: number; stat: { name: string } },
      compareStat?: number,
    ) => {
      const percentage = Math.min(stat.base_stat, 150) / 1.5;
      const hue = Math.min(stat.base_stat, 150) * 0.8;
      const diff = compareStat !== undefined ? stat.base_stat - compareStat : 0;
      return html`
        <div class="stat">
          <span class="stat-name">${stat.stat.name}</span>
          <div class="stat-bar">
            <div
              class="stat-fill"
              style="width: ${percentage}%; background: hsl(${hue}, 70%, 50%)"
            ></div>
          </div>
          <span class="stat-value">${stat.base_stat}</span>
          ${compareStat !== undefined
            ? html`<span
                class="stat-diff ${diff > 0
                  ? "positive"
                  : diff < 0
                    ? "negative"
                    : ""}"
                >${diff > 0 ? "+" : ""}${diff !== 0 ? diff : "="}</span
              >`
            : null}
        </div>
      `;
    };

    const renderFavorite = (fav: FavoritePokemon) => html`
      <div class="favorite-item" @click=${() => selectFavorite(fav)}>
        <img src=${fav.sprite} alt=${fav.name} />
        <span>${fav.name}</span>
        <button
          class="remove-btn"
          @click=${(e: Event) => removeFavorite(fav, e)}
        >
          ×
        </button>
      </div>
    `;

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
        <div class="search-section">
          <div class="search-box">
            <input
              type="search"
              placeholder="Search Pokemon..."
              @input=${onSearchInput}
              @search=${onSearchInput}
            />
            <div
              class="search-results"
              style=${computed(() =>
                this.#state.searchResults.length > 0 ? "" : "display: none",
              )}
            >
              ${computed(() =>
                this.#state.searchResults
                  .slice(0, 8)
                  .map(
                    (r) => html`
                      <div
                        class="search-result"
                        @click=${() => selectSearchResult(r)}
                      >
                        ${r.name}
                      </div>
                    `,
                  ),
              )}
            </div>
          </div>
        </div>

        <!-- Navigation Controls -->
        <div class="controls">
          <button
            @click=${prev}
            .disabled=${computed(
              () => this.#state.pokemonId <= 1 || this.#state.loading,
            )}
          >
            ←
          </button>
          <span class="pokemon-id"
            >#${computed(() =>
              String(this.#state.pokemonId).padStart(4, "0"),
            )}</span
          >
          <button
            @click=${next}
            .disabled=${computed(() => this.#state.loading)}
          >
            →
          </button>
          <button
            @click=${random}
            .disabled=${computed(() => this.#state.loading)}
          >
            Random
          </button>
        </div>

        <!-- Error Message -->
        ${computed(() =>
          this.#state.error
            ? html`<div class="error">${this.#state.error}</div>`
            : null,
        )}

        <!-- Pokemon Card -->
        <div
          class="pokemon-card"
          style=${computed(() => (this.#state.error ? "display: none" : ""))}
        >
          ${computed(() =>
            this.#state.showLoader
              ? html`<div class="loading-overlay">
                  <div class="spinner"></div>
                </div>`
              : null,
          )}

          <!-- Action Buttons -->
          <div class="action-buttons">
            <button class="icon-btn" @click=${toggleShiny} title="Toggle Shiny">
              ${computed(() => (this.#state.shiny ? "★" : "☆"))}
            </button>
            <button
              class="icon-btn"
              @click=${playCry}
              title="Play Cry"
              .disabled=${computed(() => !this.#state.pokemon?.cries?.latest)}
            >
              🔊
            </button>
            <button
              class="icon-btn ${computed(() =>
                isFavorite.value ? "active" : "",
              )}"
              @click=${toggleFavorite}
              title="Toggle Favorite"
            >
              ${computed(() => (isFavorite.value ? "❤️" : "🤍"))}
            </button>
            <button
              class="icon-btn"
              @click=${toggleCompare}
              title="Compare Mode"
            >
              ${computed(() => (this.#state.compareMode ? "📊" : "📈"))}
            </button>
          </div>

          <!-- Main Pokemon Display -->
          <div
            class="pokemon-display ${computed(() =>
              this.#state.compareMode ? "compare-mode" : "",
            )}"
          >
            <div class="pokemon-main">
              <img
                src=${spriteUrl}
                alt=${computed(
                  () =>
                    this.#state.pokemonName || this.#state.pokemon?.name || "",
                )}
                class=${computed(() => (this.#state.loading ? "faded" : ""))}
              />
              <h3>
                ${computed(
                  () =>
                    this.#state.pokemonName || this.#state.pokemon?.name || "",
                )}
                ${computed(() =>
                  this.#state.shiny
                    ? html`<span class="shiny-badge">✨</span>`
                    : null,
                )}
              </h3>
              <div class="types">
                ${computed(() =>
                  this.#state.typeNames.length > 0
                    ? this.#state.typeNames.map((t) =>
                        renderType(t.key, t.name),
                      )
                    : (this.#state.pokemon?.types ?? []).map((t) =>
                        renderType(t.type.name, t.type.name),
                      ),
                )}
              </div>
              <div class="measurements">
                <span
                  >📏
                  ${computed(() =>
                    this.#state.pokemon
                      ? (this.#state.pokemon.height / 10).toFixed(1)
                      : "—",
                  )}m</span
                >
                <span
                  >⚖️
                  ${computed(() =>
                    this.#state.pokemon
                      ? (this.#state.pokemon.weight / 10).toFixed(1)
                      : "—",
                  )}kg</span
                >
              </div>
            </div>

            <!-- Compare Pokemon (when in compare mode) -->
            ${computed(() =>
              this.#state.compareMode
                ? html`
                    <div class="pokemon-compare">
                      ${computed(() =>
                        this.#state.comparePokemon
                          ? html`
                              <button
                                class="shuffle-btn"
                                @click=${setComparePokemon}
                                title="Random Pokemon"
                              >
                                🔀
                              </button>
                              <img
                                src=${this.#state.comparePokemon.sprites
                                  .other?.["official-artwork"]?.front_default ||
                                this.#state.comparePokemon.sprites
                                  .front_default}
                                alt=${this.#state.comparePokemonName ||
                                this.#state.comparePokemon.name}
                              />
                              <h3>
                                ${computed(
                                  () =>
                                    this.#state.comparePokemonName ||
                                    this.#state.comparePokemon?.name ||
                                    "",
                                )}
                              </h3>
                              <div class="types">
                                ${computed(() =>
                                  this.#state.compareTypeNames.length > 0
                                    ? this.#state.compareTypeNames.map((t) =>
                                        renderType(t.key, t.name),
                                      )
                                    : (
                                        this.#state.comparePokemon?.types ?? []
                                      ).map((t) =>
                                        renderType(t.type.name, t.type.name),
                                      ),
                                )}
                              </div>
                            `
                          : html`<div class="compare-loading">Loading...</div>`,
                      )}
                    </div>
                  `
                : null,
            )}
          </div>

          <!-- Stats -->
          <div class="stats">
            <div class="stats-header">
              <span>Stats</span>
              <span class="total-stats">Total: ${totalStats}</span>
            </div>
            ${computed(() => {
              const stats = this.#state.pokemon?.stats ?? [];
              const compareStats = this.#state.comparePokemon?.stats;
              return stats.map((stat, i) =>
                renderStat(stat, compareStats?.[i]?.base_stat),
              );
            })}
          </div>
        </div>

        <!-- Favorites Section -->
        <div class="favorites-section">
          <h3>
            Favorites
            <span class="favorites-count"
              >(${computed(() => this.#state.favorites.length)})</span
            >
          </h3>
          ${computed(() =>
            this.#state.favorites.length === 0
              ? html`<p class="no-favorites">
                  No favorites yet. Click ❤️ to add!
                </p>`
              : null,
          )}
          <div class="favorites-list">
            ${each(
              () => this.#state.favorites,
              (fav) => fav.id,
              renderFavorite,
            )}
          </div>
        </div>
      </div>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
    this.fetchPokemon();
  }

  async searchPokemon(query: string) {
    try {
      const response = await fetch(
        "https://pokeapi.co/api/v2/pokemon?limit=1025",
      );
      if (response.ok) {
        const data = await response.json();
        this.#state.searchResults = data.results.filter((p: { name: string }) =>
          p.name.toLowerCase().includes(query.toLowerCase()),
        );
      }
    } catch {
      this.#state.searchResults = [];
    }
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
      const response = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${this.#state.pokemonId}`,
      );
      if (!response.ok) {
        throw new Error(`Pokemon #${this.#state.pokemonId} not found`);
      }
      const pokemon: Pokemon = await response.json();
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

    try {
      // Fetch species for localized Pokemon name
      const speciesRes = await fetch(pokemon.species.url);
      if (speciesRes.ok) {
        const species: PokemonSpecies = await speciesRes.json();
        const localizedName =
          species.names.find((n) => n.language.name === lang)?.name ??
          pokemon.name;

        if (isCompare) {
          this.#state.comparePokemonName = localizedName;
        } else {
          this.#state.pokemonName = localizedName;
        }
      }

      // Fetch localized type names
      const typeNames = await Promise.all(
        pokemon.types.map(async (t) => {
          const key = t.type.name;
          try {
            const typeRes = await fetch(t.type.url);
            if (typeRes.ok) {
              const typeData: TypeData = await typeRes.json();
              const name =
                typeData.names.find((n) => n.language.name === lang)?.name ??
                key;
              return { key, name };
            }
          } catch {
            // Ignore
          }
          return { key, name: key };
        }),
      );

      if (isCompare) {
        this.#state.compareTypeNames = typeNames;
      } else {
        this.#state.typeNames = typeNames;
      }
    } catch {
      // Fallback to English names
      if (isCompare) {
        this.#state.comparePokemonName = pokemon.name;
        this.#state.compareTypeNames = pokemon.types.map((t) => ({
          key: t.type.name,
          name: t.type.name,
        }));
      } else {
        this.#state.pokemonName = pokemon.name;
        this.#state.typeNames = pokemon.types.map((t) => ({
          key: t.type.name,
          name: t.type.name,
        }));
      }
    }
  }

  disconnectedCallback() {
    if (this.#loaderTimeout) clearTimeout(this.#loaderTimeout);
    if (this.#searchTimeout) clearTimeout(this.#searchTimeout);
    if (this.#audio) this.#audio.pause();
    this.#dispose?.();
  }
}

customElements.define("x-pokemon-viewer", PokemonViewerElement);
