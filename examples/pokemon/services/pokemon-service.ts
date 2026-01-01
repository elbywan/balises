import type { Pokemon, PokemonSpecies, TypeData, MoveData } from "../types.js";

// Cache for species data to avoid duplicate fetches
const speciesCache = new Map<string, PokemonSpecies>();
// Cache for move data to avoid duplicate fetches
const moveCache = new Map<string, MoveData>();

/**
 * Map our language codes to PokeAPI language codes
 * PokeAPI uses specific language codes that may differ from ours
 */
function mapLanguageCode(lang: string): string {
  // Most codes match directly, but add mappings here if needed
  const mapping: Record<string, string> = {
    // PokeAPI uses "zh-Hans" for Simplified Chinese
    "zh-Hans": "zh-Hans",
    "zh-Hant": "zh-Hant",
  };
  return mapping[lang] ?? lang;
}

/**
 * Service for fetching Pokemon data from PokeAPI
 */
export class PokemonService {
  private readonly BASE_URL = "https://pokeapi.co/api/v2";
  private readonly POKEMON_LIMIT = 1025;

  /**
   * Fetch a Pokemon by ID
   */
  async fetchPokemon(id: number): Promise<Pokemon | null> {
    try {
      const response = await fetch(`${this.BASE_URL}/pokemon/${id}`);
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      // Add display name and localized names map
      const displayName =
        data.name.charAt(0).toUpperCase() + data.name.slice(1);
      return {
        ...data,
        displayName,
        localizedNames: { en: displayName },
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch species data (cached)
   */
  async fetchSpecies(url: string): Promise<PokemonSpecies | null> {
    if (speciesCache.has(url)) {
      return speciesCache.get(url)!;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const species: PokemonSpecies = await response.json();
      speciesCache.set(url, species);
      return species;
    } catch {
      return null;
    }
  }

  /**
   * Get localized name from species for a specific language
   */
  async getLocalizedName(
    speciesUrl: string,
    language: string,
    fallback: string,
  ): Promise<string> {
    const species = await this.fetchSpecies(speciesUrl);
    if (!species) return fallback;

    const langCode = mapLanguageCode(language);
    const localizedName = species.names.find(
      (n) => n.language.name === langCode,
    )?.name;
    return localizedName ?? fallback;
  }

  /**
   * Fetch move data (cached)
   */
  async fetchMove(moveName: string): Promise<MoveData | null> {
    const url = `${this.BASE_URL}/move/${moveName}`;
    if (moveCache.has(url)) {
      return moveCache.get(url)!;
    }
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const move: MoveData = await response.json();
      moveCache.set(url, move);
      return move;
    } catch {
      return null;
    }
  }

  /**
   * Get localized move name for a specific language
   */
  async getMoveLocalizedName(
    moveName: string,
    language: string,
    fallback: string,
  ): Promise<string> {
    const move = await this.fetchMove(moveName);
    if (!move) return fallback;

    const langCode = mapLanguageCode(language);
    const localizedName = move.names.find(
      (n) => n.language.name === langCode,
    )?.name;
    return localizedName ?? fallback;
  }

  /**
   * Search Pokemon by name
   */
  async searchPokemon(query: string): Promise<{ name: string; url: string }[]> {
    try {
      const response = await fetch(
        `${this.BASE_URL}/pokemon?limit=${this.POKEMON_LIMIT}`,
      );
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.results.filter((p: { name: string }) =>
        p.name.toLowerCase().includes(query.toLowerCase()),
      );
    } catch {
      return [];
    }
  }

  /**
   * Fetch localized names for Pokemon and types
   */
  async fetchLocalizedNames(
    pokemon: Pokemon,
    language: string,
  ): Promise<{
    pokemonName: string;
    typeNames: { key: string; name: string }[];
  }> {
    const fallbackName = pokemon.name;

    try {
      // Fetch species for localized Pokemon name
      const speciesRes = await fetch(pokemon.species.url);
      let pokemonName = fallbackName;

      if (speciesRes.ok) {
        const species: PokemonSpecies = await speciesRes.json();
        pokemonName =
          species.names.find(
            (n: { language: { name: string }; name: string }) =>
              n.language.name === language,
          )?.name ?? fallbackName;
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
                typeData.names.find(
                  (n: { language: { name: string }; name: string }) =>
                    n.language.name === language,
                )?.name ?? key;
              return { key, name };
            }
          } catch {
            // Ignore
          }
          return { key, name: key };
        }),
      );

      return { pokemonName, typeNames };
    } catch {
      // Fallback to English names
      return {
        pokemonName: fallbackName,
        typeNames: pokemon.types.map((t) => ({
          key: t.type.name,
          name: t.type.name,
        })),
      };
    }
  }
}
