import type { Pokemon, PokemonSpecies, TypeData } from "../types.js";

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
      return response.json();
    } catch {
      return null;
    }
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
