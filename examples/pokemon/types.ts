export interface Pokemon {
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

export interface PokemonSpecies {
  names: { language: { name: string }; name: string }[];
}

export interface TypeData {
  names: { language: { name: string }; name: string }[];
}

export interface FavoritePokemon {
  id: number;
  name: string;
  sprite: string;
}

export interface Language {
  code: string;
  label: string;
}

export interface SearchResult {
  name: string;
  url: string;
}

export interface TypeDisplay {
  key: string;
  name: string;
}

export interface PokemonViewerState {
  pokemonId: number;
  pokemon: Pokemon | null;
  pokemonName: string;
  typeNames: TypeDisplay[];
  loading: boolean;
  showLoader: boolean;
  error: string | null;
  shiny: boolean;
  favorites: FavoritePokemon[];
  searchQuery: string;
  searchResults: SearchResult[];
  compareMode: boolean;
  comparePokemon: Pokemon | null;
  comparePokemonName: string;
  compareTypeNames: TypeDisplay[];
  language: string;
}
