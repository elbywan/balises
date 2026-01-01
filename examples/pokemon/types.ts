/**
 * Pokemon Game Type Definitions
 *
 * Central type definitions for the Pokemon viewer and battle game.
 * Includes PokeAPI response types, game state interfaces, and battle mechanics.
 */

// ============================================================================
// POKEAPI RESPONSE TYPES
// ============================================================================

/** Pokemon data from the PokeAPI */
export interface Pokemon {
  id: number;
  name: string;
  displayName: string;
  localizedNames: Record<string, string>;
  sprites: {
    front_default: string;
    front_shiny: string;
    back_default?: string;
    back_shiny?: string;
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
  moves?: { move: { name: string; url: string } }[];
}

/** Pokemon species data for localized names */
export interface PokemonSpecies {
  names: { language: { name: string }; name: string }[];
}

/** Pokemon type data for localized names */
export interface TypeData {
  names: { language: { name: string }; name: string }[];
}

/** Move data from the PokeAPI */
export interface MoveData {
  names: { language: { name: string }; name: string }[];
}

// ============================================================================
// APP STATE TYPES
// ============================================================================

/** Saved favorite Pokemon */
export interface FavoritePokemon {
  id: number;
  name: string;
  sprite: string;
}

/** Search result from Pokemon name search */
export interface SearchResult {
  name: string;
  url: string;
}

/** Display info for a Pokemon type (key for styling, name for display) */
export interface TypeDisplay {
  key: string;
  name: string;
}

/** State for the Pokemon viewer/Pokedex UI (local to Pokedex component) */
export interface PokedexState {
  pokemonId: number;
  pokemon: Pokemon | null;
  pokemonName: string;
  typeNames: TypeDisplay[];
  loading: boolean;
  showLoader: boolean;
  error: string | null;
  shiny: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  compareMode: boolean;
  comparePokemon: Pokemon | null;
  comparePokemonName: string;
  compareTypeNames: TypeDisplay[];
}

/** Shared state across all tabs (favorites, language, roster) */
export interface SharedAppState {
  favorites: FavoritePokemon[];
  language: string;
  rosterIds: number[];
}

// ============================================================================
// BATTLE GAME TYPES
// ============================================================================

/** All Pokemon types */
export type PokemonType =
  | "normal"
  | "fire"
  | "water"
  | "electric"
  | "grass"
  | "ice"
  | "fighting"
  | "poison"
  | "ground"
  | "flying"
  | "psychic"
  | "bug"
  | "rock"
  | "ghost"
  | "dragon"
  | "dark"
  | "steel"
  | "fairy";

/** Set of valid Pokemon types for runtime validation */
const POKEMON_TYPES: ReadonlySet<string> = new Set<PokemonType>([
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
]);

/** Type guard for PokemonType */
export function isPokemonType(value: string): value is PokemonType {
  return POKEMON_TYPES.has(value);
}

/** Battle move definition */
export interface Move {
  name: string;
  displayName: string;
  localizedNames?: Record<string, string>;
  type: PokemonType;
  power: number;
  accuracy: number;
  pp: number;
  maxPp: number;
  category: "physical" | "special" | "status";
  effect?: MoveEffect;
}

/** Secondary effect that a move can apply */
export interface MoveEffect {
  type: "heal" | "stat_change" | "status_condition";
  target: "self" | "opponent";
  stat?: "attack" | "defense" | "speed";
  stages?: number;
  healPercent?: number;
  condition?: StatusCondition;
  chance?: number;
}

/** Status conditions that can affect Pokemon */
export type StatusCondition = "burn" | "paralyze" | "poison" | "sleep";

/** Pokemon prepared for battle with calculated stats and state */
export interface BattlePokemon {
  id: number;
  name: string;
  displayName: string;
  localizedNames: Record<string, string>;
  sprite: string;
  spriteBack: string | undefined;
  cryUrl: string | undefined;
  speciesUrl: string;
  types: PokemonType[];
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
    specialAttack: number;
    specialDefense: number;
    speed: number;
  };
  currentHp: number;
  maxHp: number;
  moves: Move[];
  level: number;
  statModifiers: {
    attack: number;
    defense: number;
    speed: number;
  };
  statusCondition: StatusCondition | null;
  sleepTurns?: number;
  isPlayer: boolean;
}

/** Entry in the battle log */
export interface BattleLogEntry {
  id: number;
  message: string;
  type: "action" | "damage" | "heal" | "effect" | "faint" | "info";
  timestamp: number;
}

/** Structured effect result for i18n translation */
export type EffectResultData =
  | { type: "heal"; pokemon: string }
  | {
      type: "stat_change";
      pokemon: string;
      stat: "attack" | "defense" | "speed";
      stages: number;
      changed: boolean;
    }
  | {
      type: "status_condition";
      pokemon: string;
      condition: StatusCondition;
    }
  | null;

/** Result of applying a move effect */
export interface EffectResult {
  effectApplied: boolean;
  data: EffectResultData;
}

/** Current phase of the battle */
export type BattlePhase =
  | "splash"
  | "team_select"
  | "battle"
  | "switching"
  | "game_over"
  | "victory";

/** Full battle game state */
export interface BattleState {
  phase: BattlePhase;
  playerTeam: BattlePokemon[];
  enemyTeam: BattlePokemon[];
  activePlayerPokemon: number;
  activeEnemyPokemon: number;
  battleLog: BattleLogEntry[];
  currentTurn: number;
  isPlayerTurn: boolean;
  isAnimating: boolean;
  selectedMove: number | null;
  winner: "player" | "enemy" | null;
  availablePokemon: Pokemon[];
  selectedForTeam: number[];
  teamSize: number;
  difficulty: "easy" | "normal" | "hard";
  actionMessage: string | null;
  actionMessageType: "action" | "damage" | "heal" | "effect" | "info" | null;
}
