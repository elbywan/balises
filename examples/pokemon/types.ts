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

export interface PokemonSpecies {
  names: { language: { name: string }; name: string }[];
}

export interface TypeData {
  names: { language: { name: string }; name: string }[];
  damage_relations?: {
    double_damage_to: { name: string }[];
    half_damage_to: { name: string }[];
    no_damage_to: { name: string }[];
    double_damage_from: { name: string }[];
    half_damage_from: { name: string }[];
    no_damage_from: { name: string }[];
  };
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

// ========== BATTLE GAME TYPES ==========

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

export interface MoveData {
  names: { language: { name: string }; name: string }[];
}

export interface Move {
  name: string;
  displayName: string;
  /** Localized names keyed by language code (populated at runtime via API) */
  localizedNames?: Record<string, string>;
  type: PokemonType;
  power: number;
  accuracy: number;
  pp: number;
  maxPp: number;
  category: "physical" | "special" | "status";
  effect?: MoveEffect;
}

export interface MoveEffect {
  type: "heal" | "stat_change" | "status_condition";
  target: "self" | "opponent";
  stat?: "attack" | "defense" | "speed";
  stages?: number;
  healPercent?: number;
  condition?: "burn" | "paralyze" | "poison" | "sleep";
  chance?: number;
}

export interface BattlePokemon {
  id: number;
  name: string;
  displayName: string;
  /** Localized names keyed by language code */
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
  statusCondition: "burn" | "paralyze" | "poison" | "sleep" | null;
  sleepTurns?: number;
  isPlayer: boolean;
}

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
      condition: "burn" | "paralyze" | "poison" | "sleep";
    }
  | null;

export interface EffectResult {
  effectApplied: boolean;
  data: EffectResultData;
}

export type BattlePhase =
  | "splash"
  | "team_select"
  | "battle"
  | "switching"
  | "game_over"
  | "victory";

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
  /** Current action message to display as overlay */
  actionMessage: string | null;
  /** Type of action message for styling */
  actionMessageType: "action" | "damage" | "heal" | "effect" | "info" | null;
}
